package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/tropicaldog17/nami/internal/db"
	"github.com/tropicaldog17/nami/internal/handlers"
	"github.com/tropicaldog17/nami/internal/services"
)

func main() {
	// Database connection
	config := db.NewConfig()
	database, err := db.Connect(config)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer database.Close()

	// Test database connection
	if err := database.Health(); err != nil {
		log.Fatal("Database health check failed:", err)
	}
	log.Println("Database connection established")

	// Initialize services
	transactionService := services.NewTransactionService(database)
	adminService := services.NewAdminService(database)
	reportingService := services.NewReportingService(database)

	// Initialize handlers
	transactionHandler := handlers.NewTransactionHandler(transactionService)
	adminHandler := handlers.NewAdminHandler(adminService)
	reportingHandler := handlers.NewReportingHandler(reportingService)

	// Setup HTTP server
	mux := http.NewServeMux()

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

	// Reporting endpoints
	mux.HandleFunc("/api/reports/holdings", reportingHandler.HandleHoldings)
	mux.HandleFunc("/api/reports/holdings/summary", reportingHandler.HandleHoldingsSummary)
	mux.HandleFunc("/api/reports/cashflow", reportingHandler.HandleCashFlow)
	mux.HandleFunc("/api/reports/spending", reportingHandler.HandleSpending)
	mux.HandleFunc("/api/reports/pnl", reportingHandler.HandlePnL)

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

	// Start server
	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsHandler(mux)))
}
