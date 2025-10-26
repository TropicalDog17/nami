package integration

import (
	"context"
	"testing"

	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

// PnLTestSuite provides a test suite with all necessary services initialized for PnL testing
type PnLTestSuite struct {
	tdb               *testDB
	ctx               context.Context
	txService         services.TransactionService
	linkService       services.LinkService
	investmentRepo    repositories.InvestmentRepository
	transactionRepo   repositories.TransactionRepository
	investmentService services.InvestmentService
	actionService     services.ActionService
	reportingService  services.ReportingService
}

// NewPnLTestSuite creates a new test suite with all services initialized
func NewPnLTestSuite(t *testing.T) *PnLTestSuite {
	tdb := setupTestDB(t)
	ctx := context.Background()
	
	txService := services.NewTransactionService(tdb.database)
	linkService := services.NewLinkService(tdb.database)
	investmentRepo := repositories.NewInvestmentRepository(tdb.database)
	transactionRepo := repositories.NewTransactionRepository(tdb.database)
	investmentService := services.NewInvestmentService(investmentRepo, transactionRepo)
	actionService := services.NewActionServiceWithInvestments(tdb.database, txService, linkService, nil, investmentService)
	reportingService := services.NewReportingService(tdb.database)

	return &PnLTestSuite{
		tdb:               tdb,
		ctx:               ctx,
		txService:         txService,
		linkService:       linkService,
		investmentRepo:    investmentRepo,
		transactionRepo:   transactionRepo,
		investmentService: investmentService,
		actionService:     actionService,
		reportingService:  reportingService,
	}
}

// Cleanup cleans up the test suite resources
func (s *PnLTestSuite) Cleanup(t *testing.T) {
	s.tdb.cleanup(t)
}

// GetContext returns the test context
func (s *PnLTestSuite) GetContext() context.Context {
	return s.ctx
}

// GetActionService returns the action service
func (s *PnLTestSuite) GetActionService() services.ActionService {
	return s.actionService
}

// GetReportingService returns the reporting service
func (s *PnLTestSuite) GetReportingService() services.ReportingService {
	return s.reportingService
}

// GetInvestmentService returns the investment service
func (s *PnLTestSuite) GetInvestmentService() services.InvestmentService {
	return s.investmentService
}

// GetTransactionRepo returns the transaction repository
func (s *PnLTestSuite) GetTransactionRepo() repositories.TransactionRepository {
	return s.transactionRepo
}

// GetInvestmentRepo returns the investment repository
func (s *PnLTestSuite) GetInvestmentRepo() repositories.InvestmentRepository {
	return s.investmentRepo
}