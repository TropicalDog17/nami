# Nami Transaction Tracking System - Makefile
# This Makefile provides convenient targets for development, testing, and deployment

.PHONY: help test test-integration test-e2e test-unit build run clean setup deps fmt lint docker-up docker-down docker-logs migrate db-reset demo backend frontend stop stop-backend stop-frontend install swagger swagger-install

# Default target
help: ## Show this help message
	@echo "🚀 Nami Transaction Tracking System"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development setup
setup: ## Set up the development environment (install dependencies, setup database)
	@echo "🔧 Setting up development environment..."
	@./demo.sh demo
	@echo "✅ Development environment ready!"

install: ## Install all dependencies (Go modules and Node packages)
	@echo "📦 Installing Go dependencies..."
	@cd backend && go mod download
	@cd migrations && go mod download
	@echo "📦 Installing Node dependencies..."
	@cd frontend && npm install
	@echo "✅ Dependencies installed"

deps: install ## Alias for install

# Testing targets
test: test-integration test-e2e ## Run all tests (integration + e2e)

test-integration: ## Run Go integration tests with testcontainers
	@echo "🧪 Running Go integration tests with testcontainers..."
	@cd backend && go test -v ./tests/integration/ -timeout=10m

test-unit: ## Run Go unit tests
	@echo "🧪 Running Go unit tests..."
	@cd backend && go test -v ./... -short

test-e2e: ## Run end-to-end tests (requires backend and frontend running)
	@echo "🧪 Running end-to-end tests..."
	@./run_tests.sh

# Building targets
build: build-backend build-frontend ## Build all components

build-backend: ## Build the Go backend
	@echo "🔨 Building backend..."
	@cd backend && go build -o ../bin/nami-server ./cmd/server
	@echo "✅ Backend built: bin/nami-server"

build-frontend: ## Build the frontend for production
	@echo "🔨 Building frontend..."
	@cd frontend && npm run build
	@echo "✅ Frontend built"

# Running targets
run: run-demo ## Run the full application (alias for run-demo)

run-demo: ## Run the full demo environment (database + backend + frontend)
	@echo "🚀 Starting full demo..."
	@./demo.sh demo

run-dev: ## Run both backend and frontend simultaneously (requires database)
	@echo "🚀 Starting backend and frontend..."
	@echo "Backend will be available at: http://localhost:8080"
	@echo "Frontend will be available at: http://localhost:3000"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@(cd backend && go run cmd/server/main.go) & (cd frontend && npm run dev) & wait

run-backend: ## Run only the backend server (requires database)
	@echo "🚀 Starting backend..."
	@./demo.sh backend

run-frontend: ## Run only the frontend (requires backend)
	@echo "🚀 Starting frontend..."
	@./demo.sh frontend

backend: run-backend ## Alias for run-backend
frontend: run-frontend ## Alias for run-frontend

# Stop targets
stop: ## Stop backend, frontend, and docker services
	@echo "🛑 Stopping all services..."
	@./demo.sh stop

stop-backend: ## Stop backend service
	@echo "🛑 Stopping backend..."
	@./demo.sh stop-backend

stop-frontend: ## Stop frontend service
	@echo "🛑 Stopping frontend..."
	@./demo.sh stop-frontend

# Database targets
migrate: ## Run database migrations
	@echo "🗄️ Running database migrations..."
	@cd backend/migrations && go run migrate.go
	@echo "✅ Migrations completed"

db-reset: docker-down docker-up migrate ## Reset database (stop, start, migrate)

docker-up: ## Start Docker services (PostgreSQL)
	@echo "🐳 Starting Docker services..."
	@docker-compose up -d
	@echo "✅ Docker services started"

docker-down: ## Stop Docker services
	@echo "🐳 Stopping Docker services..."
	@docker-compose down
	@echo "✅ Docker services stopped"

docker-logs: ## Show Docker service logs
	@docker-compose logs -f

# Code quality targets
fmt: ## Format Go code
	@echo "🎨 Formatting Go code..."
	@cd backend && go fmt ./...
	@cd migrations && go fmt ./...
	@echo "✅ Code formatted"

lint: ## Run Go linter
	@echo "🔍 Running Go linter..."
	@cd backend && go vet ./...
	@cd migrations && go vet ./...
	@echo "✅ Linting completed"

# Swagger/OpenAPI
swagger-install: ## Install swag CLI (OpenAPI generator)
	@echo "📦 Installing swag CLI..."
	@GOBIN="$(shell go env GOPATH)/bin" go install github.com/swaggo/swag/cmd/swag@latest
	@echo "✅ swag installed"

swagger: ## Generate Swagger docs (OpenAPI) under backend/docs
	@echo "📝 Generating Swagger docs..."
	@cd backend && "$(shell go env GOPATH)/bin/swag" init -g cmd/server/main.go -o docs --parseDependency --parseInternal
	@echo "✅ Swagger docs generated at backend/docs"

# Cleanup targets
clean: clean-build clean-test-results ## Clean build artifacts and test results

clean-build: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf bin/
	@cd frontend && npm run clean 2>/dev/null || true
	@echo "✅ Build artifacts cleaned"

clean-test-results: ## Clean test results and cache
	@echo "🧹 Cleaning test results..."
	@rm -rf test-results/
	@cd backend && go clean -testcache ./...
	@cd frontend && rm -rf test-results/ playwright-report/
	@echo "✅ Test results cleaned"

# Development workflow targets
dev: ## Start development environment (backend + frontend)
	@echo "🚀 Starting development environment..."
	@echo "Backend will be available at: http://localhost:8080"
	@echo "Frontend will be available at: http://localhost:3000"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@make docker-up && sleep 2 && make run-dev

test-dev: ## Run tests in development environment
	@echo "🧪 Running tests in development environment..."
	@./demo.sh test

# CI/CD targets
ci: deps fmt lint test ## Run full CI pipeline (deps, format, lint, test)

ci-backend: deps fmt lint test-integration test-unit ## Run CI for backend only

ci-frontend: test-e2e ## Run CI for frontend only
