package services

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
	"github.com/tropicaldog17/nami/internal/models"
)

// ---- Mocks for repositories and services used in unit tests ----

type mockTransactionService struct {
	created      []*models.Transaction
	batchCreated [][]*models.Transaction
	getByID      map[string]*models.Transaction
}

func (m *mockTransactionService) CreateTransaction(ctx context.Context, tx *models.Transaction) error {
	m.created = append(m.created, tx)
	if tx.ID == "" {
		tx.ID = "tx_mock"
	}
	return nil
}
func (m *mockTransactionService) CreateTransactionsBatch(ctx context.Context, txs []*models.Transaction, linkType string) ([]*models.Transaction, error) {
	m.batchCreated = append(m.batchCreated, txs)
	for i := range txs {
		if txs[i].ID == "" {
			txs[i].ID = "tx_mock_batch"
		}
	}
	return txs, nil
}
func (m *mockTransactionService) GetTransaction(ctx context.Context, id string) (*models.Transaction, error) {
	if m.getByID != nil {
		return m.getByID[id], nil
	}
	return &models.Transaction{ID: id}, nil
}
func (m *mockTransactionService) ListTransactions(ctx context.Context, filter *models.TransactionFilter) ([]*models.Transaction, error) {
	return nil, nil
}
func (m *mockTransactionService) UpdateTransaction(ctx context.Context, tx *models.Transaction) error {
	return nil
}
func (m *mockTransactionService) DeleteTransaction(ctx context.Context, id string) error { return nil }
func (m *mockTransactionService) DeleteTransactions(ctx context.Context, ids []string) (int, error) {
	return 0, nil
}
func (m *mockTransactionService) DeleteActionGroup(ctx context.Context, oneID string) (int, error) {
	return 0, nil
}
func (m *mockTransactionService) GetTransactionCount(ctx context.Context, filter *models.TransactionFilter) (int, error) {
	return 0, nil
}
func (m *mockTransactionService) GetTransactionsFXEnhanced(ctx context.Context, filter *models.TransactionFilter, targetCurrencies []string) ([]*models.TransactionWithFX, error) {
	return nil, nil
}
func (m *mockTransactionService) ExportTransactions(ctx context.Context) ([]*models.Transaction, error) {
	return nil, nil
}
func (m *mockTransactionService) ImportTransactions(ctx context.Context, txs []*models.Transaction, upsert bool) (int, error) {
	return 0, nil
}

type mockLinkService struct{}

func (m *mockLinkService) CreateLink(ctx context.Context, link *models.TransactionLink) error {
	return nil
}
func (m *mockLinkService) GetLinked(ctx context.Context, txID string) ([]*models.TransactionLink, error) {
	return nil, nil
}

type mockAssetPriceService struct{ price decimal.Decimal }

func (m *mockAssetPriceService) GetDaily(ctx context.Context, symbol, currency string, date time.Time) (*models.AssetPrice, error) {
	return &models.AssetPrice{Price: m.price}, nil
}
func (m *mockAssetPriceService) GetRange(ctx context.Context, symbol, currency string, start, end time.Time) ([]*models.AssetPrice, error) {
	return nil, nil
}
func (m *mockAssetPriceService) GetLatest(ctx context.Context, symbol, currency string) (*models.AssetPrice, error) {
	return &models.AssetPrice{Price: m.price}, nil
}

type mockInvestmentService struct{}

func (m *mockInvestmentService) GetInvestments(ctx context.Context, filter *models.InvestmentFilter) ([]*models.Investment, error) {
	return nil, nil
}
func (m *mockInvestmentService) GetInvestmentByID(ctx context.Context, depositID string) (*models.Investment, error) {
	return &models.Investment{ID: depositID}, nil
}
func (m *mockInvestmentService) GetInvestmentSummary(ctx context.Context, filter *models.InvestmentFilter) (*models.InvestmentSummary, error) {
	return nil, nil
}
func (m *mockInvestmentService) GetAvailableDeposits(ctx context.Context, asset, account string) ([]*models.Investment, error) {
	return nil, nil
}
func (m *mockInvestmentService) CreateDeposit(ctx context.Context, tx *models.Transaction) (*models.Investment, error) {
	return nil, nil
}
func (m *mockInvestmentService) CreateWithdrawal(ctx context.Context, tx *models.Transaction) (*models.Investment, error) {
	return nil, nil
}
func (m *mockInvestmentService) ProcessStake(ctx context.Context, stakeTx *models.Transaction) (*models.Investment, error) {
	return &models.Investment{ID: "inv1"}, nil
}
func (m *mockInvestmentService) ProcessUnstake(ctx context.Context, unstakeTx *models.Transaction) (*models.Investment, error) {
	return &models.Investment{ID: "inv1", DepositQty: decimal.NewFromInt(10), WithdrawalQty: decimal.NewFromInt(5)}, nil
}
func (m *mockInvestmentService) GetOpenInvestmentsForStake(ctx context.Context, asset, account, horizon string) ([]*models.Investment, error) {
	return nil, nil
}
func (m *mockInvestmentService) CloseInvestment(ctx context.Context, id string) (*models.Investment, error) {
	return &models.Investment{ID: id}, nil
}
func (m *mockInvestmentService) DeleteInvestment(ctx context.Context, id string) error { return nil }

type mockAIPendingRepo struct {
	item              *models.AIPendingAction
	setAcceptedCalled bool
	setRejectedCalled bool
}

func (m *mockAIPendingRepo) Create(ctx context.Context, a *models.AIPendingAction) error {
	m.item = a
	return nil
}
func (m *mockAIPendingRepo) GetByID(ctx context.Context, id string) (*models.AIPendingAction, error) {
	return m.item, nil
}
func (m *mockAIPendingRepo) List(ctx context.Context, status string, limit, offset int) ([]*models.AIPendingAction, error) {
	return []*models.AIPendingAction{m.item}, nil
}
func (m *mockAIPendingRepo) Update(ctx context.Context, a *models.AIPendingAction) error {
	m.item = a
	return nil
}
func (m *mockAIPendingRepo) SetAccepted(ctx context.Context, id string, createdTxIDs []string) error {
	m.setAcceptedCalled = true
	if m.item != nil {
		m.item.Status = "accepted"
		m.item.CreatedTxIDs = createdTxIDs
	}
	return nil
}
func (m *mockAIPendingRepo) SetRejected(ctx context.Context, id string, reason string) error {
	m.setRejectedCalled = true
	if m.item != nil {
		m.item.Status = "rejected"
		m.item.Error = &reason
	}
	return nil
}

type mockActionService struct{}

func (m *mockActionService) Perform(ctx context.Context, req *models.ActionRequest) (*models.ActionResponse, error) {
	return &models.ActionResponse{Action: req.Action, Transactions: []*models.Transaction{{ID: "t1"}}}, nil
}
