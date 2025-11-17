# DomoActors

Actor Model toolkit for TypeScript: Fault-tolerant, message-driven concurrency.

[![License: RPL-1.5](https://img.shields.io/badge/License-RPL--1.5-blue.svg)](https://opensource.org/license/rpl-1-5)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/domo-actors.svg)](https://www.npmjs.com/package/domo-actors)
[![V8](https://img.shields.io/badge/V8-Compatible-orange.svg)](https://v8.dev/)
[![Runtimes](https://img.shields.io/badge/Runtimes-Browser%20%7C%20Node.js%20%7C%20Cloudflare%20%7C%20Deno%20%7C%20Bun-blue.svg)](https://github.com/VaughnVernon/DomoActors-TS#requirements)
[![npm downloads](https://img.shields.io/npm/dt/domo-actors.svg)](https://www.npmjs.com/package/domo-actors)
[![GitHub stars](https://img.shields.io/github/stars/VaughnVernon/DomoActors-TS.svg)](https://github.com/VaughnVernon/DomoActors-TS/stargazers)

## Overview

DomoActors provides a robust implementation of the Actor Model for TypeScript, enabling you to build concurrent, distributed, and fault-tolerant applications. Built on proven patterns from Reactive Architecture and Domain-Driven Design, DomoActors brings the power of message-driven actors to the TypeScript ecosystem.

This work is based on the Java version of [XOOM/Actors](https://github.com/vlingo), which I began experimenting on in 2012 and released into open source in 2016. The Java-based product burgeoned into a complete reactive platform.

## Features

- **Core Actor Model**: Full-featured actor implementation with lifecycle management
- **Fault Tolerance**: Hierarchical supervision with configurable strategies (Resume, Restart, Stop, Escalate)
- **Flexible Messaging**: Multiple mailbox implementations (ArrayMailbox, BoundedMailbox with overflow policies)
- **Type Safety**: Full TypeScript support with Protocol-based type-safe messaging
- **Value Registry**: Register and share runtime objects (databases, configuration, services) across all actors
- **Testing Support**: Comprehensive TestKit with utilities for asynchronous testing
- **Observable State**: Built-in state management with reactive updates
- **Scheduling**: Task scheduling with cancellation support
- **Dead Letters**: Dead letter handling for undeliverable messages
- **Child Actors**: Hierarchical actor creation and management
- **Clean API**: Intuitive, well-documented API designed for developer productivity

## Installation

```bash
npm install domo-actors
```

## Quick Start

```typescript
import { Actor, Protocol, stage } from 'domo-actors'

// Define your actor's protocol
interface Counter {
  increment(): void
  decrement(): void
  getValue(): void
}

// Implement your actor
class CounterActor extends Actor implements Counter {
  private count = 0

  increment(): void {
    this.count++
    console.log(`Count: ${this.count}`)
  }

  decrement(): void {
    this.count--
    console.log(`Count: ${this.count}`)
  }

  getValue(): void {
    console.log(`Current count: ${this.count}`)
  }
}

// Create and use the actor
const counter = stage().actorFor<Counter>(Protocol.typed<Counter>(), CounterActor)

// actorFor() does two things:
//
//   1. actor instance is created and started
//   2. proxy instance is created and returned to caller

counter.increment()  // Count: 1
counter.increment()  // Count: 2
counter.getValue()   // Current count: 2
```

## Supervision Example

```typescript
import {
  Actor, ActorProtocol, Protocol, stage,
  SupervisionStrategy, SupervisionDirective
} from 'domo-actors'

interface Worker extends ActorProtocol {
  process(data: string): void
}

class WorkerActor extends Actor implements Worker {
  process(data: string): void {
    if (data === 'error') {
      throw new Error('Processing failed')
    }
    console.log(`Processed: ${data}`)
  }
}

// Custom supervision strategy
class WorkerSupervisor implements SupervisionStrategy {
  decide(error: Error): SupervisionDirective {
    console.log(`Supervisor handling error: ${error.message}`)
    return SupervisionDirective.Restart  // Restart the failed actor
  }
}

stage().registerSupervisor('worker-supervisor', new WorkerSupervisor())

const worker = stage().actorFor<Worker>(
  Protocol.typed<Worker>(),
  Worker,
  { supervisorName: 'worker-supervisor' }
)

worker.process('valid')  // Processed: valid
worker.process('error')  // Supervisor handles error and restarts actor
```

## Stage Value Registry

The Stage Value Registry allows you to register and share runtime objects (like database connections, configuration, or service instances) across all actors in your application:

```typescript
import { Actor, stage } from 'domo-actors'

// Register shared resources at application startup
const database = new DatabaseConnection('postgresql://localhost:5432/mydb')
const config = { apiKey: 'secret', timeout: 5000 }

stage().registerValue('myapp:database', database)
stage().registerValue('myapp:config', config)

// Access registered values from any actor
class UserRepositoryActor extends Actor {
  async findUser(id: string) {
    const db = this.stage().registeredValue<DatabaseConnection>('myapp:database')
    return await db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

class ApiClientActor extends Actor {
  async makeRequest(endpoint: string) {
    const config = this.stage().registeredValue<Config>('myapp:config')
    // Use config.apiKey and config.timeout
  }
}

// Clean up resources when no longer needed
const db = stage().deregisterValue<DatabaseConnection>('myapp:database')
if (db) {
  await db.close()  // Perform cleanup
}
```

**Benefits:**
- **Dependency Injection**: Share dependencies without coupling actors to specific implementations
- **Configuration Management**: Centralized configuration accessible from any actor
- **Resource Pooling**: Share connection pools, caches, and other expensive resources
- **Type Safety**: Full TypeScript type inference with generics

**Best Practices:**
- Use namespaced keys to avoid conflicts (e.g., `'myapp:database'`, `'myapp:config'`)
- Register values at application startup before creating actors
- Use TypeScript generics for type-safe retrieval
- Use `deregisterValue()` to clean up resources when they're no longer needed
- Be cautious when deregistering - ensure no actors are still using the value

## Testing

DomoActors includes comprehensive testing utilities:

```typescript
import { awaitObservableState, awaitStateValue } from 'domo-actors'

// Wait for observable state changes
await awaitObservableState(observableState, state => state.count === 5)

// Wait for specific state values with timeout
await awaitStateValue(observableState, state => state.status, 'completed', {
  timeout: 5000,
  interval: 100
})
```

## API Documentation

Full API documentation is available at: [API Reference](./docs/api/index.html)

Generate documentation locally:
```bash
npm run docs
npm run docs:serve
```

## Development

### Setting Up for Local Development

When developing DomoActors or running examples from the repository:

```bash
# Clone the repository
git clone https://github.com/VaughnVernon/DomoActors-TS.git
cd DomoActors-TS

# Install dependencies
npm install

# Set up local package linking (required for examples)
npm run install:local

# Build the library
npm run build

# Run tests
npm test

# Run examples
npm run example:bank
npm run example:encapsulation
```

**Note**: The `npm run install:local` command is required to link the local `domo-actors` package so that examples can import it. This creates symlinks in `node_modules/` that point to your development build.

### Uninstalling Local Links

If you need to remove the local package links:

```bash
npm run uninstall:local
```

## Requirements

- **Runtimes**: Node.js >= 18.0.0, Deno, Bun, Cloudflare Workers, or any V8-based JavaScript runtime
- **TypeScript**: >= 5.0.0 (for development)

DomoActors has zero Node.js-specific dependencies and runs on any V8-compatible runtime.

## Documentation

- [DomoActors API](./docs/api/index.html)

## Contributing

DomoActors is authored by Vaughn Vernon and maintained as part of the Domo product family.

For issues and feature requests, please visit: https://github.com/VaughnVernon/DomoActors-TS/issues

## License

Reciprocal Public License 1.5

See: ./LICENSE.md


Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
Copyright © 2012-2025 Kalele, Inc. All rights reserved.

## About the Creator and Author

**Vaughn Vernon**

- **Creator of the XOOM Platform**
  - [Product conceived 10 years before GenAI was hip hype](https://kalele.io/xoom-platform/)
  - [Docs](https://docs.vlingo.io)
  - [Actors Docs](https://docs.vlingo.io/xoom-actors)
  - [Reference implementation in Java](https://github.com/vlingo)
- **Books**:
  - [_Implementing Domain-Driven Design_](https://www.informit.com/store/implementing-domain-driven-design-9780321834577)
  - [_Reactive Messaging Patterns with the Actor Model_](https://www.informit.com/store/reactive-messaging-patterns-with-the-actor-model-applications-9780133846881)
  - [_Domain-Driven Design Distilled_](https://www.informit.com/store/domain-driven-design-distilled-9780134434421)
  - [_Strategic Monoliths and Microservices_](https://www.informit.com/store/strategic-monoliths-and-microservices-driving-innovation-9780137355464)
- **Live and In-Person Training**:
  - [_Implementing Domain-Driven Design_ and others](https://kalele.io/training/)
- *__LiveLessons__* video training:
  - [_Domain-Driven Design Distilled_](https://www.informit.com/store/domain-driven-design-livelessons-video-training-9780134597324)
    - Available on the [O'Reilly Learning Platform](https://www.oreilly.com/videos/domain-driven-design-distilled/9780134593449/)
  - [_Strategic Monoliths and Microservices_](https://www.informit.com/store/strategic-monoliths-and-microservices-video-course-9780138268237)
    - Available on the [O'Reilly Learning Platform](https://www.oreilly.com/videos/strategic-monoliths-and/9780138268251/)
- **Curator and Editor**: Pearson Addison-Wesley Signature Series
  - [Vaughn Vernon Signature Series](https://informit.com/awss/vernon)
- **Personal website**: https://vaughnvernon.com
