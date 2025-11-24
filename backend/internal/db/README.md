# Database Layer

Database connection management and infrastructure components.

## Components

- **`connection.go`** - PostgreSQL connection pooling, transaction management, and health monitoring

Manages database driver configuration, connection lifecycle, and provides transaction boundaries for all repository operations.