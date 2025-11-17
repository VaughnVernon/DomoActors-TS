# DomoActors Documentation

## Introduction

DomoActors is a production-ready Actor Model toolkit for TypeScript that enables you to build concurrent, distributed, and fault-tolerant applications. Built on proven patterns from Reactive Architecture and Domain-Driven Design, DomoActors brings the power of message-driven actors to the TypeScript ecosystem.

The Actor Model provides a higher-level abstraction for writing concurrent and distributed systems by treating actors as the fundamental units of computation. Each actor:
- Processes messages one at a time sequentially from its mailbox
- Maintains private state that cannot be accessed directly
- Can create other actors and send messages to known actors
- Decides how to respond to the next message

DomoActors implements this model with full TypeScript type safety, comprehensive supervision strategies, and a clean, intuitive API designed for developer productivity.

## Getting Started

The following explains how to get started quickly with DomoActors.

### Installation

```bash
npm install domo-actors
```

### Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

### Quick Start

Here's a simple example to get you started with DomoActors:

```typescript
import { Actor, Protocol, stage } from 'domo-actors'

// 1. Define your actor's protocol (interface)
interface Counter {
  increment(): Promise<void>
  decrement(): Promise<void>
  getValue(): Promise<number>
}

// 2. Implement your actor
class CounterActor extends Actor implements Counter {
  private count = 0

  async increment(): Promise<void> {
    this.count++
    this.logger().log(`Count: ${this.count}`)
  }

  async decrement(): Promise<void> {
    this.count--
    this.logger().log(`Count: ${this.count}`)
  }

  async getValue(): Promise<number> {
    return this.count
  }
}

// 3. Create and use the actor
const counterProtocol: Protocol = {
  type: () => 'Counter',
  instantiator: () => ({
    instantiate: () => new CounterActor()
  })
}

const counter = stage().actorFor<Counter>(counterProtocol)

// All method calls are asynchronous and go through the actor's mailbox
await counter.increment()  // Count: 1
await counter.increment()  // Count: 2
const value = await counter.getValue()  // Returns: 2
```

### Key Concepts in the Example

1. **Protocol**: Defines the actor's public interface; an actor may have multiple protocols
2. **Actor Implementation**: Extends `Actor` base class and implements the protocol
3. **Stage**: The runtime environment that creates and manages actors
4. **Type Safety**: Full TypeScript support with generic types
5. **Message-Driven**: All method calls become asynchronous messages

## Development Setup

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

**Important**: The `npm run install:local` command is required to link the local `domo-actors` package so that examples can import it. This creates symlinks in `node_modules/` that point to your development build in `dist/`.

### Local Package Linking Explained

When you clone the repository and want to run examples, the examples import from `'domo-actors'` as if it were an installed npm package. However, you're developing the package itself, so it's not installed from npm.

The solution is `npm link`, which creates symlinks:

1. **Global symlink**: Created in your npm global directory pointing to this project
2. **Local symlink**: Created in `node_modules/domo-actors` pointing back to the project root

This allows the examples to import from `'domo-actors'` while using your local development code.

**Symlink locations:**
- Local: `node_modules/domo-actors` → `..` (project root)
- Global: `~/.nvm/versions/node/vX.X.X/lib/node_modules/domo-actors` → (project path)

**Commands:**
- `npm run install:local` - Sets up the symlinks
- `npm run uninstall:local` - Removes the symlinks
- `npm run clean` - Removes build artifacts (does NOT remove symlinks)

### Development Workflow

```bash
# Make changes to source code in src/

# Rebuild the library
npm run build

# Run tests to verify changes
npm test

# Try the examples
npm run example:bank

# Generate and view documentation
npm run docs
npm run docs:serve
```

### Creating Child Actors

Actors can create and manage child actors, forming a hierarchy:

```typescript
class ParentActor extends Actor {
  private child!: Child

  async beforeStart(): Promise<void> {
    // Create child actor during initialization
    const childProtocol: Protocol = {
      type: () => 'Child',
      instantiator: () => ({
        instantiate: () => new ChildActor()
      })
    }

    const definition = new Definition('Child', this.address(), [])
    this.child = this.childActorFor<ChildProtocol>(childProtocol, definition)
  }

  async delegateWork(data: string): Promise<void> {
    // Send message to child
    await this.child.process(data)
  }
}
```

## Core Concepts

### The Actor Model

The Actor Model is a computational model that treats "actors" as the universal primitives of concurrent computation. In response to a message, an actor can:

1. **Make local decisions** - Change its private state
2. **Create more actors** - Spawn child actors
3. **Send messages** - Communicate with other actors
4. **Determine behavior** - Decide how to respond to future messages

#### Key Principles

**Encapsulation**: Actors maintain private state that cannot be accessed directly. All interaction happens through message passing.

**Message-Driven**: Actors communicate exclusively through asynchronous messages. There are no shared variables or locks.

**Sequential Processing**: Each actor processes messages one at a time from its mailbox, eliminating race conditions within an actor.

**Location Transparency**: Actors can be addressed the same way whether they're in the same process or distributed across a network.

**Fault Tolerance**: The supervision hierarchy provides automatic error handling and recovery.

### Actors in DomoActors

In DomoActors, an actor consists of:

- **Protocol**: The typed interface defining the actor's public methods
- **Implementation**: The actor class extending `Actor` base class
- **Actor Client**: The component that either creates the actor and sends it messages, or another component that is given the actor reference to which it sends messages
- **Two-Part Runtime**: Two parts are created when an actor is instantiated: one part is a proxy returned to the client requesting actor creation; the other part is the actor objected that is ready to process messages sent to it
- **Messages**: Messages are created and sent to the actor as a result of a client calling/invoking a method on the actor's interface protocol proxy
- **Mailbox**: The message queue for incoming messages, which are delivered asynchronously to the actor
- **State**: Private variables maintained by the actor
- **Address**: A unique identifier for the actor
- **Supervisor**: The actor responsible for handling this actor's failures

### Messaging and Mailboxes

#### How Messaging Works

When you call a method on an actor proxy, DomoActors:

1. **Converts the call to a message** - The method name and arguments are packaged into a message object
2. **Enqueues the message** - The message object is enqueued to the actor's mailbox (currently FIFO only)
3. **Returns a Promise** - The caller receives a Promise for the result
4. **Delivers sequentially** - The mailbox delivers messages one at a time to the actor by calling the message's method on the actor
5. **Invokes the method** - The actual actor method executes
6. **Resolves the Promise** - The result is sent back to the caller by way of a `Promise`

```typescript
// This call:
const result = await thing.process(data)

// Becomes:
// 1. Create message: { method: 'process', args: [data] }
// 2. Send to mailbox: actor.mailbox.send(message)
// 3. Return Promise that resolves when processing completes
```

#### Message Ordering

Messages sent from the same actor to another actor are processed in the order in which they were sent:

```typescript
actor.doFirst()   // Processed first
actor.doSecond()  // Processed second
actor.doThird()   // Processed third
```

However, messages from different actors may be interleaved, which depends on the runtime asynchrony.

#### Mailbox Types

DomoActors provides two mailbox implementations:

**ArrayMailbox** (Default)
- Unbounded FIFO queue
- Uses JavaScript arrays
- No message loss
- Suitable for most use cases

```typescript
import { ArrayMailbox } from 'domo-actors'

const mailbox = new ArrayMailbox()
const actor = stage().actorFor<MyProtocol>(protocol, undefined, 'default', mailbox)
```

**BoundedMailbox**
- Fixed capacity queue
- Configurable overflow policies
- Prevents memory exhaustion
- Useful for backpressure scenarios

```typescript
import { BoundedMailbox, MailboxOverflowPolicy } from 'domo-actors'

// Drop oldest messages when full
const mailbox = new BoundedMailbox(
  100,  // capacity
  MailboxOverflowPolicy.DropOldest
)

// Or drop newest messages
const mailbox2 = new BoundedMailbox(
  100,
  MailboxOverflowPolicy.DropNewest
)

const something = stage().actorFor<Something>(protocol, undefined, 'default', mailbox)
```

#### Mailbox Operations

```typescript
interface Mailbox {
  // Send a message to the actor
  send(message: Message): void

  // Suspend message processing
  suspend(): void

  // Resume message processing
  resume(): void

  // Close the mailbox (no more messages accepted)
  close(): void

  // Check if mailbox is closed
  isClosed(): boolean

  // Check if suspended
  isSuspended(): boolean
}
```

#### Self-Messaging

Actors can send messages to themselves using `selfAs<T>()`:

```typescript
class WorkerActor extends Actor implements Worker {
  private self!: Worker

  async beforeStart(): Promise<void> {
    // Get self-reference for messaging
    this.self = this.selfAs<Worker>()
  }

  async process(data: string): Promise<void> {
    // Do some work...

    // Send message to self (goes through mailbox)
    return this.self.processNext()
  }

  async processNext(): Promise<void> {
    // This is called asynchronously via self-messaging
  }
}
```

Self-messaging ensures state changes go through the mailbox, maintaining actor semantics.

#### ExecutionContext

DomoActors provides an `ExecutionContext` for passing request-scoped data through message processing:

```typescript
// Look up the actor (returns its proxy)
const user: User = stage().actorOf(userAddress)

// Set up context before sending message
user.executionContext()
  .reset()
  .setValue('requestId', '12345')
  .setValue('userId', 'user@example.com')

// The context is automatically copied with each message
await user.process(data)

// Supervisors can access the context to provide context-centric error handling
class UserSupervisor extends DefaultSupervisor {

  inform(error: Error, supervised: Supervised): Promise<void> {
    const context = supervised.actor().lifeCycle().environment().getCurrentMessageExecutionContext()
    const requestId = context.getValue<string>('requestId')
    // ...
  }

  protected decideDirective(error: Error, supervised: Supervised): SupervisionDirective {
    const context = supervised.actor().lifeCycle().environment().getCurrentMessageExecutionContext()
    const requestId = context.getValue<string>('requestId')

    // default to Resume
    let directive = SupervisionDirective.Resume
    // determine best actor life cycle by context and data...

    return directive
  }
}
```

### Supervision

Supervision is a key feature of the Actor Model that provides fault tolerance through a hierarchical error handling mechanism.

#### "Let It Crash" Philosophy

Instead of defensive programming with try-catch everywhere, actors follow the "let it crash" philosophy:

1. **Let actors fail fast** - Don't handle every error defensively
2. **Supervisors handle recovery** - Parent actors supervise children
3. **Isolate failures** - Errors don't cascade through the system
4. **Automatic recovery** - Supervisors restart or resume failed actors

```typescript
class WorkerActor extends Actor implements Worker {
  async process(data: string): Promise<void> {
    // No try-catch needed - let errors propagate
    const parsed = JSON.parse(data)  // Might throw
    const result = this.compute(parsed)  // Might throw
    await this.save(result)  // Might throw
  }
}
```

#### Supervision Hierarchy

Every actor (except the private root actor) has a supervisor. A supervisor is either named when creating the actor, or if the supervisor's name is not provided, the default supervisor is assigned.

```
PrivateRootActor (system-level supervision)
  └── PublicRootActor (user-level default parent)
       ├── Actor User is supervised by named 'user-supervisor': UserSupervisor
       ├── Actor Catalog is supervised by named 'catalog-supervisor': CatalogSupervisor
       └── Actor Finder supervisor was not named and is supervised by 'default': DefaultSupervisor
            ├── Finder 1 (child) also supervised by DefaultSupervisor
            └── Finder 2 (child) also supervised by DefaultSupervisor
```

#### Supervision Directives

When an actor fails, its supervisor decides how to handle the failure and the actor's life cycle:

**Resume** - Continue processing, ignore the error
```typescript
return SupervisionDirective.Resume
```
Use when: Error is transient or can be safely ignored

**Restart** - Refresh the actor instance state while retaining its current address
```typescript
return SupervisionDirective.Restart
```
Use when: Actor state is corrupted but actor is still needed

**Stop** - Terminate the actor(s)
```typescript
return SupervisionDirective.Stop
```
Use when: Error is unrecoverable

**Escalate** - Forward error to parent supervisor
```typescript
return SupervisionDirective.Escalate
```
Use when: Supervisor doesn't know how to handle the error

#### Supervision Scope

Directives can apply to one actor or all siblings:

```typescript
enum SupervisionScope {
  One,  // Apply directive only to failed actor
  All   // Apply directive to failed actor and all siblings
}
```

#### Creating Custom Supervisors

```typescript
import {
  DefaultSupervisor,
  SupervisionDirective,
  SupervisionStrategy,
  Supervised
} from 'domo-actors'

class MyCustomSupervisor extends DefaultSupervisor {
  inform(error: Error, supervised: Supervised): Promise<void> {
    // Handle and direct recovery...
  }

  protected decideDirective(
    error: Error,
    supervised: Supervised,
    strategy: SupervisionStrategy
  ): SupervisionDirective {
    // Log the error
    console.error(`Actor ${supervised.address()} failed:`, error.message)

    // Decide based on error type
    if (error.message.includes('validation')) {
      // Input validation errors - just log and continue
      return SupervisionDirective.Resume
    } else if (error.message.includes('network')) {
      // Network errors - restart to retry
      return SupervisionDirective.Restart
    } else {
      // Unknown error - escalate to parent
      return SupervisionDirective.Escalate
    }
  }

  // Override strategy if needed
  supervisionStrategy(): Promise<SupervisionStrategy> {
    return Promise.resolve(new MyCustomStrategy())
  }
}

// Register the supervisor
stage().registerSupervisor('my-supervisor', new MyCustomSupervisor())

// Use it when creating actors
const actor = stage().actorFor<Worker>(protocol, undefined, 'my-supervisor')
```

#### Supervision Strategy

Strategies control restart throttling:

```typescript
class MyCustomStrategy extends SupervisionStrategy {
  // Maximum restarts allowed within the period
  intensity(): number {
    return 5  // Allow 5 restarts
  }

  // Time window for measuring restarts (milliseconds)
  period(): number {
    return 10000  // Within 10 seconds
  }

  // Scope of supervision actions
  scope(): SupervisionScope {
    return SupervisionScope.One  // Only restart the failed actor
  }
}
```

#### Actor Lifecycle Hooks

Actors have lifecycle hooks that work with supervision:

```typescript
class MyActor extends Actor {
  // Called before actor starts processing messages
  async beforeStart(): Promise<void> {
    console.log('Initializing actor...')
    // Set up resources not included in synchronous construction
  }

  // Called when actor starts
  async start(): Promise<void> {
    console.log('Actor started')
  }

  // Called before restarting (after failure)
  async beforeRestart(error: Error): Promise<void> {
    console.log('Cleaning up before restart...')
    // Clean up resources
  }

  // Called after restarting
  async afterRestart(error: Error): Promise<void> {
    console.log('Restarting after failure...')
    // Reinitialize resources
  }

  // Called before resuming (after suspension)
  beforeResume(error: Error): void {
    console.log('Resuming after error...')
  }

  // Called before stopping
  async beforeStop(): Promise<void> {
    console.log('Shutting down...')
    // Clean up resources
  }

  // Called after stopping
  async afterStop(): Promise<void> {
    console.log('Actor stopped')
  }
}
```

#### Example: Bank and Teller Supervision

The following is from the DomoActors bank example found in ./examples/bank. This is not as complete as the actual supervisor, but shows the division of responsibility within a supervisor. See the example source code for the full implementation:

```typescript
class BankSupervisor extends DefaultSupervisor {

  inform(error: Error, supervised: Supervised): void {
    // Access the ExecutionContext from the supervised actor's environment
    const executionContext = supervised.actor()
      .lifeCycle()
      .environment()
      .getCurrentMessageExecutionContext()

    const command = executionContext.getValue<string>('command') || 'unknown'
    const request = executionContext.getValue<any>('request') || undefined

    // ...
    const typedRequest = request as DepositRequest

    // Handle the failure - print context-aware error message
    console.log(`\n❌ Error in ${command} => ${typedRequest.accountNumber} due to:\n${error.message}\n`)

    // Direct recovery by using my parent's inform with the decided directive
    super.inform(error, supervised)
  }

  protected decideDirective(
    error: Error,
    supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {

    // decide how the actor will recovered from failure...

    return SupervisionDirective.Resume
  }
}
```

This demonstrates:
- **Separation of concerns**: `inform()` handles failure and recovery, `decideDirective()` only returns the directive
- **Accessing ExecutionContext** in `inform()` for context-aware error reporting
- **Handling the failure** by printing error messages with command context
- **Directing recovery** by calling `super.inform()` which applies the decided directive; could be handled fully here without involving `super.inform()`
- **Resuming after validation errors** - teller state is fine, just bad input

## Advanced Features

### Scheduling

DomoActors provides a scheduler for delayed and periodic tasks:

```typescript
import { Scheduled } from 'domo-actors'

class MyActor extends Actor {
  private scheduled?: Scheduled

  async beforeStart(): Promise<void> {
    // Schedule a one-time delayed task
    this.scheduled = this.scheduler().scheduleOnce(
      () => this.doPeriodicWork(),
      5000  // Delay in milliseconds
    )
  }

  async doPeriodicWork(): Promise<void> {
    console.log('Doing periodic work...')

    // Schedule next execution
    this.scheduled = this.scheduler().scheduleOnce(
      () => this.doPeriodicWork(),
      10000  // 10 seconds
    )
  }

  async beforeStop(): Promise<void> {
    // Cancel scheduled task
    if (this.scheduled) {
      this.scheduled.cancel()
    }
  }
}
```

### Stage Value Registry

The Stage Value Registry provides a centralized mechanism for registering and sharing runtime objects across all actors in your application. This is particularly useful for dependency injection, configuration management, and resource pooling.

#### Overview

Instead of passing dependencies through actor constructors or maintaining global state, you can register values on the Stage and retrieve them from any actor:

```typescript
import { stage } from 'domo-actors'

// Register shared resources at application startup
const database = new DatabaseConnection('postgresql://localhost:5432/mydb')
const config = { apiKey: 'secret-key', timeout: 5000, maxRetries: 3 }

stage().registerValue('myapp:database', database)
stage().registerValue('myapp:config', config)
```

#### Registering Values

Use `registerValue<V>(name: string, value: V)` to register any runtime object:

```typescript
// Database connections
const dbPool = new ConnectionPool(10, 'postgresql://localhost:5432/db')
stage().registerValue<ConnectionPool>('myapp:dbPool', dbPool)

// Configuration objects
interface AppConfig {
  apiKey: string
  timeout: number
  maxRetries: number
}
const config: AppConfig = { apiKey: 'key', timeout: 5000, maxRetries: 3 }
stage().registerValue<AppConfig>('myapp:config', config)

// Service instances
const userService = new UserService()
stage().registerValue<UserService>('services:user', userService)

// Even primitives and functions
stage().registerValue<string>('app:version', '1.0.0')
stage().registerValue<(msg: string) => void>('app:logger', console.log)
```

#### Retrieving Values

Use `registeredValue<V>(name: string): V` to retrieve registered values from any actor:

```typescript
class UserRepositoryActor extends Actor implements UserRepository {
  async findUser(id: string): Promise<User> {
    // Retrieve the database from the stage
    const db = this.stage().registeredValue<DatabaseConnection>('myapp:database')

    // Use it
    return await db.query('SELECT * FROM users WHERE id = ?', [id])
  }
}

class ApiClientActor extends Actor implements ApiClient {
  async makeRequest(endpoint: string): Promise<any> {
    // Retrieve configuration
    const config = this.stage().registeredValue<AppConfig>('myapp:config')

    // Use config values
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      timeout: config.timeout
    })

    return response.json()
  }
}
```

#### Deregistering Values

Use `deregisterValue<V>(name: string): V | undefined` to remove and retrieve registered values:

```typescript
// Register a database
const db = new DatabaseConnection('postgresql://localhost:5432/db')
stage().registerValue('myapp:database', db)

// Later, when shutting down or no longer needed
const removed = stage().deregisterValue<DatabaseConnection>('myapp:database')
if (removed) {
  await removed.close()  // Clean up the resource
  console.log('Database connection closed')
}

// Attempting to access after deregistration throws an error
try {
  stage().registeredValue('myapp:database')
} catch (error) {
  console.error(error.message)  // "No value registered with name: myapp:database"
}

// Deregistering non-existent value returns undefined
const notFound = stage().deregisterValue('nonexistent')
console.log(notFound)  // undefined
```

**Use Cases for Deregistration:**
- **Resource Cleanup**: Close database connections, file handles, or network sockets
- **Hot Reloading**: Swap out implementations at runtime
- **Testing**: Clean up between test runs for isolation
- **Dynamic Configuration**: Update configuration without restarting the application

**Important Warnings:**
- **Timing is Critical**: Ensure no actors are currently using the value before deregistering
- **Race Conditions**: If an actor tries to access a value while it's being deregistered, it will throw an error
- **No Automatic Cleanup**: Deregistration doesn't automatically notify actors; they will error on next access

```typescript
// Good practice: coordinate deregistration
async function shutdownDatabase() {
  // 1. Stop accepting new work
  await stopCreatingNewActors()

  // 2. Wait for existing actors to finish
  await waitForActorsToComplete()

  // 3. Deregister and cleanup
  const db = stage().deregisterValue<Database>('myapp:database')
  if (db) {
    await db.close()
  }
}
```

#### Type Safety

The registry is fully type-safe using TypeScript generics:

```typescript
// Type is inferred from registration
stage().registerValue<AppConfig>('myapp:config', config)

// Type is checked at retrieval
const config = stage().registeredValue<AppConfig>('myapp:config')
// config.apiKey is string (type-safe)
// config.timeout is number (type-safe)
```

#### Error Handling

Attempting to retrieve a non-existent value throws an error:

```typescript
try {
  const value = stage().registeredValue<string>('nonexistent:key')
} catch (error) {
  console.error(error.message)  // "No value registered with name: nonexistent:key"
}
```

#### Naming Conventions

Use namespaced keys to avoid conflicts:

```typescript
// Good - namespaced by application/module
stage().registerValue('myapp:database', db)
stage().registerValue('myapp:config', config)
stage().registerValue('services:user', userService)
stage().registerValue('services:order', orderService)

// Avoid - generic names can conflict
stage().registerValue('database', db)  // Too generic
stage().registerValue('config', config)  // Too generic
```

#### Common Use Cases

**1. Database Connection Management**

```typescript
// Application startup
const pool = new ConnectionPool(10, 'postgresql://localhost:5432/db')
stage().registerValue('myapp:dbPool', pool)

// In actors
class AccountActor extends Actor {
  async save(account: Account): Promise<void> {
    const pool = this.stage().registeredValue<ConnectionPool>('myapp:dbPool')
    const connection = await pool.getConnection()
    try {
      await connection.execute('INSERT INTO accounts...', account)
    } finally {
      connection.release()
    }
  }
}
```

**2. Configuration Management**

```typescript
// Load configuration at startup
const config = loadConfig()  // From file, environment, etc.
stage().registerValue('myapp:config', config)

// Access from any actor
class MyActor extends Actor {
  async process(): Promise<void> {
    const config = this.stage().registeredValue<Config>('myapp:config')
    if (config.featureFlags.enableNewFeature) {
      // Use new feature
    }
  }
}
```

**3. Service Registry Pattern**

```typescript
// Register services
stage().registerValue<UserService>('services:user', new UserService())
stage().registerValue<OrderService>('services:order', new OrderService())
stage().registerValue<PaymentService>('services:payment', new PaymentService())

// Use in actors
class CheckoutActor extends Actor {
  async checkout(userId: string, orderId: string): Promise<void> {
    const userService = this.stage().registeredValue<UserService>('services:user')
    const orderService = this.stage().registeredValue<OrderService>('services:order')
    const paymentService = this.stage().registeredValue<PaymentService>('services:payment')

    const user = await userService.findById(userId)
    const order = await orderService.findById(orderId)
    await paymentService.processPayment(user, order)
  }
}
```

**4. Shared Caches**

```typescript
// Register cache at startup
const cache = new LRUCache<string, any>(1000)
stage().registerValue('myapp:cache', cache)

// Use in actors
class ProductActor extends Actor {
  async getProduct(id: string): Promise<Product> {
    const cache = this.stage().registeredValue<LRUCache>('myapp:cache')

    // Check cache first
    const cached = cache.get(`product:${id}`)
    if (cached) return cached

    // Fetch and cache
    const product = await this.fetchFromDatabase(id)
    cache.set(`product:${id}`, product)
    return product
  }
}
```

#### Benefits

1. **Dependency Injection**: Share dependencies without coupling actors to specific implementations
2. **Configuration Management**: Centralized configuration accessible from any actor
3. **Resource Pooling**: Share expensive resources (connections, caches) across actors
4. **Type Safety**: Full TypeScript type inference and checking
5. **Testability**: Easy to inject mock/stub implementations for testing
6. **Decoupling**: Actors don't need to know how dependencies are created

#### Best Practices

1. **Register at Startup**: Register all values before creating actors that depend on them
2. **Use Namespaced Keys**: Prefix keys with your app/module name (e.g., `'myapp:database'`)
3. **Type Everything**: Always use generic type parameters for type safety
4. **Immutable Values**: Prefer immutable configuration objects
5. **Document Dependencies**: Document what values actors expect to be registered
6. **Test with Mocks**: Register test doubles during testing

```typescript
// Good practice
class MyActor extends Actor {
  // Document expected registered values
  // Expects: 'myapp:database' (DatabaseConnection)
  // Expects: 'myapp:config' (AppConfig)

  async process(data: string): Promise<void> {
    const db = this.stage().registeredValue<DatabaseConnection>('myapp:database')
    const config = this.stage().registeredValue<AppConfig>('myapp:config')
    // ...
  }
}
```

#### Testing with Value Registry

In tests, register mock implementations and clean up afterward:

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest'

describe('MyActor', () => {
  beforeEach(() => {
    // Register mock for this test
    const mockDb = {
      query: async (sql: string) => [{ id: 1, name: 'Test User' }]
    }
    stage().registerValue('myapp:database', mockDb)
  })

  afterEach(() => {
    // Clean up after each test
    stage().deregisterValue('myapp:database')
  })

  it('should process data using database', async () => {
    const actor = stage().actorFor<MyActor>(protocol)

    await actor.process('test data')
    // Actor uses mockDb instead of real database
  })

  it('should handle different mock behaviors', async () => {
    // Override the mock for this specific test
    const differentMock = {
      query: async () => []  // Empty results
    }
    stage().registerValue('myapp:database', differentMock)

    const actor = stage().actorFor<MyActor>(protocol)
    // Test with different behavior
  })
})
```

### Dead Letters

Messages that cannot be delivered are sent to the dead letter office:

```typescript
// Access dead letters from actor
this.deadLetters().failedDelivery(deadLetter)

// Or from stage
const deadLetters = stage().deadLetters()

// Register a listener
class MyDeadLettersListener implements DeadLettersListener {
  handle(deadLetter: DeadLetter): void {
    console.log(`Dead letter: ${deadLetter.representation()}`)
  }
}

deadLetters.registerListener(new MyDeadLettersListener())
```

### State Management

Actors can expose state snapshots for persistence or testing:

```typescript
class MyActor extends Actor {
  private count = 0
  private items: string[] = []

  // Getter overload
  stateSnapshot<MyState>(): MyState

  // Setter overload
  stateSnapshot<MyState>(state: MyState): void

  // Implementation
  stateSnapshot<MyState>(state?: MyState): MyState | void {
    if (state !== undefined) {
      // Restore state
      this.count = state.count
      this.items = [...state.items]
    } else {
      // Return current state
      return {
        count: this.count,
        items: [...this.items]
      } as MyState
    }
  }
}
```

### Actor Addresses

Every actor has a unique address:

```typescript
const address = actor.address()
console.log(address.valueAsString())  // UUID v7 format

// Look up actor by address
const foundActor = await stage().actorOf(address)
```

### Logging

Actors have access to a logger:

```typescript
class MyActor extends Actor {
  async process(data: string): Promise<void> {
    this.logger().log('Processing data...')
    this.logger().error('An error occurred', new Error('Oops'))
  }
}
```

## TestKit

DomoActors includes comprehensive testing utilities for writing reliable actor tests. See [TestKit.md](./TestKit.md) for complete documentation.

### ObservableState

Enable actors to expose internal state for testing without breaking encapsulation:

```typescript
import { ObservableState, ObservableStateProvider } from 'domo-actors'

class CounterActor extends Actor implements Counter, ObservableStateProvider {
  private count = 0

  async increment(): Promise<void> {
    this.count++
  }

  // Expose state for testing
  async observableState(): Promise<ObservableState> {
    return new ObservableState()
      .putValue('count', this.count)
  }
}

// In tests:
const counter = stage().actorFor<Counter & ObservableStateProvider>(counterProtocol)

await counter.increment()
await counter.increment()

const state = await counter.observableState()
expect(state.valueOf('count')).toBe(2)
```

### Test Await Utilities

Wait for asynchronous actor operations to complete:

```typescript
import { awaitObservableState, awaitStateValue, awaitAssert } from 'domo-actors'

// Wait for state condition
await awaitObservableState(
  actor,
  state => state.valueOf('count') === 5,
  { timeout: 1000, interval: 50 }
)

// Wait for specific value
await awaitStateValue(actor, 'status', 'ready', { timeout: 500 })

// Wait for assertion to pass
await awaitAssert(async () => {
  const count = await actor.getCount()
  expect(count).toBe(10)
}, { timeout: 2000 })
```

### Dead Letters Testing

Capture and inspect dead letters in tests:

```typescript
import { TestDeadLettersListener } from 'domo-actors'

const listener = new TestDeadLettersListener()
stage().deadLetters().registerListener(listener)

// Trigger dead letter...

expect(listener.count()).toBe(1)
expect(listener.latest()?.representation()).toContain('myMethod')
```

## Examples

### Bank Example

The bank example demonstrates a complete actor-based banking system with:

- Account management with transaction history
- Multi-step transfer coordination with retry logic
- "Let it crash" supervision with context-aware error reporting
- Parent-child actor hierarchies
- Self-messaging patterns

See `examples/bank/` for the complete implementation.

Key actors:
- **BankActor**: Top-level coordinator
- **TellerActor**: CLI command handler with supervision
- **AccountActor**: Account operations with child transaction history
- **TransferCoordinatorActor**: Complex transfer workflow with retries
- **TransactionHistoryActor**: Immutable transaction log

Key supervisors:
- **BankSupervisor**: Manages Bank and Teller failures
- **AccountSupervisor**: Handles Account errors and failures
- **TransferSupervisor**: Handles Transfer failures and retries

All supervisors use `ExecutionContext` collaborator propagation to see the primary bank request and parameter details. To see supervisors in action, enter some bogus data in a bank command prompt, such as an invalid monetary value (e.g. blah rather than 100.00).

One detail that you will notice is that JavaScript `Promise` rejections are returned up the `await` call stack such that if multiple supervisors are registered along the call stack, all supervisors will be informed of a single failure. For example, when there is a Account failure, the call stack looks like this:

```
(3) Account -> AccountSupervisor
(2) Bank -> BankSupervisor
(1) Teller -> BankSupervisor
(0) command function in bank.ts
```

And the following supervisors will be informed in descending order, even though there is no parent-child supervision in this particular chain:
- `AccountSupervisor`
- `BankSupervisor`
  - In some cases `BankSupervisor` may be informed two or more times, such as for the `Bank` and the `Teller`.

In fact, both of these supervisors have the same parent: the `default` supervisor, which is `PublicRootActor`.

This chain of supervision is different from what occurs in a multi-threaded platforms such as when using XOOM/Actors in Java or .NET. In those platforms there is no call stack other than the current Actor's message delivery handler method being invoked from a lambda (function). Thus, there is only ever one informed supervisor unless explicit failure escalation occurs. In the case of the Java and .NET platforms, only `AccountSupervisor` would be informed when an `Account` behavior fails.

The difference in the JavaScript environment is not a problem. It's just different, and it may even offer an advantage in some cases. If you want to avoid multiple supervisors from taking action on a single failure, you can extend `Error` and set a flag in the subclass's instance when the error has been handled by the first supervisor in the call chain. Subsequent supervisors would check for the set flag and only handle and set the flag if it has not already been set.

Run the example:
```bash
npm run example:bank
```

### Encapsulation Demo

The encapsulation demo demonstrates how DomoActors maintains proper encapsulation:

- **Public Protocol Access**: Clients can call actor methods through the protocol interface
- **Hidden Infrastructure**: Internal actor infrastructure (environment, lifecycle, mailbox) is not accessible to clients
- **Symbol-Based Internal Access**: Library code can still manage actors internally using Symbol-based access patterns
- **Type Safety**: TypeScript ensures only the protocol methods are exposed

This demonstrates a key design principle: actors expose only their business logic through protocols while hiding all infrastructure concerns.

Run the example:
```bash
npm run example:encapsulation
```

Expected output:
```
✓ Encapsulation successful - clients cannot access internal infrastructure
✓ Library code can still manage actor hierarchies internally via Symbol
```

The demo shows that:
1. `actor.doWork()` - ✅ Works (public protocol method)
2. `actor.address()` - ✅ Works (public ActorProtocol method)
3. `actor.environment()` - ❌ Fails (internal infrastructure hidden)
4. Library code can still access `environment()` via Symbol-based internal access

## Common Practices

The following are common practices that are sometimes even best practices, but not always, except for supervision and testing, which are pretty much always a best practices. Got all that? ;-)

### Actor Design

1. **Keep actors focused** - Each actor should have a single responsibility
2. **Avoid shared state** - Never share mutable state between actors
3. **Use immutable messages** - Message data should be immutable
4. **Design for failure** - Expect and plan for actor failures
5. **Favor composition** - Build complex systems from simple actors

### Message Passing

1. **Don't await inside actors unnecessarily** - Let messages flow
2. **Use self-messaging for state changes** - Maintain actor semantics
3. **Batch related operations** - Reduce message overhead when appropriate
4. **Handle backpressure** - Use BoundedMailbox for high-load scenarios

### Supervision

1. **Design supervision hierarchies** - Plan who supervises whom
2. **Log supervision events** - Track failures for debugging
3. **Use appropriate directives** - Resume for transient errors, Restart for corruption
4. **Set restart limits** - Prevent infinite restart loops
5. **Use ExecutionContext** - Provide context for better error reporting

### Testing

1. **Use ObservableStateProvider** - Expose state for verification
2. **Test actor protocols** - Verify the public interface
3. **Test supervision** - Ensure error handling works correctly
4. **Use TestKit utilities** - Leverage await helpers
5. **Isolate tests** - Each test should create its own actors

### Dependency Management

1. **Use Stage Value Registry** - Register shared resources (databases, config) for dependency injection
2. **Namespace registry keys** - Use prefixes like `'myapp:database'` to avoid conflicts
3. **Register at startup** - Initialize all shared resources before creating actors
4. **Document dependencies** - Note what registered values each actor expects
5. **Mock in tests** - Register test doubles for isolated testing

### Performance

1. **Pool expensive resources** - Share connections, caches, etc. via Value Registry
2. **Use child actors for parallelism** - Spawn workers for concurrent work
3. **Profile message processing** - Identify bottlenecks
4. **Choose appropriate mailbox** - Bounded for backpressure, Array for simplicity
5. **Minimize message size** - Large messages impact performance

## API Reference

Full API documentation is available at: [API Reference](./api/index.html)

Generate documentation locally:
```bash
npm run docs
npm run docs:serve
```

## Troubleshooting

### Actor Not Receiving Messages

**Problem**: Calling actor methods directly

**Solution**: Ensure you're using the proxy returned by `actorFor()`, not the actor instance directly; `actorOf(address: Address)` is used to look up actors that already exist

```typescript
// ❌ Wrong - this directly calls the actor function/method, which is not proper use of the Actor Model
const actor = new MyActor()
actor.process(data)  // Not going through mailbox

// ✅ Correct - create new actor
const actor = stage().actorFor<MyProtocol>(protocol)
actor.process(data)  // Goes through mailbox

// ✅ Correct - look up existing actor
const actor = stage().actorOf(address)
actor.process(data)  // Goes through mailbox
```

### Supervision Not Working

**Problem**: Errors are not being caught by supervisor

**Solution**: Ensure the actor is registered with a supervisor and errors propagate

```typescript
// Register supervisor first
stage().registerSupervisor('my-supervisor', new MySupervisor())

// Then create actor with that supervisor
const actor = stage().actorFor<MyProtocol>(protocol, undefined, 'my-supervisor')
```

### Deadlocks

**Problem**: Actors waiting for each other indefinitely

**Solution**: Avoid circular dependencies and synchronous waits

```typescript
// ❌ Wrong - can cause deadlock
async process(): Promise<void> {
  const result = await this.otherActor.doSomething()
  await this.otherActor.doSomethingElse(result)
}

// ✅ Better - send message and move on
async process(): Promise<void> {
  this.otherActor.doSomething()
  // Don't wait, let it complete asynchronously
}
```

### Memory Leaks

**Problem**: Memory usage grows over time

**Solution**:
1. Clean up resources in `beforeStop()`
2. Cancel scheduled tasks
3. Use BoundedMailbox to prevent unbounded growth
4. Stop actors that are no longer needed

```typescript
async beforeStop(): Promise<void> {
  // Cancel scheduled tasks
  if (this.scheduled) {
    this.scheduled.cancel()
  }

  // Close connections
  await this.connection.close()

  // Stop child actors inside a given actor
  await Promise.all(this.children.forEach(child => child.stop()))
}
```

## Contributing

DomoActors is authored by Vaughn Vernon and maintained as part of the Domo product family.

For issues and feature requests, please visit: https://github.com/VaughnVernon/DomoActors/issues

## License

Licensed under the Reciprocal Public License 1.5

See: LICENSE.md in repository root directory
See: https://opensource.org/license/rpl-1-5

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
