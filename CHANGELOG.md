# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-17

### Added
- **Stage Value Registry**: New value registration system for shared runtime objects
  - `registerValue<V>(name: string, value: V)`: Register shared runtime objects (database instances, configuration, connection pools, etc.)
  - `registeredValue<V>(name: string): V`: Retrieve registered values from any actor
  - `deregisterValue<V>(name: string): V | undefined`: Remove and return registered values for cleanup
  - Supports namespaced keys for avoiding conflicts (e.g., 'myapp:database', 'myapp:config')
  - Type-safe with generic type parameters
  - Comprehensive test coverage with 39 tests (28 for registration, 11 for deregistration)

### Use Cases
- Database connection management: Register database instances or connection pools for actor access
- Configuration management: Share application configuration across all actors
- Service registry pattern: Register and retrieve service instances throughout the application
- Dependency injection: Provide runtime dependencies to actors without constructor coupling

### Example
```typescript
import { stage } from 'domo-actors'

// Register a database instance
const db = new DatabaseConnection()
stage().registerValue('myapp:database', db)

// Access from any actor
class MyActor extends Actor {
  async query() {
    const db = this.stage().registeredValue<DatabaseConnection>('myapp:database')
    return await db.query('SELECT * FROM users')
  }
}

// Clean up resources when shutting down
const db = stage().deregisterValue<DatabaseConnection>('myapp:database')
if (db) {
  await db.close()
}
```

## [1.0.2] - 2025-01-XX

### Initial Release
- Core actor model implementation
- Supervision strategies
- Mailbox implementations (Array, Bounded)
- Lifecycle management
- Message delivery
- Scheduler
- Observable state
- State snapshots
