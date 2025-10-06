package integration

import (
	"context"
	"testing"
	"time"

	"github.com/shopspring/decimal"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"
)

type stakeTestCase struct {
	name            string
	params          map[string]interface{}
	expectedTxCount int
	validations     func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService)
}

type unstakeTestCase struct {
	name            string
	params          map[string]interface{}
	expectedTxCount int
	setupStake      bool
	stakeAmount     float64
	validations     func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService, stakeResp *models.ActionResponse)
}

func TestActionService_Stake_TableDriven(t *testing.T) {
	testCases := []stakeTestCase{
		{
			name: "internal transfers zero cashflow",
			params: map[string]interface{}{
				"date":               time.Now().Format("2006-01-02"),
				"source_account":     "Binance Spot",
				"investment_account": "Binance Earn",
				"asset":              "USDT",
				"amount":             1000.0,
				"fee_percent":        0.8,
			},
			expectedTxCount: 3,
			validations: func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService) {
				var transferOut, depositLike, fee *models.Transaction
				for _, tx := range resp.Transactions {
					switch tx.Type {
					case "transfer_out":
						transferOut = tx
					case "deposit", "stake":
						depositLike = tx
					case "fee":
						fee = tx
					}
				}

				if transferOut == nil || depositLike == nil {
					t.Fatalf("missing transfer_out or stake/deposit in stake action result")
				}

				if transferOut.InternalFlow == nil || !*transferOut.InternalFlow {
					t.Fatalf("expected transfer_out to be marked internal")
				}
				if !transferOut.CashFlowUSD.Equal(decimal.Zero) || !transferOut.CashFlowVND.Equal(decimal.Zero) {
					t.Fatalf("expected transfer_out cashflow to be zero, got USD=%s VND=%s", transferOut.CashFlowUSD.String(), transferOut.CashFlowVND.String())
				}

				if depositLike.InternalFlow == nil || !*depositLike.InternalFlow {
					t.Fatalf("expected deposit to be marked internal")
				}
				if !depositLike.CashFlowUSD.Equal(decimal.Zero) || !depositLike.CashFlowVND.Equal(decimal.Zero) {
					t.Fatalf("expected deposit cashflow to be zero, got USD=%s VND=%s", depositLike.CashFlowUSD.String(), depositLike.CashFlowVND.String())
				}

				if fee == nil {
					t.Fatalf("expected a fee transaction to be created")
				}
				if !fee.CashFlowUSD.IsNegative() || !fee.CashFlowVND.IsNegative() {
					t.Fatalf("expected fee cashflow negative, got USD=%s VND=%s", fee.CashFlowUSD.String(), fee.CashFlowVND.String())
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tdb := setupTestDB(t)
			defer tdb.cleanup(t)

			ctx := context.Background()
			txService := services.NewTransactionService(tdb.database)
			// Ensure investment service is provided (action service always non-nil investment service)
			invRepo := repositories.NewInvestmentRepository(tdb.database)
			txRepo := repositories.NewTransactionRepository(tdb.database)
			invSvc := services.NewInvestmentService(invRepo, txRepo)
			linkSvc := services.NewLinkService(tdb.database)
			svc := services.NewActionServiceWithInvestments(tdb.database, txService, linkSvc, nil, invSvc)

			req := &models.ActionRequest{
				Action: models.ActionStake,
				Params: tc.params,
			}

			resp, err := svc.Perform(ctx, req)
			if err != nil {
				t.Fatalf("stake action failed: %v", err)
			}
			if resp == nil || len(resp.Transactions) < tc.expectedTxCount {
				t.Fatalf("expected at least %d transactions from stake, got %d", tc.expectedTxCount, len(resp.Transactions))
			}

			if tc.validations != nil {
				tc.validations(t, resp, svc, txService)
			}
		})
	}
}

func TestActionService_Unstake_TableDriven(t *testing.T) {
	testCases := []unstakeTestCase{
		{
			name: "internal transfers zero cashflow",
			params: map[string]interface{}{
				"date":                time.Now().Format("2006-01-02"),
				"investment_account":  "Binance Earn",
				"destination_account": "Binance Spot",
				"asset":               "USDT",
				"amount":              500.0,
			},
			expectedTxCount: 2,
			setupStake:      true,
			stakeAmount:     500.0,
			validations: func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService, stakeResp *models.ActionResponse) {
				var withdrawLike, transferIn *models.Transaction
				for _, tx := range resp.Transactions {
					if tx.Type == "withdraw" || tx.Type == "unstake" {
						withdrawLike = tx
					}
					if tx.Type == "transfer_in" {
						transferIn = tx
					}
				}
				if withdrawLike == nil || transferIn == nil {
					t.Fatalf("missing withdraw or transfer_in in unstake action result")
				}

				if withdrawLike.InternalFlow == nil || !*withdrawLike.InternalFlow {
					t.Fatalf("expected withdraw to be marked internal")
				}
				if transferIn.InternalFlow == nil || !*transferIn.InternalFlow {
					t.Fatalf("expected transfer_in to be marked internal")
				}
				if !transferIn.CashFlowUSD.Equal(decimal.Zero) || !transferIn.CashFlowVND.Equal(decimal.Zero) {
					t.Fatalf("expected transfer_in cashflow to be zero, got USD=%s VND=%s", transferIn.CashFlowUSD.String(), transferIn.CashFlowVND.String())
				}
			},
		},
		{
			name: "with explicit amount and close_all",
			params: map[string]interface{}{
				"date":                time.Now().Format("2006-01-02"),
				"investment_account":  "Futures",
				"destination_account": "Binance Earn",
				"asset":               "USDT",
				"amount":              275.0,
				"close_all":           true,
				"stake_deposit_tx_id": "", // placeholder to be filled in during setup
			},
			expectedTxCount: 2,
			setupStake:      true,
			stakeAmount:     500.0,
			validations: func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService, stakeResp *models.ActionResponse) {
				var withdrawLike, transferIn *models.Transaction
				for _, tx := range resp.Transactions {
					if tx.Type == "withdraw" || tx.Type == "unstake" {
						withdrawLike = tx
					}
					if tx.Type == "transfer_in" {
						transferIn = tx
					}
				}

				if withdrawLike == nil || transferIn == nil {
					t.Fatal("expected both withdraw and transfer_in transactions")
				}

				expectedQty := "275"
				if withdrawLike.Quantity.String() != expectedQty {
					t.Errorf("expected withdraw quantity %s, got %s", expectedQty, withdrawLike.Quantity.String())
				}
				if transferIn.Quantity.String() != expectedQty {
					t.Errorf("expected transfer_in quantity %s, got %s", expectedQty, transferIn.Quantity.String())
				}

				expectedPrice := "1"
				if withdrawLike.PriceLocal.String() != expectedPrice {
					t.Errorf("expected withdraw price %s, got %s", expectedPrice, withdrawLike.PriceLocal.String())
				}
				if transferIn.PriceLocal.String() != expectedPrice {
					t.Errorf("expected transfer_in price %s, got %s", expectedPrice, transferIn.PriceLocal.String())
				}

				expectedAmountUSD := "275"
				if withdrawLike.AmountUSD.String() != expectedAmountUSD {
					t.Errorf("expected withdraw amount_usd %s, got %s", expectedAmountUSD, withdrawLike.AmountUSD.String())
				}
				if transferIn.AmountUSD.String() != expectedAmountUSD {
					t.Errorf("expected transfer_in amount_usd %s, got %s", expectedAmountUSD, transferIn.AmountUSD.String())
				}

				if transferIn.ExitDate == nil {
					t.Error("expected transfer_in to have exit_date set")
				}

				originalDeposit, err := txService.GetTransaction(context.Background(), stakeResp.Transactions[1].ID)
				if err != nil {
					t.Fatalf("failed to get original deposit: %v", err)
				}
				if originalDeposit.ExitDate == nil {
					t.Error("expected original deposit to have exit_date set when close_all is true")
				}
			},
		},
		{
			name: "PnL calculation",
			params: map[string]interface{}{
				"date":                "2025-02-01",
				"investment_account":  "Futures",
				"destination_account": "Binance Earn",
				"asset":               "USDT",
				"amount":              275.0,
				"exit_price_usd":      1.1,
				"stake_deposit_tx_id": "", // placeholder to be filled in during setup
			},
			expectedTxCount: 2,
			setupStake:      true,
			stakeAmount:     500.0,
			validations: func(t *testing.T, resp *models.ActionResponse, svc services.ActionService, txService services.TransactionService, stakeResp *models.ActionResponse) {
				var withdrawLike *models.Transaction
				for _, tx := range resp.Transactions {
					if tx.Type == "withdraw" || tx.Type == "unstake" {
						withdrawLike = tx
						break
					}
				}

				if withdrawLike == nil {
					t.Fatal("expected withdraw transaction")
				}

				expectedExitAmount := decimal.NewFromFloat(302.5)
				if !withdrawLike.AmountUSD.Equal(expectedExitAmount) {
					t.Errorf("expected withdraw amount_usd %s, got %s", expectedExitAmount.String(), withdrawLike.AmountUSD.String())
				}

				depositTxID := stakeResp.Transactions[1].ID
				depositTx, err := txService.GetTransaction(context.Background(), depositTxID)
				if err != nil {
					t.Fatalf("failed to get deposit transaction: %v", err)
				}

				expectedDepositAmount := decimal.NewFromFloat(500)
				if !depositTx.AmountUSD.Equal(expectedDepositAmount) {
					t.Errorf("expected deposit amount_usd %s, got %s", expectedDepositAmount.String(), depositTx.AmountUSD.String())
				}

				expectedPnL := decimal.NewFromFloat(27.5)
				depositUnitPrice := depositTx.AmountUSD.Div(depositTx.Quantity)
				withdrawUnitPrice := withdrawLike.AmountUSD.Div(withdrawLike.Quantity)
				calculatedPnL := withdrawLike.Quantity.Mul(withdrawUnitPrice.Sub(depositUnitPrice))

				if !calculatedPnL.Equal(expectedPnL) {
					t.Errorf("expected PnL %s, got %s", expectedPnL.String(), calculatedPnL.String())
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tdb := setupTestDB(t)
			defer tdb.cleanup(t)

			ctx := context.Background()
			txService := services.NewTransactionService(tdb.database)
			invRepo := repositories.NewInvestmentRepository(tdb.database)
			txRepo := repositories.NewTransactionRepository(tdb.database)
			invSvc := services.NewInvestmentService(invRepo, txRepo)
			linkService := services.NewLinkService(tdb.database)
			svc := services.NewActionServiceWithInvestments(tdb.database, txService, linkService, nil, invSvc)

			var stakeResp *models.ActionResponse
			if tc.setupStake {
				// Align stake to the target investment account for this test
				invAccount := tc.params["investment_account"].(string)
				stakeReq := &models.ActionRequest{
					Action: models.ActionStake,
					Params: map[string]interface{}{
						"date":               "2025-01-01",
						"source_account":     "Binance Spot",
						"investment_account": invAccount,
						"asset":              "USDT",
						"amount":             tc.stakeAmount,
					},
				}
				var err error
				stakeResp, err = svc.Perform(ctx, stakeReq)
				if err != nil {
					t.Fatalf("stake action failed: %v", err)
				}

				if _, ok := tc.params["stake_deposit_tx_id"]; ok {
					tc.params["stake_deposit_tx_id"] = stakeResp.Transactions[1].ID
				}
				// Always provide explicit investment_id for unstake routing
				if stakeResp.Transactions[1].InvestmentID != nil {
					tc.params["investment_id"] = *stakeResp.Transactions[1].InvestmentID
				}
			}

			req := &models.ActionRequest{
				Action: models.ActionUnstake,
				Params: tc.params,
			}

			resp, err := svc.Perform(ctx, req)
			if err != nil {
				t.Fatalf("unstake action failed: %v", err)
			}
			if resp == nil || len(resp.Transactions) != tc.expectedTxCount {
				t.Fatalf("expected %d transactions from unstake, got %d", tc.expectedTxCount, len(resp.Transactions))
			}

			if tc.validations != nil {
				tc.validations(t, resp, svc, txService, stakeResp)
			}
		})
	}
}
