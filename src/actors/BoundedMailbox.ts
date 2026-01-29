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
import { OverflowPolicy } from "./OverflowPolicy.js"

/**
 * A bounded mailbox with configurable capacity and overflow handling.
 * Provides memory safety by limiting the maximum number of queued messages.
 *
 * When the mailbox reaches capacity, the overflow policy determines what happens:
 * - DropOldest: Remove the oldest message to make room for the new one
 * - DropNewest: Reject the incoming message
 * - Reject: Send the incoming message to dead letters
 */
export class BoundedMailbox implements Mailbox {
  private closed: boolean
  private suspended: boolean
  private queue: Message[]
  private readonly capacity: number
  private readonly overflowPolicy: OverflowPolicy
  private _droppedMessageCount: number = 0

  /**
   * Creates a bounded mailbox with the specified capacity and overflow policy.
   *
   * @param capacity Maximum number of messages that can be queued
   * @param overflowPolicy How to handle messages when at capacity
   * @throws Error if capacity is not positive
   * @example
   * ```typescript
   * // Drop oldest messages when full
   * const mailbox = new BoundedMailbox(100, OverflowPolicy.DropOldest)
   *
   * // Reject new messages when full (send to dead letters)
   * const mailbox = new BoundedMailbox(50, OverflowPolicy.Reject)
   * ```
   */
  constructor(capacity: number, overflowPolicy: OverflowPolicy) {
    if (capacity <= 0) {
      throw new Error('Mailbox capacity must be positive')
    }
    this.capacity = capacity
    this.overflowPolicy = overflowPolicy
    this.closed = false
    this.suspended = false
    this.queue = []
  }

  /**
   * Closes the mailbox, preventing further message delivery.
   * Any messages sent after close will be routed to dead letters.
   */
  close(): void {
    this.closed = true
  }

  /**
   * Returns whether the mailbox is closed.
   *
   * @returns true if the mailbox is closed, false otherwise
   */
  isClosed(): boolean {
    return this.closed
  }

  /**
   * Suspends message processing.
   * Messages can still be queued but will not be delivered until resumed.
   */
  suspend(): void {
    this.suspended = true
  }

  /**
   * Resumes message processing after suspension.
   * Triggers dispatch if there are queued messages.
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
   *
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

    return maybeMessage ? maybeMessage : EmptyMessage
  }

  /**
   * Sends a message to the mailbox, applying overflow policy if at capacity.
   *
   * Behavior:
   * - If closed: Routes message to dead letters and resolves with 'actor stopped'
   * - If at capacity: Applies configured overflow policy (DropOldest/DropNewest/Reject)
   * - If suspended: Queues message but does not trigger dispatch
   * - Otherwise: Queues message and triggers dispatch
   *
   * @param message The message to send
   */
  send(message: Message): void {
    if (this.isClosed()) {
      const deadLetter = new DeadLetter(message.to(), message.representation())
      message.to().stage().deadLetters().failedDelivery(deadLetter)
      message.deferred().resolve('actor stopped')
      return
    }

    // Check if at capacity
    if (this.queue.length >= this.capacity) {
      this.handleOverflow(message)
    } else {
      this.queue.push(message)
      // Only dispatch if not suspended
      if (!this.isSuspended()) {
        this.dispatch()
      }
    }
  }

  /**
   * Handles overflow according to the configured policy.
   *
   * Policy behaviors:
   * - DropOldest: Removes oldest message, adds new one, increments dropped count
   * - DropNewest: Rejects incoming message, increments dropped count
   * - Reject: Sends incoming message to dead letters, increments dropped count
   *
   * All policies resolve the dropped message's promise so senders aren't left hanging.
   *
   * @param newMessage The message that triggered overflow
   */
  private handleOverflow(newMessage: Message): void {
    switch (this.overflowPolicy) {
      case OverflowPolicy.DropOldest:
        // Remove oldest message, add new one
        const droppedOldest = this.queue.shift()!
        this.notifyDropped(droppedOldest)
        this.queue.push(newMessage)
        this._droppedMessageCount++
        // Dispatch the new message if not suspended
        if (!this.isSuspended()) {
          this.dispatch()
        }
        break

      case OverflowPolicy.DropNewest:
        // Drop the incoming message
        this.notifyDropped(newMessage)
        this._droppedMessageCount++
        break

      case OverflowPolicy.Reject:
        // Send to dead letters
        const deadLetter = new DeadLetter(
          newMessage.to(),
          newMessage.representation()
        )
        newMessage.to().stage().deadLetters().failedDelivery(deadLetter)
        newMessage.deferred().resolve('mailbox full')
        this._droppedMessageCount++
        break
    }
  }

  /**
   * Resolves the promise for a dropped message so sender isn't left hanging.
   */
  private notifyDropped(message: Message): void {
    message.deferred().resolve('message dropped due to overflow')
  }

  /**
   * Returns the number of messages dropped due to overflow since creation.
   */
  droppedMessageCount(): number {
    return this._droppedMessageCount
  }

  /**
   * Returns the current number of queued messages.
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Returns the maximum capacity of this mailbox.
   */
  getCapacity(): number {
    return this.capacity
  }

  /**
   * Returns whether the mailbox is at capacity.
   */
  isFull(): boolean {
    return this.queue.length >= this.capacity
  }
}
