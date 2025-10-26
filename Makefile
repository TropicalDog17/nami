# Nami Transaction Tracking System - Makefile
# This Makefile provides convenient targets for development, testing, and deployment

.PHONY: help test test-integration test-unit test-isolated build run clean setup deps fmt lint docker-up docker-down docker-logs migrate db-reset demo backend frontend stop stop-backend stop-frontend install swagger swagger-install test-setup test-teardown clean-test-results

# Default target
help: ## Show this help message
	@echo "🚀 Nami Transaction Tracking System"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development setup
setup: ## Set up the development environment (install dependencies, setup database)
	@echo "🔧 Setting up development environment..."
	@make install && make docker-up && make migrate
	@echo "✅ Development environment ready!"

install: ## Install all dependencies (Go modules and Node packages)
	@echo "📦 Installing Go dependencies..."
	@cd backend && go mod download
	@cd backend/migrations && go mod download
	@echo "📦 Installing Node dependencies..."
	@cd frontend && npm install
	@echo "✅ Dependencies installed"

deps: install ## Alias for install

.PHONY: test-isolated-run
# Testing targets
test: VAULT_E2E=1
test: test-integration test-isolated ## Run integration tests and isolated frontend smoke

test-integration: ## Run Go integration tests with testcontainers
	@echo "🧪 Running Go integration tests with testcontainers..."
	@cd backend && go test -v ./tests/integration/ -timeout=10m

test-unit: ## Run Go unit tests
	@echo "🧪 Running Go unit tests..."
	@cd backend && go test -v ./... -short

# Isolated test environment (separate from main app)
test-isolated: test-teardown test-setup test-isolated-run test-teardown ## Run tests in isolated environment

test-setup: ## Set up isolated test environment (ports 3001/8001, database 5434)
	@echo "🚀 Setting up isolated test environment..."
	@./scripts/setup-test-env.sh
	@echo "✅ Test environment ready (ports: frontend=3001, backend=8001, db=5434)"

test-teardown: ## Tear down isolated test environment and clean up resources
	@echo "🧹 Tearing down isolated test environment..."
	@docker-compose -f docker-compose.test.yml down
    # kill backend and frontend
	@lsof -ti tcp:8001 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "cmd/server/main.go" 2>/dev/null || true
	@pkill -f "bin/nami-server" 2>/dev/null || true
	@lsof -ti tcp:3001 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true
	@echo "✅ Test environment torn down"

test-isolated-run: ## Run tests in isolated environment (requires test-setup first)
	@echo "🧪 Running tests in isolated environment..."
	@echo "🗄️  Running DB migrations for isolated DB..." && \
	cd backend/migrations && DB_HOST=localhost DB_PORT=5434 DB_NAME=nami_test DB_USER=nami_test_user DB_PASSWORD=nami_test_password DB_SSL_MODE=disable go run migrate.go && \
	cd ../.. && \
	cd backend && SERVER_PORT=8001 DB_HOST=localhost DB_PORT=5434 DB_NAME=nami_test DB_USER=nami_test_user DB_PASSWORD=nami_test_password DB_SSL_MODE=disable go run cmd/server/main.go > /tmp/test-backend.log 2>&1 & \
	sleep 1 && \
	( \
	  echo "⏳ Waiting for backend to be ready..."; \
	  for i in $$(seq 1 60); do \
	    if curl -sSf http://localhost:8001/health >/dev/null 2>&1; then \
	      echo "✅ Backend ready"; \
	      break; \
	    fi; \
	    sleep 1; \
	  done \
	) && \
	cd frontend && PORT=3001 VITE_API_BASE_URL=http://localhost:8001 npm run test:e2e:isolated && \
	cd .. && make test-teardown

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
	@make docker-up && sleep 2 && make run-dev

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
	@cd backend && go run cmd/server/main.go

run-frontend: ## Run only the frontend (requires backend)
	@echo "🚀 Starting frontend..."
	@cd frontend && npm run dev

backend: run-backend ## Alias for run-backend
frontend: run-frontend ## Alias for run-frontend

# Stop targets
stop: ## Stop backend, frontend, and docker services
	@echo "🛑 Stopping all services..."
	@make stop-backend || true
	@make stop-frontend || true

stop-backend: ## Stop backend service
	@echo "🛑 Stopping backend..."
	@lsof -ti tcp:8080 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "cmd/server/main.go" 2>/dev/null || true
	@pkill -f "bin/nami-server" 2>/dev/null || true

stop-frontend: ## Stop frontend service
	@echo "🛑 Stopping frontend..."
	@lsof -ti tcp:3000 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true

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
	@cd backend/migrations && go fmt ./...
	@echo "✅ Code formatted"

lint: ## Run Go linter
	@echo "🔍 Running Go linter..."
	@cd backend && go vet ./...
	@cd backend/migrations && go vet ./...
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
	@cd backend && go clean -testcache
	@cd frontend && rm -rf test-results/ playwright-report/
	@echo "✅ Test results cleaned"


# CI/CD targets
ci: deps fmt lint test ## Run full CI pipeline (deps, format, lint, test)

ci-backend: deps fmt lint test-integration test-unit ## Run CI for backend only

ci-frontend: test-isolated ## Run CI for frontend smoke tests only
