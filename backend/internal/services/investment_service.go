package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"gorm.io/gorm"
)

type investmentService struct {
	investmentRepo  repositories.InvestmentRepository
	transactionRepo repositories.TransactionRepository
}

// NewInvestmentService creates a new investment service
func NewInvestmentService(investmentRepo repositories.InvestmentRepository, transactionRepo repositories.TransactionRepository) InvestmentService {
	return &investmentService{
		investmentRepo:  investmentRepo,
		transactionRepo: transactionRepo,
	}
}

// GetInvestments retrieves investments based on filter criteria
func (s *investmentService) GetInvestments(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error) {
	investments, err := s.investmentRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}
	for _, inv := range investments {
		inv.RealizedPnL = inv.PnL
		inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
	}
	return investments, nil
}

// GetInvestmentByID retrieves an investment by ID
func (s *investmentService) GetInvestmentByID(ctx context.Context, id string) (*models.Investment, error) {
	inv, err := s.investmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	inv.RealizedPnL = inv.PnL
	inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
	return inv, nil
}

// GetInvestmentSummary retrieves investment summary statistics
func (s *investmentService) GetInvestmentSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error) {
	return s.investmentRepo.GetSummary(ctx, filter)
}

// GetAvailableDeposits retrieves open investment positions for an asset/account
func (s *investmentService) GetAvailableDeposits(ctx context.Context, asset, account string) ([]*models.Investment, error) {
	isOpen := true
	return s.investmentRepo.GetByAssetAccount(ctx, asset, account, &isOpen)
}

// CreateDeposit creates a new investment from a deposit transaction
func (s *investmentService) CreateDeposit(ctx context.Context, tx *models.Transaction) (*models.Investment, error) {
	// Check if this is a deposit-type transaction
	if tx.Type != "deposit" && tx.Type != "stake" && tx.Type != "buy" {
		return nil, fmt.Errorf("transaction type must be deposit, stake, or buy")
	}

	// Check if an investment already exists for this asset/account/date combination
	existingInvestments, err := s.investmentRepo.GetByAssetAccount(ctx, tx.Asset, tx.Account, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing investments: %w", err)
	}

	// Look for an existing open investment with the same horizon
	var targetInvestment *models.Investment
	for _, inv := range existingInvestments {
		if inv.IsOpen {
			// Check if horizons match or if one is nil
			horizonMatch := (inv.Horizon == nil && tx.Horizon == nil) ||
				(inv.Horizon != nil && tx.Horizon != nil && *inv.Horizon == *tx.Horizon)

			if horizonMatch {
				targetInvestment = inv
				break
			}
		}
	}

	// If no existing investment found, create a new one
	if targetInvestment == nil {
		targetInvestment = &models.Investment{
			ID:              uuid.New().String(),
			Asset:           tx.Asset,
			Account:         tx.Account,
			Horizon:         tx.Horizon,
			DepositDate:     tx.Date,
			DepositQty:      tx.Quantity,
			DepositCost:     tx.AmountUSD,
			DepositUnitCost: tx.AmountUSD.Div(tx.Quantity),
			WithdrawalQty:   decimal.Zero,
			WithdrawalValue: decimal.Zero,
			PnL:             decimal.Zero,
			PnLPercent:      decimal.Zero,
			IsOpen:          true,
			CostBasisMethod: models.CostBasisFIFO, // Default to FIFO
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		}

		// Set the investment ID in the transaction
		tx.InvestmentID = &targetInvestment.ID

		err := s.investmentRepo.Create(ctx, targetInvestment)
		if err != nil {
			return nil, fmt.Errorf("failed to create investment: %w", err)
		}
	} else {
		// Add to existing investment
		targetInvestment.AddDeposit(tx.Quantity, tx.AmountUSD)

		// Update the investment
		err := s.investmentRepo.Update(ctx, targetInvestment)
		if err != nil {
			return nil, fmt.Errorf("failed to update investment: %w", err)
		}

		// Set the investment ID in the transaction
		tx.InvestmentID = &targetInvestment.ID
	}

	// Create the transaction record
	err = s.transactionRepo.Create(ctx, tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create deposit transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	targetInvestment.RealizedPnL = targetInvestment.PnL
	targetInvestment.RemainingQty = targetInvestment.DepositQty.Sub(targetInvestment.WithdrawalQty)
	return targetInvestment, nil
}

// CreateWithdrawal creates a withdrawal transaction and updates the investment
func (s *investmentService) CreateWithdrawal(ctx context.Context, tx *models.Transaction) (*models.Investment, error) {
	// Check if this is a withdrawal-type transaction
	if tx.Type != "withdraw" && tx.Type != "unstake" && tx.Type != "sell" {
		return nil, fmt.Errorf("transaction type must be withdraw, unstake, or sell")
	}

	var targetInvestment *models.Investment
	var err error

	// Try to find investment by InvestmentID first
	if tx.InvestmentID != nil {
		targetInvestment, err = s.investmentRepo.GetByID(ctx, *tx.InvestmentID)
		if err != nil {
			return nil, fmt.Errorf("failed to find investment by ID: %w", err)
		}
	} else {
		// Find an open investment for this asset/account
		openInvestments, err := s.GetAvailableDeposits(ctx, tx.Asset, tx.Account)
		if err != nil {
			return nil, fmt.Errorf("failed to find available investments: %w", err)
		}

		if len(openInvestments) == 0 {
			return nil, fmt.Errorf("no open investment found for %s in %s", tx.Asset, tx.Account)
		}

		// Use the first available investment (could be enhanced to use specific cost basis method)
		targetInvestment = openInvestments[0]
		tx.InvestmentID = &targetInvestment.ID
	}

	// Process the withdrawal using the investment's cost basis method
	err = targetInvestment.AddWithdrawal(tx.Quantity, tx.AmountUSD)
	if err != nil {
		return nil, fmt.Errorf("failed to process withdrawal: %w", err)
	}

	// Auto-close if fully withdrawn or over-withdrawn
	remaining := targetInvestment.DepositQty.Sub(targetInvestment.WithdrawalQty)
	if remaining.LessThanOrEqual(decimal.Zero) {
		targetInvestment.IsOpen = false
		targetInvestment.UpdatePnL()
	}

	// Set the withdrawal date
	targetInvestment.WithdrawalDate = &tx.Date

	// Update the investment
	err = s.investmentRepo.Update(ctx, targetInvestment)
	if err != nil {
		return nil, fmt.Errorf("failed to update investment: %w", err)
	}

	// Create the transaction record
	err = s.transactionRepo.Create(ctx, tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create withdrawal transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	targetInvestment.RealizedPnL = targetInvestment.PnL
	targetInvestment.RemainingQty = remaining
	return targetInvestment, nil
}

// ProcessStake processes a stake transaction and updates or creates an investment
func (s *investmentService) ProcessStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error) {
	if stakeTx.Type != models.ActionStake {
		return nil, fmt.Errorf("transaction type must be '%s', got %s", models.ActionStake, stakeTx.Type)
	}

	var investment *models.Investment
	var err error

	// Ensure derived amounts (AmountUSD, AmountLocal, DeltaQty, CashFlow) are computed
	if err := stakeTx.PreSave(); err != nil {
		return nil, fmt.Errorf("invalid stake transaction: %w", err)
	}

	if stakeTx.InvestmentID != nil {
		// Try to find investment by InvestmentID first
		investment, err = s.investmentRepo.GetByID(ctx, *stakeTx.InvestmentID)
		if err != nil {
			return nil, fmt.Errorf("failed to find investment by ID: %w", err)
		}
	} else {
		// Find open investment for this asset/account/horizon (allow nil horizon)
		horizon := ""
		if stakeTx.Horizon != nil {
			horizon = *stakeTx.Horizon
		}
		investment, err = s.investmentRepo.FindOpenInvestmentForStake(ctx, stakeTx.Asset, stakeTx.Account, horizon)
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("failed to find investment for stake: %w", err)
		}
	}

	if investment == nil {
		// Create a new investment
		investment, err = s.investmentRepo.CreateFromStake(ctx, stakeTx)
		if err != nil {
			return nil, fmt.Errorf("failed to create investment from stake: %w", err)
		}
	} else {
		// Update the existing investment
		err = s.investmentRepo.UpdateWithStake(ctx, investment, stakeTx)
		if err != nil {
			return nil, fmt.Errorf("failed to update investment with stake: %w", err)
		}
	}

	// Create the stake transaction and link it to the investment
	stakeTx.InvestmentID = &investment.ID
	err = s.transactionRepo.Create(ctx, stakeTx)
	if err != nil {
		return nil, fmt.Errorf("failed to create stake transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	investment.RealizedPnL = investment.PnL
	investment.RemainingQty = investment.DepositQty.Sub(investment.WithdrawalQty)
	return investment, nil
}

// ProcessUnstake processes an unstake transaction and updates the corresponding investment
func (s *investmentService) ProcessUnstake(ctx context.Context, unstakeTx *models.Transaction) (*models.Investment, error) {
	if unstakeTx.Type != "unstake" {
		return nil, fmt.Errorf("transaction type must be 'unstake', got %s", unstakeTx.Type)
	}

	var investment *models.Investment
	var err error

	if unstakeTx.InvestmentID == nil {
		return nil, fmt.Errorf("investment ID is required for unstake transactions")
	}

	// Ensure derived amounts (AmountUSD, AmountLocal, DeltaQty, CashFlow) are computed
	if err := unstakeTx.PreSave(); err != nil {
		return nil, fmt.Errorf("invalid unstake transaction: %w", err)
	}
	// Try to find investment by InvestmentID first
	investment, err = s.investmentRepo.GetByID(ctx, *unstakeTx.InvestmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to find investment by ID: %w", err)
	}

	// Update investment with unstake
	err = s.investmentRepo.UpdateWithUnstake(ctx, investment, unstakeTx)
	if err != nil {
		return nil, fmt.Errorf("failed to update investment with unstake: %w", err)
	}

	// Auto-close if fully withdrawn or over-withdrawn
	remaining := investment.DepositQty.Sub(investment.WithdrawalQty)
	if remaining.LessThanOrEqual(decimal.Zero) && investment.IsOpen {
		investment.IsOpen = false
		investment.UpdatePnL()
		if err := s.investmentRepo.Update(ctx, investment); err != nil {
			return nil, fmt.Errorf("failed to update investment status: %w", err)
		}
	}

	// Create the unstake transaction
	err = s.transactionRepo.Create(ctx, unstakeTx)
	if err != nil {
		return nil, fmt.Errorf("failed to create unstake transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	investment.RealizedPnL = investment.PnL
	investment.RemainingQty = remaining
	return investment, nil
}

// GetOpenInvestmentsForStake retrieves open investments for stake operations
func (s *investmentService) GetOpenInvestmentsForStake(ctx context.Context, asset, account, horizon string) ([]*models.Investment, error) {
	investment, err := s.investmentRepo.FindOpenInvestmentForStake(ctx, asset, account, horizon)
	if err != nil {
		return nil, fmt.Errorf("failed to find open investments: %w", err)
	}

	if investment == nil {
		return []*models.Investment{}, nil
	}

	return []*models.Investment{investment}, nil
}

// CloseInvestment marks an investment as closed and finalizes realized PnL.
func (s *investmentService) CloseInvestment(ctx context.Context, id string) (*models.Investment, error) {
	inv, err := s.investmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !inv.IsOpen {
		return inv, nil
	}
	// Mark closed; when closed, PnL represents realized PnL based on withdrawals
	inv.IsOpen = false
	now := time.Now()
	if inv.WithdrawalDate == nil {
		inv.WithdrawalDate = &now
	}
	// Recompute PnL in closed state
	inv.UpdatePnL()
	if err := s.investmentRepo.Update(ctx, inv); err != nil {
		return nil, err
	}
	inv.RealizedPnL = inv.PnL
	inv.RemainingQty = inv.DepositQty.Sub(inv.WithdrawalQty)
	return inv, nil
}

// DeleteInvestment deletes an investment and all transactions referencing it
func (s *investmentService) DeleteInvestment(ctx context.Context, id string) error {
	// Ensure investment exists
	if _, err := s.investmentRepo.GetByID(ctx, id); err != nil {
		return err
	}

	// List all transactions linked to this investment and delete them in bulk
	filter := &models.TransactionFilter{InvestmentID: &id}
	txs, err := s.transactionRepo.List(ctx, filter)
	if err != nil {
		return fmt.Errorf("failed to list transactions for investment: %w", err)
	}
	if len(txs) > 0 {
		ids := make([]string, 0, len(txs))
		for _, t := range txs {
			if t != nil && t.ID != "" {
				ids = append(ids, t.ID)
			}
		}
		if len(ids) > 0 {
			if _, err := s.transactionRepo.DeleteMany(ctx, ids); err != nil {
				return fmt.Errorf("failed to delete transactions for investment: %w", err)
			}
		}
	}

	// Finally delete the investment itself
	if err := s.investmentRepo.Delete(ctx, id); err != nil {
		return err
	}
	return nil
}
