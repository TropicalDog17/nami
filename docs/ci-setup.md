# Continuous Integration Setup

This document describes the comprehensive CI/CD pipeline setup for the Nami Transaction Tracking System.

## Overview

The CI pipeline is designed to provide comprehensive testing and validation for all three services:
- **Backend** - Go API server
- **Frontend** - React TypeScript application
- **AI Service** - Node.js/TypeScript Telegram bot

## Workflows

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `master` or `develop` branches
- Pull requests to `master` or `develop` branches

**Jobs:**

#### Backend CI
- **Environment:** Go 1.21 with PostgreSQL 15
- **Tests:**
  - Code formatting (`go fmt`)
  - Linting (`go vet`)
  - Unit tests (`go test -short`)
  - Integration tests with testcontainers
- **Build:** Binary compilation verification

#### Frontend CI
- **Environment:** Node.js 20
- **Tests:**
  - ESLint code linting
  - TypeScript type checking
  - Unit tests with Vitest
  - E2E tests with Playwright
- **Build:** Production build verification

#### AI Service CI
- **Environment:** Node.js 20
- **Tests:**
  - TypeScript type checking
  - Unit tests with Jest
  - Integration tests
- **Build:** TypeScript compilation

#### Cross-service Integration
- **Environment:** Full stack with PostgreSQL
- **Tests:**
  - Database migrations
  - Service startup validation
  - Isolated E2E tests
- **Reporting:** Test coverage summary

#### Security & Quality
- **Tools:**
  - Go security scanning (gosec)
  - Node.js security audit
  - Secret scanning (trufflehog)
  - SARIF report generation

### 2. PR Checks (`.github/workflows/pr-check.yml`)

**Triggers:** Pull request events

**Jobs:**

#### Smoke Tests
- Quick validation tests for PR feedback
- Code formatting checks
- Basic build verification
- Type checking

#### Breaking Changes Detection
- API change detection
- Database schema change alerts
- Frontend API layer compatibility checks

#### Performance Regression
- Go benchmark execution
- Frontend bundle size monitoring

### 3. Nightly Tests (`.github/workflows/nightly.yml`)

**Triggers:**
- Daily schedule (2 AM UTC)
- Manual workflow dispatch

**Features:**
- Comprehensive test suite with full coverage
- Performance benchmarking
- Coverage report generation
- Integration with Codecov

### 4. Release Pipeline (`.github/workflows/release.yml`)

**Triggers:** Git tags matching `v*` pattern

**Jobs:**

#### Build Artifacts
- Cross-platform backend builds (Linux, macOS, Windows)
- Frontend production build
- AI Service build
- Release artifact packaging

#### Release Creation
- Automated changelog generation
- GitHub release creation
- Artifact attachment

#### Docker (Optional)
- Docker image building and pushing
- Multi-platform support
- Semantic versioning tags

## Dependency Management

### Dependabot Configuration (`.github/dependabot.yml`)

Automated dependency updates for:
- Go modules (backend and migrations)
- Node.js packages (frontend and AI service)
- GitHub Actions
- Docker base images

**Schedule:**
- Go dependencies: Weekly (Mondays)
- Node.js dependencies: Weekly (Tuesdays)
- GitHub Actions: Monthly
- Docker: Weekly (Wednesdays)

## Caching Strategy

### Go Dependencies
- **Path:** `~/.cache/go-build`, `~/go/pkg/mod`
- **Key:** Based on `go.sum` files
- **Scope:** Backend and migration dependencies

### Node.js Dependencies
- **Path:** `node_modules`, `~/.npm`
- **Key:** Based on `package-lock.json` files
- **Scope:** Service-specific for optimal performance

## Environment Variables

### Database
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`: Test database configuration

### Application
- `VAULT_E2E`: Enables E2E test mode
- `CI`: Indicates CI environment
- `NODE_ENV`: Environment configuration

## Security Features

### Static Analysis
- Go security scanning with gosec
- SARIF format reporting
- GitHub Security tab integration

### Dependency Scanning
- Node.js security audit
- Automated vulnerability detection
- High-severity alerting

### Secret Detection
- Trufflehog integration
- Comprehensive secret pattern matching
- Pre-commit prevention

## Performance Monitoring

### Benchmarks
- Go benchmark execution
- Performance regression detection
- Memory and timing analysis

### Bundle Size
- Frontend build size monitoring
- Size threshold alerts
- Optimization recommendations

## Local Development

### Running Tests Locally

```bash
# Full test suite
make test

# Backend tests
make test-unit
make test-integration

# Frontend tests
cd frontend && npm test
cd frontend && npm run test:e2e

# AI Service tests
cd ai-service && npm test
```

### CI Environment Simulation

```bash
# Isolated test environment
make test-isolated

# Manual setup
make test-setup
make test-isolated-run
make test-teardown
```

## Troubleshooting

### Common Issues

#### PostgreSQL Connection Errors
- Ensure database service is healthy
- Check connection string format
- Verify database user permissions

#### Playwright Browser Issues
- Install Playwright browsers: `npm run test:e2e:install`
- Update browsers: `npm run test:e2e:update`
- Check display configuration for headed mode

#### Go Module Cache Issues
- Clear module cache: `go clean -modcache`
- Re-download dependencies: `go mod download`

#### Node.js Dependency Issues
- Clear npm cache: `npm cache clean --force`
- Remove node_modules: `rm -rf node_modules`
- Reinstall: `npm ci`

### Debug Mode

Enable verbose logging for debugging:

```bash
# Backend tests with verbose output
cd backend && go test -v ./...

# Frontend tests with debug output
cd frontend && npm test -- --verbose

# AI Service tests with coverage
cd ai-service && npm run test:llm:coverage
```

## Configuration

### Customizing Test Environment

1. **Database Configuration:**
   - Modify `.github/workflows/ci.yml` service definitions
   - Update connection strings in environment variables

2. **Node.js Version:**
   - Update `NODE_VERSION` environment variable
   - Ensure compatibility with all services

3. **Go Version:**
   - Update `GO_VERSION` environment variable
   - Verify Go module compatibility

### Adding New Tests

1. **Unit Tests:**
   - Follow existing patterns in each service
   - Update Makefile targets if needed

2. **Integration Tests:**
   - Add to appropriate test directories
   - Update workflow file if new dependencies required

3. **E2E Tests:**
   - Add to `frontend/tests/e2e/`
   - Update Playwright configuration if needed

## Best Practices

### Performance
- Use specific cache keys for optimal hit rates
- Parallelize independent jobs
- Minimize unnecessary service startups

### Reliability
- Set appropriate timeouts for all operations
- Use health checks for external services
- Implement proper error handling

### Security
- Regularly update dependencies via Dependabot
- Monitor security scan results
- Keep secrets out of repository

### Maintainability
- Use matrix strategies for multiple versions
- Implement consistent naming conventions
- Document workflow changes

## Monitoring

### CI Dashboard
Monitor pipeline health through:
- GitHub Actions tab
- Build success/failure rates
- Test execution times
- Cache hit rates

### Alerts
Set up notifications for:
- Build failures on master/develop
- Security vulnerability detections
- Performance regressions
- Dependency update failures

## Future Enhancements

### Potential Improvements
- [ ] Add parallel testing matrix for multiple database versions
- [ ] Implement test result reporting to external services
- [ ] Add automated performance profiling
- [ ] Integrate with deployment pipeline
- [ ] Add mutation testing for critical code paths
- [ ] Implement contract testing between services

### Third-party Integrations
- [ ] SonarQube for code quality
- [ ] Snyk for enhanced security scanning
- [ ] Codecov for advanced coverage reporting
- [ ] Cypress Dashboard for E2E test analytics