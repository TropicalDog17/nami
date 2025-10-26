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
	investmentRepo repositories.InvestmentRepository
	transactionSvc TransactionService
}

// NewInvestmentService creates a new investment service
func NewInvestmentService(investmentRepo repositories.InvestmentRepository, transactionSvc TransactionService) InvestmentService {
	return &investmentService{
		investmentRepo: investmentRepo,
		transactionSvc: transactionSvc,
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
		// Compute APR for ended vaults: annualized return based on realized PnL over holding period
		if inv.IsVault && !inv.IsOpen && inv.VaultEndedAt != nil {
			days := inv.VaultEndedAt.Sub(inv.DepositDate).Hours() / 24
			if days > 0 && !inv.DepositCost.IsZero() {
				roi := inv.PnL.Div(inv.DepositCost) // decimal
				apr := roi.Mul(decimal.NewFromFloat(365.0 / days)).Mul(decimal.NewFromInt(100))
				inv.APRPercent = apr
			}
		}
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
	if inv.IsVault && !inv.IsOpen && inv.VaultEndedAt != nil {
		days := inv.VaultEndedAt.Sub(inv.DepositDate).Hours() / 24
		if days > 0 && !inv.DepositCost.IsZero() {
			roi := inv.PnL.Div(inv.DepositCost)
			apr := roi.Mul(decimal.NewFromFloat(365.0 / days)).Mul(decimal.NewFromInt(100))
			inv.APRPercent = apr
		}
	}
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
	err = s.transactionSvc.CreateTransaction(ctx, tx)
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

	// Set the withdrawal date
	targetInvestment.WithdrawalDate = &tx.Date

	// Update the investment
	err = s.investmentRepo.Update(ctx, targetInvestment)
	if err != nil {
		return nil, fmt.Errorf("failed to update investment: %w", err)
	}

	// Create the transaction record
	err = s.transactionSvc.CreateTransaction(ctx, tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create withdrawal transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	targetInvestment.RealizedPnL = targetInvestment.PnL
	targetInvestment.RemainingQty = targetInvestment.DepositQty.Sub(targetInvestment.WithdrawalQty)
	return targetInvestment, nil
}

// ProcessStake processes a stake transaction and updates or creates an investment
func (s *investmentService) ProcessStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error) {
	if stakeTx.Type != models.ActionStake {
		return nil, fmt.Errorf("transaction type must be '%s', got %s", models.ActionStake, stakeTx.Type)
	}

	var investment *models.Investment
	var err error

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
	err = s.transactionSvc.CreateTransaction(ctx, stakeTx)
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

	// Create the unstake transaction
	err = s.transactionSvc.CreateTransaction(ctx, unstakeTx)
	if err != nil {
		return nil, fmt.Errorf("failed to create unstake transaction: %w", err)
	}

	// Populate derived realized PnL before returning
	investment.RealizedPnL = investment.PnL
	investment.RemainingQty = investment.DepositQty.Sub(investment.WithdrawalQty)
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

// Vault-specific service methods

// CreateVault creates a new vault with the given parameters
func (s *investmentService) CreateVault(ctx context.Context, name, asset, account string, initialDeposit decimal.Decimal, horizon string) (*models.Investment, error) {
	// Check if vault with same name already exists
	existingVault, err := s.investmentRepo.GetVaultByName(ctx, name)
	if err == nil && existingVault != nil {
		return nil, fmt.Errorf("vault with name '%s' already exists", name)
	}

	// Create new vault
	vault := &models.Investment{
		ID:              uuid.New().String(),
		Asset:           asset,
		Account:         account,
		VaultName:       &name,
		DepositDate:     time.Now(),
		DepositQty:      initialDeposit,
		DepositCost:     initialDeposit,        // Assuming 1:1 for simplicity, can be enhanced later
		DepositUnitCost: decimal.NewFromInt(1), // Assuming 1:1 for simplicity
		WithdrawalQty:   decimal.Zero,
		WithdrawalValue: decimal.Zero,
		PnL:             decimal.Zero,
		PnLPercent:      decimal.Zero,
		IsOpen:          true,
		IsVault:         true,
		CostBasisMethod: models.CostBasisFIFO,
	}

	if horizon != "" {
		vault.Horizon = &horizon
	}

	err = s.investmentRepo.CreateVault(ctx, vault)
	if err != nil {
		return nil, fmt.Errorf("failed to create vault: %w", err)
	}

	// Populate derived fields before returning
	vault.RealizedPnL = vault.PnL
	vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
	return vault, nil
}

// GetActiveVaults returns all active vaults
func (s *investmentService) GetActiveVaults(ctx context.Context) ([]*models.Investment, error) {
	vaults, err := s.investmentRepo.GetActiveVaults(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get active vaults: %w", err)
	}

	// Populate derived fields
	for _, vault := range vaults {
		vault.RealizedPnL = vault.PnL
		vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
		// APR only for ended vaults
	}

	return vaults, nil
}

// GetVaultByName retrieves a vault by name
func (s *investmentService) GetVaultByName(ctx context.Context, name string) (*models.Investment, error) {
	vault, err := s.investmentRepo.GetVaultByName(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("failed to get vault: %w", err)
	}

	// Populate derived fields before returning
	vault.RealizedPnL = vault.PnL
	vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
	if vault.IsVault && !vault.IsOpen && vault.VaultEndedAt != nil {
		days := vault.VaultEndedAt.Sub(vault.DepositDate).Hours() / 24
		if days > 0 && !vault.DepositCost.IsZero() {
			roi := vault.PnL.Div(vault.DepositCost)
			apr := roi.Mul(decimal.NewFromFloat(365.0 / days)).Mul(decimal.NewFromInt(100))
			vault.APRPercent = apr
		}
	}
	return vault, nil
}

// DepositToVault adds a deposit to an existing vault
func (s *investmentService) DepositToVault(ctx context.Context, vaultName string, depositQty, depositCost decimal.Decimal, sourceAccount string) (*models.Investment, error) {
	vault, err := s.investmentRepo.GetVaultByName(ctx, vaultName)
	if err != nil {
		return nil, fmt.Errorf("failed to find vault: %w", err)
	}

	if !vault.IsVaultActive() {
		return nil, fmt.Errorf("vault '%s' is not active", vaultName)
	}

	// Create deposit transaction (use existing transaction type)
	depositTx := &models.Transaction{
		ID:           uuid.New().String(),
		Type:         "stake", // Use stake for deposits to vault
		Asset:        vault.Asset,
		Account:      sourceAccount,
		Quantity:     depositQty,
		AmountUSD:    depositCost,
		Date:         time.Now(),
		InvestmentID: &vault.ID,
	}

	err = s.transactionSvc.CreateTransaction(ctx, depositTx)
	if err != nil {
		return nil, fmt.Errorf("failed to create deposit transaction: %w", err)
	}

	// Update vault with deposit (blackbox approach - no validation)
	vault.VaultDeposit(depositQty, depositCost)

	err = s.investmentRepo.UpdateVault(ctx, vault)
	if err != nil {
		return nil, fmt.Errorf("failed to update vault: %w", err)
	}

	// Populate derived fields before returning
	vault.RealizedPnL = vault.PnL
	vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
	// No APR until ended
	return vault, nil
}

// WithdrawFromVault processes a withdrawal from a vault
func (s *investmentService) WithdrawFromVault(ctx context.Context, vaultName string, withdrawQty, withdrawValue decimal.Decimal, targetAccount string) (*models.Investment, error) {
	vault, err := s.investmentRepo.GetVaultByName(ctx, vaultName)
	if err != nil {
		return nil, fmt.Errorf("failed to find vault: %w", err)
	}

	if !vault.IsVaultActive() {
		return nil, fmt.Errorf("vault '%s' is not active", vaultName)
	}

	// Create withdrawal transaction
	withdrawalTx := &models.Transaction{
		ID:           uuid.New().String(),
		Type:         "unstake",
		Asset:        vault.Asset,
		Account:      targetAccount,
		Quantity:     withdrawQty,
		AmountUSD:    withdrawValue,
		Date:         time.Now(),
		InvestmentID: &vault.ID,
	}

	err = s.transactionSvc.CreateTransaction(ctx, withdrawalTx)
	if err != nil {
		return nil, fmt.Errorf("failed to create withdrawal transaction: %w", err)
	}

	// Update vault with withdrawal (blackbox approach - no validation)
	err = vault.VaultWithdrawal(withdrawQty, withdrawValue)
	if err != nil {
		return nil, fmt.Errorf("failed to process vault withdrawal: %w", err)
	}

	err = s.investmentRepo.UpdateVault(ctx, vault)
	if err != nil {
		return nil, fmt.Errorf("failed to update vault: %w", err)
	}

	// Populate derived fields before returning
	vault.RealizedPnL = vault.PnL
	vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
	// No APR until ended
	return vault, nil
}

// EndVault marks a vault as ended
func (s *investmentService) EndVault(ctx context.Context, vaultName string) (*models.Investment, error) {
	vault, err := s.investmentRepo.GetVaultByName(ctx, vaultName)
	if err != nil {
		return nil, fmt.Errorf("failed to find vault: %w", err)
	}

	if !vault.IsVaultActive() {
		return nil, fmt.Errorf("vault '%s' is not active", vaultName)
	}

	// Mark vault as ended
	vault.EndVault()

	err = s.investmentRepo.UpdateVault(ctx, vault)
	if err != nil {
		return nil, fmt.Errorf("failed to update vault: %w", err)
	}

	// Populate derived fields before returning
	vault.RealizedPnL = vault.PnL
	vault.RemainingQty = vault.DepositQty.Sub(vault.WithdrawalQty)
	if vault.IsVault && !vault.IsOpen && vault.VaultEndedAt != nil {
		days := vault.VaultEndedAt.Sub(vault.DepositDate).Hours() / 24
		if days > 0 && !vault.DepositCost.IsZero() {
			roi := vault.PnL.Div(vault.DepositCost)
			apr := roi.Mul(decimal.NewFromFloat(365.0 / days)).Mul(decimal.NewFromInt(100))
			vault.APRPercent = apr
		}
	}
	return vault, nil
}

// DeleteVault permanently deletes a vault
func (s *investmentService) DeleteVault(ctx context.Context, vaultName string) error {
	vault, err := s.investmentRepo.GetVaultByName(ctx, vaultName)
	if err != nil {
		return fmt.Errorf("failed to find vault: %w", err)
	}

	// For safety, only allow deletion of ended vaults
	if vault.IsVaultActive() {
		return fmt.Errorf("cannot delete active vault '%s'. End the vault first.", vaultName)
	}

	// Delete related transactions first to avoid foreign key constraint violations
	err = s.investmentRepo.DeleteTransactionsByInvestmentID(ctx, vault.ID)
	if err != nil {
		return fmt.Errorf("failed to delete related transactions: %w", err)
	}

	err = s.investmentRepo.DeleteVault(ctx, vault.ID)
	if err != nil {
		return fmt.Errorf("failed to delete vault: %w", err)
	}

	return nil
}
