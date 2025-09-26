# Nami Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

TDD mandatory: Tests written → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced; Every feature must have comprehensive test coverage before implementation; Integration tests required for API contracts and data flows.

### II. Interface-First Design

Every service starts with well-defined interfaces; Dependencies must be mockable and swappable; Clear contracts between components; API design precedes implementation.

### III. Database-First Schema

PostgreSQL as source of truth; All schema changes through versioned migrations; Data integrity enforced at database level; Performance considerations built into initial design.

### IV. Code Quality Standards

Go: Follow standard Go project layout, use golangci-lint, gofmt for formatting; React: Use ESLint, Prettier, follow React best practices; Code should be readable and maintainable; Meaningful variable names and clear function signatures.

### V. Security & Data Protection

Financial data requires basic security practices; Input validation on user inputs; Use parameterized queries to prevent SQL injection; Keep sensitive data in environment variables.

## Development Workflow

### Development Process

Commit frequently with meaningful messages; Test major features before considering them done; Keep a simple README with setup instructions; Document complex business logic and API endpoints.

### Quality Standards

Write tests for critical business logic; Test integration points manually; Keep database migrations simple and backward compatible; Basic performance monitoring for slow queries.

## Technical Standards

### Performance & Monitoring

Keep API responses reasonably fast; Add indexes for frequently queried fields; Basic error logging; Simple health checks for key services.

### Deployment

Use Docker for consistent environments; Keep configuration in environment variables; Simple backup strategy for database; Document deployment steps.

## Governance

These principles guide development decisions; Prefer simplicity over complexity; Focus on working software over perfect architecture; Adjust principles as needed for personal use.

**Version**: 1.0.0 | **Ratified**: 2025-09-26 | **Last Amended**: 2025-09-26
