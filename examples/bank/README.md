# DomoActors Bank Example

A comprehensive banking system demonstrating advanced DomoActors patterns and best practices.

## Overview

This example implements a realistic banking system with accounts, transactions, and inter-account transfers. It showcases sophisticated actor model patterns including parent-child hierarchies, self-messaging, supervision strategies, and eventual consistency.

## What This Example Demonstrates

### Core Actor Patterns

1. **Parent-Child Actor Hierarchies**
   - `Bank` creates and manages `Account` and `TransferCoordinator` actors
   - `Account` creates a child `TransactionHistory` actor for audit trail
   - Proper lifecycle management with `beforeStart()` hooks

2. **Self-Messaging for State Changes**
   - All state modifications go through the mailbox using `selfAs<T>()`
   - Demonstrates proper async message flow vs direct synchronous calls
   - Example: `TransferCoordinator` sends messages to itself for each step

3. **Realistic Multi-Step Coordination**
   - Transfer flow: Withdraw → Record Pending → Deposit → Retry/Refund
   - Each step is a separate async message through the mailbox
   - Exponential backoff retry logic with scheduled messages

4. **Supervision Strategies**
   - Three supervision strategies for different actor types
   - Resume for business errors (insufficient funds, invalid amounts)
   - Restart for state corruption or unexpected errors

5. **Message-Driven Architecture**
   - No direct method calls for state changes
   - All operations flow through actor mailboxes
   - Maintains proper actor model semantics

## Actor Hierarchy

```
Bank (root)
├── TransferCoordinator (long-lived child)
│   └── Manages all pending transfers
│   └── Coordinates multi-step transfer flow
└── Account (per-account child)
    └── TransactionHistory (per-account child)
        └── Immutable transaction log
```

## Transfer Flow

The transfer coordinator implements a realistic banking transfer with intermediate states:

```
1. INITIATE
   └─> Withdraw from source account
       │
       ▼
2. RECORD PENDING (self-send)
   └─> Store pending transfer state
       │
       ▼
3. ATTEMPT DEPOSIT (self-send)
   └─> Try to deposit to destination
       │
       ├─> SUCCESS: Complete transfer (self-send)
       │
       └─> FAILURE: Handle failure (self-send)
           │
           ├─> Attempts < MAX: Retry with backoff (self-send)
           │
           └─> Max attempts: Refund to source (self-send)
```

Each arrow represents an **async message** through the mailbox, not a direct call.

### Transfer Details

The transfer system demonstrates a sophisticated multi-actor coordination pattern with **self-messaging**, **retry logic**, and **compensating transactions**. Here's the complete flow:

#### Actors Involved

1. **TellerActor** - User interface, validates input
2. **BankActor** - Validates business rules, delegates to coordinator
3. **TransferCoordinatorActor** - Orchestrates the multi-step transfer process
4. **AccountActor (2 instances)** - Source and destination accounts
5. **TransactionHistoryActor** - Records each account's transaction history

#### Transfer Flow - Happy Path

```
User → Teller → Bank → TransferCoordinator → Accounts
```

**Step-by-Step Process:**

**1. User Initiates Transfer** (via TellerActor)
```typescript
// TellerActor.transfer()
await this.bank.transfer(fromAccountId, toAccountId, amount)
```
- Validates input (amount is number, IDs not empty)
- Forwards to Bank

**2. Bank Validates Business Rules** (BankActor)
```typescript
// BankActor.transfer()
- Validates amount > 0
- Validates fromAccountId ≠ toAccountId
- Validates both accounts exist
- Delegates to TransferCoordinator
```

**3. Transfer Coordinator Executes 3-Phase Transfer** (TransferCoordinatorActor)

This is where the magic happens using **self-messaging** to create a state machine:

**Phase 1: Withdraw**
```typescript
// Synchronous - happens immediately
const fromAccount = this.accounts.get(fromAccountId)
await fromAccount.withdraw(amount)  // Throws if insufficient funds
```
- Withdraws funds from source account
- AccountActor reduces balance and records transaction
- **Critical**: If this fails, transfer stops (no cleanup needed)

**Phase 2: Record Pending**
```typescript
// ASYNC - self-message via mailbox
this.self.recordPendingTransfer({
  transactionId,
  fromAccountId,
  toAccountId,
  amount,
  status: 'withdrawn',  // Funds withdrawn but not yet deposited
  withdrawnAt: new Date(),
  attempts: 0
})
```
- Stores transfer in pending state
- This ensures we can recover if deposit fails
- Happens asynchronously through mailbox

**Phase 3: Attempt Deposit**
```typescript
// ASYNC - self-message via mailbox
this.self.attemptDeposit(transactionId)

// When processed:
await toAccount.deposit(transfer.amount)
this.self.completeTransfer(transactionId)  // Success!
```
- Deposits funds to destination account
- If successful, marks transfer complete
- If fails, triggers retry logic

#### Transfer Flow - Failure & Recovery

**Deposit Failure Handling**

If deposit fails (network error, account closed, etc.):

**Retry Logic with Exponential Backoff:**
```typescript
// handleDepositFailure()
if (attempts < 3) {
  const delay = 1000ms * 2^(attempts-1)  // 1s, 2s, 4s

  // Schedule retry
  scheduler.scheduleOnce(
    () => this.self.attemptDeposit(transactionId),
    delay
  )
}
```
- Attempt 1: Retry after 1 second
- Attempt 2: Retry after 2 seconds
- Attempt 3: Retry after 4 seconds

**Compensating Transaction (Refund):**
```typescript
// If max retries exceeded
if (attempts >= 3) {
  this.self.processRefund(transactionId, reason)
}

// processRefund()
await fromAccount.refund(amount, transactionId, reason)
this.self.completeTransfer(transactionId)
```
- Returns funds to source account
- Records refund transaction with reason
- Marks transfer as 'refunded'

#### Key Design Patterns Demonstrated

**1. Self-Messaging State Machine**
```typescript
// All state transitions go through mailbox
this.self.recordPendingTransfer(...)  // State: withdrawn
this.self.attemptDeposit(...)         // State: attempting deposit
this.self.completeTransfer(...)       // State: completed
this.self.processRefund(...)          // State: refunded
```
- Maintains actor model semantics
- Each step is a separate message
- No race conditions

**2. Eventual Consistency**
```typescript
initiateTransfer() {
  await fromAccount.withdraw()  // Synchronous - must succeed
  this.self.recordPending(...)   // Async - will happen soon
  this.self.attemptDeposit(...)  // Async - will happen after
}
```
- Withdraw is immediate (strong consistency)
- Rest of flow is eventual (resilient to failures)

**3. Saga Pattern (Compensating Transactions)**
```
Success Path:  Withdraw → Deposit → Complete
Failure Path:  Withdraw → Deposit (fails) → Retry → Refund → Complete
```

**4. Retry with Exponential Backoff**
```
Attempt 1: Immediate
Attempt 2: +1s delay
Attempt 3: +2s delay
Attempt 4: +4s delay
Then: Refund
```

#### Transaction States

```typescript
type TransferStatus =
  | 'withdrawn'        // Funds taken from source, pending deposit
  | 'completed'        // Successfully deposited to destination
  | 'failed-deposit'   // Deposit failed after retries
  | 'refunded'         // Funds returned to source
```

#### Actor Message Flow Diagram

```
User Input
  ↓
[TellerActor] ────────→ [BankActor]
                          ↓
                    Validation OK
                          ↓
                   [TransferCoordinator]
                          ↓
                    ┌─────┴─────┐
                    ↓           ↓
              [FromAccount]  [ToAccount]
                    │           │
              withdraw()    deposit()
                    │           │
                    ↓           ↓
           [TransactionHistory (From)]
           [TransactionHistory (To)]

If Deposit Fails:
  [TransferCoordinator]
         ↓
    Retry 1-3 times
         ↓
    If still fails
         ↓
   [FromAccount].refund()
         ↓
   [TransactionHistory (From)]
```

#### Benefits of This Design

1. **Fault Tolerance** - Retries handle transient failures
2. **Data Integrity** - Refunds ensure no money is lost
3. **Auditability** - All steps recorded in transaction history
4. **Resilience** - State machine can resume after crashes
5. **Actor Model Purity** - Pure message passing, no shared state
6. **Testability** - Each step is a separate, testable message handler

#### Example Scenarios

**Success:**
```
1. Withdraw $100 from Account-A ✓
2. Record pending transfer ✓
3. Deposit $100 to Account-B ✓
4. Mark complete ✓
Result: Transfer successful
```

**Failure with Retry:**
```
1. Withdraw $100 from Account-A ✓
2. Record pending transfer ✓
3. Deposit to Account-B ✗ (network error)
4. Wait 1s, retry deposit ✓
5. Mark complete ✓
Result: Transfer successful (after 1 retry)
```

**Failure with Refund:**
```
1. Withdraw $100 from Account-A ✓
2. Record pending transfer ✓
3. Deposit to Account-B ✗ (account closed)
4. Wait 1s, retry ✗
5. Wait 2s, retry ✗
6. Wait 4s, retry ✗
7. Refund $100 to Account-A ✓
8. Mark complete (status: refunded) ✓
Result: Transfer failed, money returned
```

This demonstrates a production-ready transfer system using pure actor model patterns!

## Key Features

### Self-Messaging Pattern

Traditional (incorrect):
```typescript
async recordPendingTransfer(transfer: PendingTransfer): Promise<void> {
  this.pendingTransfers.set(transfer.transactionId, transfer)  // ❌ Direct call
}
```

DomoActors (correct):
```typescript
async beforeStart(): Promise<void> {
  this.self = this.selfAs<TransferCoordinator>()  // Get proxy
}

async initiateTransfer(...): Promise<string> {
  // Self-send - goes through mailbox
  this.self.recordPendingTransfer(transfer)  // ✅ Async message

  // Another self-send
  this.self.attemptDeposit(transactionId)  // ✅ Async message
}

async recordPendingTransfer(transfer: PendingTransfer): Promise<void> {
  // Message handler - executes when message processed from mailbox
  this.pendingTransfers.set(transfer.transactionId, transfer)
}
```

### Realistic Transfer Coordination

Unlike simple examples that show atomic two-phase commits, this example demonstrates:

- **Intermediate State**: Funds are withdrawn before deposit attempt
- **Retry Logic**: Failed deposits retry with exponential backoff
- **Eventual Consistency**: Transfers may take time to complete
- **Refund Mechanism**: Failed transfers refund to source with audit trail
- **Pending Tracking**: View transfers in progress

### Supervision Strategies

#### AccountSupervisor
- **Resume** for business errors (insufficient funds, invalid amounts)
- **Restart** for unexpected errors or state corruption

#### TransferSupervisor
- **Resume** for account lookup failures, validation errors
- **Restart** for coordinator state corruption

#### BankSupervisor
- **Resume** for validation errors, delegates to child supervisors
- **Restart** for bank-level state corruption

## Running the Example

### Prerequisites

```bash
# Build DomoActors
npm install
npm run build
```

### Start the CLI

```bash
# From the DomoActors root directory
npm run example:bank
```

This will build both the library and the example, then run the bank CLI.

### Sample Session

```
🏦 Starting DomoActors Bank Example...

✅ Bank system initialized

╔════════════════════════════════════════╗
║       DomoActors Bank Example          ║
╠════════════════════════════════════════╣
║  1. Create Account                     ║
║  2. Deposit Money                      ║
║  3. Withdraw Money                     ║
║  4. Transfer Money                     ║
║  5. View Account Info                  ║
║  6. View Transaction History           ║
║  7. List All Accounts                  ║
║  8. View Pending Transfers             ║
║  0. Exit                               ║
╚════════════════════════════════════════╝

Enter choice (1-8 or 0): 1

--- Create Account ---
Owner name: Alice
Account type (checking/savings): checking
Initial balance: $1000
✅ Account created successfully: ACC000001
```

## Code Highlights

### Creating Child Actors

```typescript
// From AccountActor.ts
async beforeStart(): Promise<void> {
  // Create child actor for transaction history
  const historyProtocol: Protocol = {
    type: () => 'TransactionHistory',
    instantiator: () => ({
      instantiate: () => new TransactionHistoryActor()
    })
  }

  const historyDefinition = new Definition(
    'TransactionHistory',
    this.address(),
    []
  )

  this.transactionHistory = this.childActorFor<TransactionHistory>(
    historyProtocol,
    historyDefinition
  )
}
```

### Retry with Exponential Backoff

```typescript
// From TransferCoordinatorActor.ts
async handleDepositFailure(transactionId: string, reason: string): Promise<void> {
  const transfer = this.pendingTransfers.get(transactionId)
  if (!transfer) return

  const attempts = (transfer.attempts || 0) + 1
  transfer.attempts = attempts

  if (attempts < MAX_RETRY_ATTEMPTS) {
    // Schedule retry with exponential backoff
    const delay = RETRY_DELAY_MS * Math.pow(2, attempts - 1)

    this.scheduler().schedule(
      { task: () => this.self.attemptDeposit(transactionId) },
      delay
    )
  } else {
    // Max retries: refund
    this.self.processRefund(transactionId, reason)
  }
}
```

### Refund with Audit Trail

```typescript
// From AccountActor.ts
async refund(amount: number, transactionId: string, reason: string): Promise<number> {
  this.balance += amount

  await this.transactionHistory.recordTransaction({
    id: `refund-${transactionId}`,
    type: 'refund',
    amount,
    balance: this.balance,
    timestamp: new Date(),
    description: `Refund for transaction ${transactionId}`,
    refundReason: reason  // Audit trail
  })

  return this.balance
}
```

## Project Structure

```
examples/bank/
├── actors/
│   ├── AccountActor.ts              # Account management
│   ├── BankActor.ts                 # Root coordinator
│   ├── TransactionHistoryActor.ts   # Immutable transaction log
│   └── TransferCoordinatorActor.ts  # Multi-step transfer coordination
├── supervisors/
│   ├── AccountSupervisor.ts         # Account error handling
│   ├── BankSupervisor.ts            # Bank error handling
│   └── TransferSupervisor.ts        # Transfer error handling
├── types.ts                         # Shared types
├── bank.ts                          # CLI interface
└── README.md                        # This file
```

## Learning Path

1. **Start with TransactionHistoryActor.ts**
   - Simple self-messaging pattern
   - Single state array
   - Good introduction to `selfAs<T>()`

2. **Move to AccountActor.ts**
   - Parent-child relationship
   - Creating child actors in `beforeStart()`
   - Business logic with validation

3. **Study TransferCoordinatorActor.ts**
   - Complex state machine
   - Multiple self-sends per operation
   - Retry logic with scheduling
   - Demonstrates why self-messaging is essential

4. **Examine BankActor.ts**
   - Root coordinator pattern
   - Managing multiple child actors
   - Delegating to child actors

5. **Review Supervision Strategies**
   - Different strategies for different error types
   - Resume vs Restart decisions
   - Error handling philosophy

## Testing Ideas

Try these scenarios to see the actor model in action:

1. **Insufficient Funds Transfer**
   - Create two accounts
   - Try to transfer more than available
   - See supervision resume the actor

2. **Concurrent Operations**
   - Make multiple deposits/withdrawals rapidly
   - All operations serialize through mailbox
   - No race conditions

3. **Pending Transfers**
   - Initiate a transfer
   - Immediately check pending transfers (option 8)
   - See intermediate state

4. **Transaction History**
   - Perform various operations
   - View complete audit trail
   - See refunds with reasons

## Key Takeaways

1. **Always use `selfAs<T>()` for state changes** - Direct calls bypass the mailbox
2. **Self-messaging enables sophisticated coordination** - Each step is a separate message
3. **Supervision strategies provide resilience** - Actors recover from errors appropriately
4. **Parent-child hierarchies organize complexity** - Each actor has clear responsibilities
5. **Message-driven architecture ensures correctness** - No race conditions, proper serialization

## Next Steps

Consider extending this example:

- Add interest calculation for savings accounts
- Implement scheduled transfers
- Add account closure with final balance transfer
- Create a second bank for inter-bank transfers
- Add persistent event sourcing

## License

Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
Copyright © 2012-2025 Kalele, Inc. All rights reserved.

Licensed under the Reciprocal Public License 1.5

See: LICENSE.md in repository root directory
See: https://opensource.org/license/rpl-1-5

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
