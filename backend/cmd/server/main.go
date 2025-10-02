package main

// @title Nami Backend API
// @version 1.0
// @description API documentation for Nami Transaction Tracking System.
// @BasePath /api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/logger"
	"github.com/tropicaldog17/nami/internal/repositories"
	"github.com/tropicaldog17/nami/internal/services"

	// swagger docs and ui
	_swaggerHttp "github.com/swaggo/http-swagger"
	_ "github.com/tropicaldog17/nami/docs"

	"go.uber.org/zap"
)

func main() {
	// Load environment variables from .env file
	_ = godotenv.Load()

	// Initialize structured logger
	zl, err := logger.New()
	if err != nil {
		panic(err)
	}
	defer zl.Sync()
	sugar := zl.Sugar()

	// Database connection
	config := db.NewConfig()
	database, err := db.Connect(config)
	if err != nil {
		sugar.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Test database connection
	if err := database.Health(); err != nil {
		sugar.Fatalf("Database health check failed: %v", err)
	}
	sugar.Infow("Database connection established")

	// Initialize FX services (no mock fallback)
	fxCacheService := services.NewFXCacheService(database)
	httpFXProvider := services.NewHTTPFXProvider(os.Getenv("EXCHANGERATE_API_KEY"), fxCacheService)
	fxHistoryService := services.NewFXHistoryService(httpFXProvider, fxCacheService)

	// Asset price services (crypto)
	priceCacheService := services.NewPriceCacheService(database)
	coinGeckoProvider := services.NewCoinGeckoPriceProvider()
	assetPriceService := services.NewAssetPriceService(coinGeckoProvider, priceCacheService)
	priceMappingResolver := services.NewPriceMappingResolver(database)

	// Initialize repositories
	investmentRepo := repositories.NewInvestmentRepository(database)
	transactionRepo := repositories.NewTransactionRepository(database)

	// Initialize services
	transactionService := services.NewTransactionServiceWithFXAndPrices(database, httpFXProvider, assetPriceService)
	adminService := services.NewAdminService(database)
	reportingService := services.NewReportingService(database)
	linkService := services.NewLinkService(database)
	investmentService := services.NewInvestmentService(investmentRepo, transactionRepo)
	actionService := services.NewActionServiceWithInvestments(database, transactionService, linkService, assetPriceService, investmentService)

	// Initialize handlers
	transactionHandler := handlers.NewTransactionHandler(transactionService)
	adminHandler := handlers.NewAdminHandlerWithTx(adminService, transactionService)
	reportingHandler := handlers.NewReportingHandler(reportingService)
	actionHandler := handlers.NewActionHandler(actionService)
	fxHandler := handlers.NewFXHandler(fxHistoryService)
	priceHandler := handlers.NewPriceHandler(assetPriceService, priceMappingResolver, fxHistoryService)
	investmentHandler := handlers.NewInvestmentHandler(investmentService)

	// Setup HTTP server
	mux := http.NewServeMux()

	// Swagger UI: redirect base and serve docs
	mux.HandleFunc("/swagger", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger/index.html", http.StatusFound)
	})
	mux.Handle("/swagger/", _swaggerHttp.WrapHandler)

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "healthy",
			"service": "nami-backend",
		})
	})

	// API endpoints
	mux.HandleFunc("/api/transactions", transactionHandler.HandleTransactions)
	mux.HandleFunc("/api/transactions/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/transactions/") && len(strings.TrimPrefix(r.URL.Path, "/api/transactions/")) > 0 {
			transactionHandler.HandleTransaction(w, r)
		} else {
			transactionHandler.HandleTransactions(w, r)
		}
	})

	// Investment endpoints
	mux.HandleFunc("/api/investments", investmentHandler.HandleInvestments)
	mux.HandleFunc("/api/investments/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/investments/") && len(strings.TrimPrefix(r.URL.Path, "/api/investments/")) > 0 {
			// Handle individual investment (GET), stake (POST), unstake (POST)
			path := strings.TrimPrefix(r.URL.Path, "/api/investments/")
			if strings.HasSuffix(path, "/stake") {
				investmentHandler.HandleStake(w, r)
			} else if strings.HasSuffix(path, "/unstake") {
				investmentHandler.HandleUnstake(w, r)
			} else {
				investmentHandler.HandleInvestmentByID(w, r)
			}
		} else {
			investmentHandler.HandleInvestments(w, r)
		}
	})
	mux.HandleFunc("/api/investments/stake", investmentHandler.HandleStake)
	mux.HandleFunc("/api/investments/unstake", investmentHandler.HandleUnstake)
	mux.HandleFunc("/api/investments/available", investmentHandler.HandleAvailableInvestments)
	mux.HandleFunc("/api/investments/summary", investmentHandler.HandleInvestmentSummary)

	// Actions endpoint
	mux.HandleFunc("/api/actions", actionHandler.HandleActions)

	// Admin endpoints
	mux.HandleFunc("/api/admin/types", adminHandler.HandleTransactionTypes)
	mux.HandleFunc("/api/admin/types/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/types/") && len(strings.TrimPrefix(r.URL.Path, "/api/admin/types/")) > 0 {
			adminHandler.HandleTransactionType(w, r)
		} else {
			adminHandler.HandleTransactionTypes(w, r)
		}
	})

	mux.HandleFunc("/api/admin/accounts", adminHandler.HandleAccounts)
	mux.HandleFunc("/api/admin/accounts/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/accounts/") && len(strings.TrimPrefix(r.URL.Path, "/api/admin/accounts/")) > 0 {
			adminHandler.HandleAccount(w, r)
		} else {
			adminHandler.HandleAccounts(w, r)
		}
	})

	mux.HandleFunc("/api/admin/assets", adminHandler.HandleAssets)
	mux.HandleFunc("/api/admin/assets/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/assets/") && len(strings.TrimPrefix(r.URL.Path, "/api/admin/assets/")) > 0 {
			adminHandler.HandleAsset(w, r)
		} else {
			adminHandler.HandleAssets(w, r)
		}
	})

	mux.HandleFunc("/api/admin/tags", adminHandler.HandleTags)
	mux.HandleFunc("/api/admin/tags/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/tags/") && len(strings.TrimPrefix(r.URL.Path, "/api/admin/tags/")) > 0 {
			adminHandler.HandleTag(w, r)
		} else {
			adminHandler.HandleTags(w, r)
		}
	})

	// Maintenance endpoints
	mux.HandleFunc("/api/admin/maintenance/recalc-fx", adminHandler.HandleMaintenance)

	// Backup/Restore endpoints
	mux.HandleFunc("/api/admin/backup/transactions", adminHandler.HandleBackupTransactions)
	mux.HandleFunc("/api/admin/restore/transactions", adminHandler.HandleRestoreTransactions)

	// Reporting endpoints
	mux.HandleFunc("/api/reports/holdings", reportingHandler.HandleHoldings)
	mux.HandleFunc("/api/reports/holdings/summary", reportingHandler.HandleHoldingsSummary)
	mux.HandleFunc("/api/reports/cashflow", reportingHandler.HandleCashFlow)
	mux.HandleFunc("/api/reports/spending", reportingHandler.HandleSpending)
	mux.HandleFunc("/api/reports/pnl", reportingHandler.HandlePnL)
	mux.HandleFunc("/api/reports/borrows/outstanding", reportingHandler.HandleOutstandingBorrows)

	// FX endpoints
	mux.HandleFunc("/api/fx/history", fxHandler.HandleHistory)
	// Shortcut: usd-vnd last N days
	mux.HandleFunc("/api/fx/usd-vnd", fxHandler.HandleHistory)
	// Today's rate (fetch and store)
	mux.HandleFunc("/api/fx/today", fxHandler.HandleToday)

	// Asset prices
	mux.HandleFunc("/api/prices/daily", priceHandler.HandleDaily)

	// Crypto tokens management
	mux.HandleFunc("/api/admin/crypto/tokens", adminHandler.HandleCryptoTokens)

	// CORS middleware
	corsHandler := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// Get port from environment
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	// Start server with logging middleware and recovery
	logged := requestLogger(zl)(mux)
	server := http.Server{Addr: ":" + port, Handler: recovery(zl)(corsHandler(logged))}
	sugar.Infof("Server starting on port %s", port)
	if err := server.ListenAndServe(); err != nil {
		sugar.Fatalf("server error: %v", err)
	}
}

// requestLogger logs basic request info
func requestLogger(l *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			l.Info("request",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.String("remote", r.RemoteAddr),
				zap.String("agent", r.UserAgent()),
			)
			next.ServeHTTP(w, r)
		})
	}
}

// recovery recovers from panics and logs the error
func recovery(l *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					l.Error("panic recovered", zap.Any("error", rec))
					w.WriteHeader(http.StatusInternalServerError)
					_, _ = w.Write([]byte("internal server error"))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
