# Nami Transaction Tracking System - Makefile
# This Makefile provides convenient targets for development, testing, and deployment

.PHONY: help test test-integration test-unit test-isolated build run clean setup deps fmt fmt-backend fmt-frontend lint lint-backend lint-frontend docker-up docker-down docker-logs migrate db-reset demo backend frontend stop stop-backend stop-frontend install ci ci-backend ci-frontend monitoring monitoring-down monitoring-logs

# Default target
help: ## Show this help message
	@echo "Nami Transaction Tracking System"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development setup
setup: ## Set up the development environment (install dependencies, setup database)
	@echo "Setting up development environment..."
	@make install && make docker-up
	@echo "Development environment ready!"

install: ## Install all dependencies (Node packages)
	@echo "Installing Node dependencies..."
	@cd backend && npm install
	@cd frontend && npm install
	@cd ai-service && npm install
	@echo "Dependencies installed"


deps: install ## Alias for install

# Testing targets
test: test-isolated ## Run isolated frontend smoke tests

test-unit: ## Run backend unit tests
	@echo "Running backend unit tests..."
	@cd backend && npm test

# Isolated test environment (separate from main app)
test-isolated: test-setup test-isolated-run test-teardown   ## Run tests in isolated environment

test-setup: ## Set up isolated test environment (ports 3001/8001, database 5434)
	@echo "Setting up isolated test environment..."
	@./scripts/setup-test-env.sh
	@echo "Test environment ready (ports: frontend=3001, backend=8001, db=5434)"

test-isolated-run: ## Run the isolated e2e tests
	@echo "Running isolated e2e tests..."
	@echo "Ensuring test Postgres is up on :5434..."
	@docker-compose -f docker-compose.test.yml up -d postgres-test
	@sleep 3
	@echo "Starting test backend on :8001 in background..."
	@(cd backend && ../scripts/start-test-backend.sh) &
	@sleep 3
	@cd frontend && npm run test:e2e:isolated
	@echo "Isolated e2e tests completed"

test-teardown: ## Tear down isolated test environment and clean up resources
	@echo "Tearing down isolated test environment..."
	@docker-compose -f docker-compose.test.yml down
	@lsof -ti tcp:8001 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "backend" 2>/dev/null || true
	@lsof -ti tcp:3001 | xargs kill -TERM 2>/dev/null || true
	@echo "Test environment torn down and resources cleaned up"


# Building targets
build: build-backend build-frontend ## Build all components

build-backend: ## Build the TypeScript backend
	@echo "Building backend..."
	@cd backend && npm run build
	@echo "Backend built: backend/dist/"

build-frontend: ## Build the frontend for production
	@echo "Building frontend..."
	@cd frontend && npm run build
	@echo "Frontend built"

# Running targets
run: run-demo ## Run the full application (alias for run-demo)

run-demo: ## Run the full demo environment (database + backend + frontend)
	@echo "Starting full demo..."
	@make docker-up && sleep 2 && make run-dev

run-dev: ## Run both backend and frontend simultaneously (requires database)
	@echo "Starting backend and frontend..."
	@echo "Backend will be available at: http://localhost:8080"
	@echo "Frontend will be available at: http://localhost:3000"
	@echo "AI Service will be available at: http://localhost:8088"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@(cd backend && npm run dev) & (cd frontend && npm run dev) & (cd ai-service && npm run dev) & wait

run-dev-v2: ## Run both backend and frontend simultaneously (requires database)
	@echo "Starting backend and frontend..."
	@echo "Backend will be available at: http://localhost:8080"
	@echo "Frontend will be available at: http://localhost:3000"
	@echo "AI Service will be available at: http://localhost:8088"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@(cd backend && STORAGE_BACKEND=database npm run dev) & (cd frontend && npm run dev) & (cd ai-service && npm run dev) & wait


run-backend: ## Run only the backend server (requires database)
	@echo "Starting backend..."
	@cd backend && npm run dev

run-frontend: ## Run only the frontend (requires backend)
	@echo "Starting frontend..."
	@cd frontend && npm run dev

backend: run-backend ## Alias for run-backend
frontend: run-frontend ## Alias for run-frontend

# Stop targets
stop: ## Stop backend, frontend, and docker services
	@echo "Stopping all services..."
	@make stop-backend || true
	@make stop-frontend || true

stop-backend: ## Stop backend service
	@echo "Stopping backend..."
	@lsof -ti tcp:8080 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "backend/src/index.ts" 2>/dev/null || true
	@pkill -f "ts-node-dev" 2>/dev/null || true

stop-frontend: ## Stop frontend service
	@echo "Stopping frontend..."
	@lsof -ti tcp:3000 | xargs kill -TERM 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true

# Database targets
migrate: ## Run database migrations (not applicable for this project)
	@echo "No database migrations configured for this project"

db-reset: docker-down docker-up ## Reset database (stop, start)

docker-up: ## Start Docker services (PostgreSQL)
	@echo "Starting Docker services..."
	@docker-compose up -d
	@echo "Docker services started"

docker-down: ## Stop Docker services
	@echo "Stopping Docker services..."
	@docker-compose down
	@echo "Docker services stopped"

docker-logs: ## Show Docker service logs
	@docker-compose logs -f

# Code quality targets
fmt: fmt-backend fmt-frontend ## Format all code

fmt-backend: ## Format backend code
	@echo "Formatting backend code..."
	@cd backend && npx prettier --write "src/**/*.ts" 2>/dev/null || echo "Prettier not installed, skipping formatting"
	@echo "Backend code formatting completed"

fmt-frontend: ## Format frontend code
	@echo "Formatting frontend code..."
	@cd frontend && npm run lint:fix
	@echo "Frontend code formatted"

lint: lint-backend lint-frontend ## Run linters for both backend and frontend

lint-backend: ## Run backend linter (TypeScript compiler check)
	@echo "Running backend linter (TypeScript compiler)..."
	@cd backend && npm run build
	@echo "Backend linting completed"

lint-frontend: ## Run frontend linter (ESLint)
	@echo "Running frontend linter..."
	@cd frontend && npm run lint
	@echo "Frontend linting completed"

# CI/CD targets
ci: deps fmt lint test ## Run full CI pipeline (deps, format, lint, test)

ci-backend: deps fmt-backend lint-backend test-unit ## Run CI for backend only

ci-frontend: fmt-frontend lint-frontend test-isolated ## Run CI for frontend only

# Monitoring targets
monitoring: ## Start monitoring stack (Prometheus + Grafana)
	@echo "Starting monitoring stack..."
	@docker-compose --profile monitoring up -d prometheus grafana
	@echo "Monitoring stack started"
	@echo "Grafana: http://localhost:3001 (admin/admin or set GRAFANA_PASSWORD env)"
	@echo "Prometheus: http://localhost:9090"

monitoring-down: ## Stop monitoring stack
	@echo "Stopping monitoring stack..."
	@docker-compose --profile monitoring down
	@echo "Monitoring stack stopped"

monitoring-logs: ## Show monitoring stack logs
	@docker-compose --profile monitoring logs -f
