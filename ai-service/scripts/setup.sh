#!/bin/bash

# =============================================================================
# Nami AI Service Setup Script
# =============================================================================
# This script helps set up the development environment for the AI service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "${BLUE}==============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==============================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        REQUIRED_NODE_VERSION="18.0.0"
        if [ "$(printf '%s\n' "$REQUIRED_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_NODE_VERSION" ]; then
            print_success "Node.js $NODE_VERSION found"
        else
            print_error "Node.js $NODE_VERSION found, but >= $REQUIRED_NODE_VERSION is required"
            exit 1
        fi
    else
        print_error "Node.js not found. Please install Node.js >= 18.0.0"
        exit 1
    fi

    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION found"
    else
        print_error "npm not found"
        exit 1
    fi

    # Check Docker (optional)
    if command_exists docker; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker $DOCKER_VERSION found"
    else
        print_warning "Docker not found. Install Docker for containerized deployment"
    fi

    # Check Docker Compose (optional)
    if command_exists docker-compose; then
        COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker Compose $COMPOSE_VERSION found"
    else
        print_warning "Docker Compose not found. Install Docker Compose for containerized deployment"
    fi
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies"

    if [ -f "package.json" ]; then
        print_info "Installing Node.js dependencies..."
        npm install
        print_success "Dependencies installed"
    else
        print_error "package.json not found. Please run this script from the project root."
        exit 1
    fi
}

# Setup environment files
setup_environment() {
    print_header "Setting Up Environment"

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_info "Creating .env file from template..."
            cp .env.example .env
            print_success ".env file created"
            print_warning "Please edit .env file with your configuration before running the service"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_info ".env file already exists"
    fi
}

# Create necessary directories
create_directories() {
    print_header "Creating Directories"

    # Create logs directory
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_success "Created logs directory"
    fi

    # Create uploads directory (for testing image uploads)
    if [ ! -d "uploads" ]; then
        mkdir -p uploads
        print_success "Created uploads directory"
    fi

    # Create nginx config directory
    if [ ! -d "nginx" ]; then
        mkdir -p nginx
        print_success "Created nginx directory"
    fi

    # Create monitoring directory
    if [ ! -d "monitoring" ]; then
        mkdir -p monitoring/{prometheus,grafana/{dashboards,datasources}}
        print_success "Created monitoring directories"
    fi
}

# Generate sample configuration files
generate_configs() {
    print_header "Generating Sample Configuration"

    # Generate nginx configuration
    if [ ! -f "nginx/nginx.conf" ]; then
        cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream ai_service {
        server ai-service:8081;
    }

    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://ai_service;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /healthz {
            proxy_pass http://ai_service;
            access_log off;
        }
    }
}
EOF
        print_success "Generated nginx configuration"
    fi

    # Generate Prometheus configuration
    if [ ! -f "monitoring/prometheus.yml" ]; then
        cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'ai-service'
    static_configs:
      - targets: ['localhost:8081']
    metrics_path: /metrics
    scrape_interval: 30s
EOF
        print_success "Generated Prometheus configuration"
    fi

    # Generate Grafana datasource
    if [ ! -f "monitoring/grafana/datasources/prometheus.yml" ]; then
        cat > monitoring/grafana/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF
        print_success "Generated Grafana datasource configuration"
    fi
}

# Run tests
run_tests() {
    print_header "Running Tests"

    print_info "Running type checking..."
    npm run check
    print_success "Type checking passed"

    print_info "Running unit tests..."
    npm test
    print_success "All tests passed"
}

# Build project
build_project() {
    print_header "Building Project"

    print_info "Building TypeScript project..."
    npm run build
    print_success "Project built successfully"
}

# Setup development tools
setup_dev_tools() {
    print_header "Setting Up Development Tools"

    # Check for VS Code
    if command_exists code; then
        print_info "VS Code detected"

        # Install recommended extensions
        print_info "Installing VS Code extensions..."
        code --install-extension ms-vscode.vscode-typescript-next
        code --install-extension bradlc.vscode-tailwindcss
        code --install-extension esbenp.prettier-vscode
        code --install-extension ms-vscode.vscode-eslint
        print_success "VS Code extensions installed"
    fi

    # Setup pre-commit hooks (optional)
    if command_exists husky; then
        print_info "Husky detected"
    else
        print_info "Consider installing Husky for git hooks: npm install --save-dev husky"
    fi
}

# Display next steps
display_next_steps() {
    print_header "Setup Complete - Next Steps"

    echo ""
    print_info "1. Configure your environment:"
    echo "   📝 Edit .env file with your Telegram bot token and OpenAI API key"
    echo ""

    print_info "2. Run the development server:"
    echo "   🚀 npm run dev"
    echo ""

    print_info "3. Run with Docker (optional):"
    echo "   🐳 docker-compose up -d"
    echo ""

    print_info "4. Run tests:"
    echo "   🧪 npm test"
    echo ""

    print_info "5. Check health:"
    echo "   ❤️  curl http://localhost:8081/healthz"
    echo ""

    print_info "Useful commands:"
    echo "   • npm run dev      - Start development server"
    echo "   • npm run build    - Build for production"
    echo "   • npm test         - Run all tests"
    echo "   • npm run check     - Type checking only"
    echo "   • docker-compose up -d - Start with Docker"
    echo "   • docker-compose logs -f - View logs"
    echo ""

    print_success "Setup complete! 🎉"
}

# Main setup function
main() {
    print_header "Nami AI Service Setup"
    echo "This script will set up the development environment for the Nami AI Service."
    echo ""

    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the project root."
        exit 1
    fi

    # Run setup steps
    check_prerequisites
    install_dependencies
    setup_environment
    create_directories
    generate_configs

    # Ask if user wants to run tests
    echo ""
    read -p "Do you want to run tests now? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_tests
        build_project
    else
        print_warning "Skipping tests. Run 'npm test' later to verify everything works."
        build_project
    fi

    # Setup development tools
    setup_dev_tools

    # Display next steps
    display_next_steps
}

# Handle script interruption
trap 'print_error "Setup interrupted"; exit 1' INT

# Run main function
main "$@"