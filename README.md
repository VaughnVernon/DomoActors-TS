# DomoActors

Actor Model toolkit for TypeScript: Fault-tolerant, message-driven concurrency.

## Overview

DomoActors provides a robust implementation of the Actor Model for TypeScript, enabling you to build concurrent, distributed, and fault-tolerant applications. Built on proven patterns from Reactive Architecture and Domain-Driven Design, DomoActors brings the power of message-driven actors to the TypeScript ecosystem.

This work is based on the Java version of [XOOM/Actors](https://github.com/vlingo), which I began experimenting on in 2012 and released into open source in 2016. The Java-based product burgeoned into a complete reactive platform.

## Features

- **Core Actor Model**: Full-featured actor implementation with lifecycle management
- **Fault Tolerance**: Hierarchical supervision with configurable strategies (Resume, Restart, Stop, Escalate)
- **Flexible Messaging**: Multiple mailbox implementations (ArrayMailbox, BoundedMailbox with overflow policies)
- **Type Safety**: Full TypeScript support with Protocol-based type-safe messaging
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

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## Documentation

- [DomoActors API](./docs/api/index.html)

## Contributing

DomoActors is authored by Vaughn Vernon and maintained as part of the Domo product family.

For issues and feature requests, please visit: https://github.com/VaughnVernon/DomoActors/issues

## License

Reciprocal Public License 1.5

See: ./LICENSE.md


Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
Copyright © 2012-2025 Kalele, Inc. All rights reserved.

## Author

**Vaughn Vernon**
- Author of "Implementing Domain-Driven Design" and "Reactive Messaging Patterns with the Actor Model"
- Creator of VLINGO/PLATFORM (now XOOM)
- https://vaughnvernon.com

## Related Projects

- [VLINGO/XOOM Actors](https://docs.vlingo.io) - Reference implementation in Java
