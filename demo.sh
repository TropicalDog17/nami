#!/bin/bash

# Nami Demo Script
# This script sets up and runs the Nami transaction tracking system for demo purposes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    if ! command -v go &> /dev/null; then
        print_error "Go is not installed. Please install Go 1.21+ first."
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        print_warning "Docker not found. Please ensure PostgreSQL is running on port 5433, or install Docker."
    fi

    print_success "Prerequisites check passed"
}

# Start PostgreSQL
start_database() {
    print_status "Starting PostgreSQL database..."

    if command -v docker &> /dev/null; then
        docker-compose up -d
        print_success "PostgreSQL started with Docker"
    else
        print_warning "Docker not available. Please ensure PostgreSQL is running manually."
    fi
}

# Run migrations
run_migrations() {
    print_status "Running database migrations..."

    cd migrations
    go run migrate.go
    cd ..
    print_success "Database migrations completed"
}

# Start backend
start_backend() {
    print_status "Starting backend server..."

    cd backend

    # Try to find Go and run the server
    if command -v go >/dev/null 2>&1; then
        print_status "Using system Go installation"
        # Start Go server in background
        go run cmd/server/main.go &
        BACKEND_PID=$!
    else
        print_error "Go command not found. Please ensure Go is installed and in PATH"
        print_error "You can install Go from: https://golang.org/dl/"
        print_error "Or run: brew install go"
        exit 1
    fi

    cd ..

    # Wait for backend to be ready
    print_status "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/health >/dev/null 2>&1; then
            print_success "Backend is ready on port 8080"
            return 0
        fi
        sleep 1
    done

    print_error "Backend failed to start within 30 seconds"
    exit 1
}

# Stop backend
stop_backend() {
    print_status "Stopping backend server..."

    # Try to kill by port 8080
    if command -v lsof >/dev/null 2>&1; then
        PIDS=$(lsof -ti tcp:8080 || true)
        if [ ! -z "$PIDS" ]; then
            kill $PIDS 2>/dev/null || true
        fi
    fi

    # Try to kill common backend processes
    pkill -f "go run cmd/server/main.go" 2>/dev/null || true
    pkill -f "/bin/nami-server" 2>/dev/null || true

    print_success "Backend stop signal sent"
}

# Start frontend
start_frontend() {
    print_status "Starting frontend server..."

    cd frontend

    # Check if Node.js and npm are available
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js not found. Please install Node.js 18+ from: https://nodejs.org/"
        print_error "Or run: brew install node"
        exit 1
    fi

    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm not found. Please install npm"
        exit 1
    fi

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        if ! npm install; then
            print_error "Failed to install npm dependencies"
            exit 1
        fi
    fi

    print_status "Starting development server..."
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    # Wait for frontend to be ready
    print_status "Waiting for frontend to be ready..."
    for i in {1..45}; do
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            print_success "Frontend is ready on port 3000"
            return 0
        fi
        sleep 1
    done

    print_error "Frontend failed to start within 45 seconds"
    exit 1
}

# Stop frontend
stop_frontend() {
    print_status "Stopping frontend server..."

    # Try to kill by port 3000
    if command -v lsof >/dev/null 2>&1; then
        PIDS=$(lsof -ti tcp:3000 || true)
        if [ ! -z "$PIDS" ]; then
            kill $PIDS 2>/dev/null || true
        fi
    fi

    # Try to kill common frontend processes
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true

    print_success "Frontend stop signal sent"
}

# Show demo information
show_demo_info() {
    echo ""
    print_success "🎉 Nami Demo is ready!"
    echo ""
    echo "📱 Frontend: http://localhost:3000"
    echo "🔧 Backend API: http://localhost:8080"
    echo "🗄️  Database: localhost:5433"
    echo ""
    echo "📋 Demo Workflow:"
    echo "1. Open http://localhost:3000 in your browser"
    echo "2. Navigate to Admin to configure master data"
    echo "3. Add some transactions on the Transactions page"
    echo "4. Check out the Reports section"
    echo ""
    echo "🛑 Press Ctrl+C to stop all services"
}

# Cleanup function
cleanup() {
    print_status "Stopping services..."

    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi

    if command -v docker &> /dev/null; then
        docker-compose down 2>/dev/null || true
    fi

    print_success "Demo stopped"
    exit 0
}

# Main demo function
main() {
    echo "🚀 Starting Nami Transaction Tracking System Demo"
    echo ""

    # Set up cleanup on exit
    trap cleanup EXIT INT TERM

    # Run setup steps
    check_prerequisites
    start_database
    run_migrations
    start_backend
    start_frontend
    show_demo_info

    # Keep running
    print_status "Demo is running. Press Ctrl+C to stop."
    wait
}

# Function to run tests
run_tests() {
    print_status "Running end-to-end tests..."

    # Check if backend and frontend are running
    if ! curl -s http://localhost:8080/health >/dev/null 2>&1; then
        print_error "Backend is not running. Please start the backend first with: $0 backend"
        return 1
    fi

    if ! curl -s http://localhost:3000 >/dev/null 2>&1; then
        print_error "Frontend is not running. Please start the frontend first with: $0 frontend"
        return 1
    fi

    cd frontend

    # Run playwright tests
    if command -v npx >/dev/null 2>&1; then
        print_status "Running Playwright tests..."
        npx playwright test --config=playwright.config.js --reporter=line --timeout=60000
        TEST_EXIT_CODE=$?
    else
        print_error "npx not found. Cannot run tests."
        cd ..
        return 1
    fi

    cd ..

    if [ $TEST_EXIT_CODE -eq 0 ]; then
        print_success "All tests passed! ✅"
        return 0
    else
        print_error "Some tests failed. Check the output above for details."
        return 1
    fi
}

# Function to show help
show_help() {
    echo "Nami Demo and Test Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  demo       Start the full demo (backend + frontend + database)"
    echo "  backend    Start only the backend server"
    echo "  frontend   Start only the frontend server"
    echo "  test       Run end-to-end tests (requires backend and frontend running)"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 demo          # Start full demo"
    echo "  $0 test          # Run tests (backend/frontend must be running)"
    echo "  $0 backend       # Start backend only"
    echo "  $0 frontend      # Start frontend only"
}

# Main script logic with command handling
main() {
    local command=${1:-help}

    case $command in
        "demo")
            print_status "Starting full Nami demo..."
            # Use the earlier demo routine
            main
            ;;
        "backend")
            check_prerequisites
            start_database
            run_migrations
            start_backend
            print_success "Backend is running on port 8080"
            print_status "Press Ctrl+C to stop"
            wait
            ;;
        "frontend")
            check_prerequisites
            start_frontend
            print_success "Frontend is running on port 3000"
            print_status "Press Ctrl+C to stop"
            wait
            ;;
        "stop")
            print_status "Stopping backend, frontend, and Docker services..."
            stop_frontend
            stop_backend
            if command -v docker >/dev/null 2>&1; then
                docker-compose down 2>/dev/null || true
            fi
            print_success "All services stopped"
            ;;
        "stop-backend")
            stop_backend
            ;;
        "stop-frontend")
            stop_frontend
            ;;
        "test")
            run_tests
            ;;
        "help")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
