// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { DeadLetter } from "./DeadLetters.js"
import { Mailbox } from "./Mailbox.js"
import { Message, EmptyMessage } from "./Message.js"

/**
 * Unbounded FIFO mailbox implementation using JavaScript arrays.
 *
 * Provides:
 * - Unlimited message queue capacity
 * - First-in-first-out message delivery
 * - Suspension/resumption support
 * - Self-draining dispatch mechanism
 *
 * Default mailbox type used by the stage when no custom mailbox is specified.
 * For capacity-limited queues with overflow handling, see BoundedMailbox.
 */
export class ArrayMailbox implements Mailbox {
  private closed: boolean
  private suspended: boolean
  private queue: Message[]

  /**
   * Creates a new unbounded array mailbox.
   * Initializes with empty queue in open, non-suspended state.
   */
  constructor() {
    this.closed = false
    this.suspended = false
    this.queue = []
  }

  /**
   * Closes the mailbox, preventing further message delivery.
   * Messages sent after close are routed to dead letters.
   */
  close(): void {
    this.closed = true
  }

  /**
   * Returns whether the mailbox is closed.
   * @returns true if closed, false otherwise
   */
  isClosed(): boolean {
    return this.closed
  }

  /**
   * Suspends message processing.
   * Messages can still be queued but won't be delivered until resumed.
   */
  suspend(): void {
    this.suspended = true
  }

  /**
   * Resumes message processing after suspension.
   * Triggers dispatch if messages are queued.
   */
  resume(): void {
    this.suspended = false
    // Trigger dispatch if there are queued messages
    if (this.isReceivable()) {
      this.dispatch()
    }
  }

  /**
   * Returns whether the mailbox is currently suspended.
   * @returns true if suspended, false otherwise
   */
  isSuspended(): boolean {
    return this.suspended
  }

  /**
   * Self-draining async message delivery.
   * Dequeues and delivers the next message, then recursively processes
   * any additional messages that were enqueued during delivery.
   * This prevents message starvation when concurrent send() calls occur.
   */
  async dispatch(): Promise<void> {
    const message = this.receive()

    if (!message.isDeliverable()) {
      return  // Queue is empty, another dispatch() already processed it
    }

    // Deliver message (errors handled internally by message)
    await message.deliver()

    // Check if more messages arrived while we were processing
    if (this.isReceivable()) {
      await this.dispatch()  // Recursively process next message
    }
  }

  /**
   * Checks if the mailbox can deliver messages.
   * Returns true only if all conditions are met:
   * - Mailbox is not closed
   * - Mailbox is not suspended
   * - Queue has at least one message
   *
   * @returns true if messages can be delivered, false otherwise
   */
  isReceivable(): boolean {
    return !this.isClosed() && !this.isSuspended() && this.queue.length > 0
  }

  /**
   * Dequeues and returns the next message from the mailbox.
   * Returns EmptyMessage if the queue is empty.
   *
   * @returns The next message or EmptyMessage if queue is empty
   */
  receive(): Message {
    const maybeMessage = this.queue.shift()

    return maybeMessage ?  maybeMessage : EmptyMessage
  }

  /**
   * Enqueues a message for delivery to the actor.
   *
   * Behavior:
   * - If closed: Routes message to dead letters and resolves with 'actor stopped'
   * - If suspended: Queues message but does not trigger dispatch
   * - Otherwise: Queues message and triggers dispatch
   *
   * @param message The message to send
   */
  send(message: Message): void {
    if (!this.isClosed()) {
      this.queue.push(message)
      // Only dispatch if not suspended
      if (!this.isSuspended()) {
        this.dispatch()
      }
    } else {
      const deadLetter = new DeadLetter(message.to(), message.representation())
      message.to().stage().deadLetters().failedDelivery(deadLetter)
      message.deferred().resolve('actor stopped')
    }
  }
}