# CI Quick Start Guide

This guide helps you get started with the Nami CI pipeline quickly.

## What's Already Set Up

✅ **Complete CI pipeline** with testing for all 3 services
✅ **Automated dependency updates** via Dependabot
✅ **Security scanning** for Go and Node.js
✅ **Cross-platform builds** and releases
✅ **Performance monitoring** and regression detection

## First Time Setup

### 1. Enable Required GitHub Features

In your GitHub repository settings:

1. **Actions** → Ensure GitHub Actions are enabled
2. **Branch protection rules** (recommended):
   - Require status checks to pass before merging
   - Require PR reviews
   - Include required checks: `backend`, `frontend`, `ai-service`
3. **Security & Analysis** → Enable:
   - Dependabot alerts
   - Dependabot security updates
   - Code scanning (if using GitHub Advanced Security)

### 2. Configure Secrets (Optional)

If you want Docker releases, add these secrets:
- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub access token

### 3. Test the CI

```bash
# Create a test branch and push changes
git checkout -b test-ci
git add .
git commit -m "test: Add CI configuration"
git push origin test-ci

# Create a PR to master/develop to see it in action
```

## What the CI Checks

### On Every Push/PR
- ✅ **Backend**: Go formatting, linting, unit + integration tests
- ✅ **Frontend**: ESLint, TypeScript checks, unit + E2E tests
- ✅ **AI Service**: TypeScript, unit + integration tests
- ✅ **Cross-service**: Full stack integration tests
- ✅ **Security**: Code scanning and vulnerability checks

### On PRs Only
- ✅ **Smoke tests**: Quick validation
- ✅ **Breaking change detection**: API/db schema alerts
- ✅ **Performance checks**: Bundle size monitoring

### Nightly (2 AM UTC)
- ✅ **Comprehensive tests**: Full coverage + benchmarks
- ✅ **Coverage reporting**: Sent to Codecov (if configured)

## Making Your First Change

### Backend Changes
```bash
# Make changes to Go code
git add backend/
git commit -m "feat: Add new API endpoint"
git push
# CI will automatically test your changes
```

### Frontend Changes
```bash
# Make changes to React code
git add frontend/
git commit -m "feat: Add new component"
git push
# CI will run unit tests, E2E tests, and build checks
```

### AI Service Changes
```bash
# Make changes to AI service code
git add ai-service/
git commit -m "feat: Improve AI response handling"
git push
# CI will test your changes
```

## Understanding CI Results

### Green Checkmarks ✅
- All tests passed
- Code is properly formatted
- No security issues detected
- Ready to merge

### Red X ❌
- Click on the failed job to see details
- Common issues:
  - Test failures → Fix your code
  - Linting errors → Format your code
  - Build errors → Fix compilation issues
  - Security issues → Update vulnerable dependencies

### Yellow Dots ⚠️
- Warnings (non-blocking)
- Performance recommendations
- Bundle size alerts

## Running Tests Locally

```bash
# Quick check before pushing
make ci-backend      # Backend tests only
make ci-frontend     # Frontend tests only

# Full local CI simulation
make ci              # Run everything

# Isolated E2E tests (like CI)
make test-isolated
```

## Creating a Release

```bash
# Tag your code
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions will automatically:
# - Build release artifacts
# - Create a GitHub release
# - Generate changelog
# - Build Docker images (if configured)
```

## Troubleshooting Common Issues

### "Tests failed but they work locally"
1. Check environment variables in CI vs local
2. Ensure database migrations are applied
3. Verify all dependencies are installed

### "E2E tests are flaky"
1. Increase timeouts in test configuration
2. Check for race conditions in test setup
3. Ensure proper cleanup between tests

### "Security scan found vulnerabilities"
1. Review Dependabot alerts
2. Update affected packages
3. Use `npm audit fix` for Node.js issues

## Monitoring CI Health

Check your repository's **Actions** tab for:
- Recent workflow runs
- Success/failure rates
- Performance trends
- Security scan results

## Need Help?

1. **Check workflow logs** → Most detailed error information
2. **Review this guide** → Common issues and solutions
3. **Look at existing PRs** → See how others handle CI failures
4. **GitHub Actions documentation** → Advanced configuration options

## Best Practices

### Before Pushing
```bash
# Always run these locally first
make test          # Run all tests
make fmt           # Format Go code
make lint          # Check for issues
```

### Writing PRs
- Descriptive titles: `feat:`, `fix:`, `docs:`, etc.
- Include what changed and why
- Link to relevant issues
- Add testing notes if needed

### Code Quality
- Keep tests passing before merging
- Address security warnings promptly
- Maintain good test coverage
- Follow existing code patterns

That's it! Your CI pipeline is ready to go. 🚀