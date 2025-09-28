#!/bin/bash

# Test script for Nami application
# This script helps run tests with proper backend connectivity

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if backend is running
check_backend() {
    print_status "Checking if backend is running..."
    
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        print_success "Backend is running"
        return 0
    else
        print_error "Backend is not running. Please start the backend first:"
        echo "  cd backend"
        echo "  go run cmd/server/main.go"
        exit 1
    fi
}

# Function to check if frontend is running
check_frontend() {
    print_status "Checking if frontend is running..."
    
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_success "Frontend is running"
        return 0
    else
        print_error "Frontend is not running. Please start the frontend first:"
        echo "  cd frontend"
        echo "  npm run dev"
        exit 1
    fi
}

# Function to install Playwright if needed
install_playwright() {
    print_status "Checking Playwright installation..."
    
    if [ ! -d "frontend/node_modules/@playwright/test" ]; then
        print_status "Installing Playwright browsers..."
        cd frontend
        npm run test:e2e:install
        cd ..
        print_success "Playwright browsers installed"
    else
        print_success "Playwright is already installed"
    fi
}

# Function to run tests
run_tests() {
    local test_type=$1
    
    print_status "Running ${test_type} tests..."
    
    cd frontend
    
    case $test_type in
        "all")
            npm run test:e2e
            ;;
        "headed")
            npm run test:e2e:headed
            ;;
        "debug")
            npm run test:e2e:debug
            ;;
        "report")
            npm run test:e2e:report
            ;;
        "clean")
            npm run test:e2e:clean
            ;;
        *)
            print_error "Unknown test type: $test_type"
            echo "Available test types: all, headed, debug, report, clean"
            exit 1
            ;;
    esac
    
    cd ..
}

# Function to run tests with backend check
run_tests_with_backend_check() {
    local test_type=$1
    
    print_status "Preparing to run ${test_type} tests..."
    
    # Check if both backend and frontend are running
    check_backend
    check_frontend
    
    # Install Playwright if needed
    install_playwright
    
    # Run the tests
    run_tests $test_type
}

# Function to show help
show_help() {
    echo "Nami Test Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  all         Run all tests in headless mode"
    echo "  headed      Run all tests in headed mode (visible browser)"
    echo "  debug       Run tests in debug mode"
    echo "  report      Show test report"
    echo "  clean       Clean test results"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all              # Run all tests"
    echo "  $0 headed           # Run tests in headed mode"
    echo "  $0 debug            # Run tests in debug mode"
    echo ""
    echo "Environment Variables:"
    echo "  SKIP_BACKEND_CHECK=1  Skip backend connectivity check"
    echo "  SKIP_FRONTEND_CHECK=1  Skip frontend connectivity check"
    echo "  SKIP_PLAYWRIGHT_INSTALL=1  Skip Playwright installation check"
}

# Main script logic
main() {
    local command=${1:-help}
    
    case $command in
        "all")
            if [ "$SKIP_BACKEND_CHECK" != "1" ]; then
                check_backend
            fi
            
            if [ "$SKIP_FRONTEND_CHECK" != "1" ]; then
                check_frontend
            fi
            
            if [ "$SKIP_PLAYWRIGHT_INSTALL" != "1" ]; then
                install_playwright
            fi
            
            run_tests "all"
            ;;
        "headed")
            if [ "$SKIP_BACKEND_CHECK" != "1" ]; then
                check_backend
            fi
            
            if [ "$SKIP_FRONTEND_CHECK" != "1" ]; then
                check_frontend
            fi
            
            if [ "$SKIP_PLAYWRIGHT_INSTALL" != "1" ]; then
                install_playwright
            fi
            
            run_tests "headed"
            ;;
        "debug")
            if [ "$SKIP_BACKEND_CHECK" != "1" ]; then
                check_backend
            fi
            
            if [ "$SKIP_FRONTEND_CHECK" != "1" ]; then
                check_frontend
            fi
            
            if [ "$SKIP_PLAYWRIGHT_INSTALL" != "1" ]; then
                install_playwright
            fi
            
            run_tests "debug"
            ;;
        "report")
            run_tests "report"
            ;;
        "clean")
            run_tests "clean"
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

# Run main function with all arguments
main "$@"
