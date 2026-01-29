// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Message } from "./Message.js"

/**
 * Message queue for an actor.
 *
 * Mailboxes manage message delivery to actors, providing:
 * - Asynchronous message queueing
 * - Lifecycle control (suspend/resume/close)
 * - Self-draining dispatch mechanism
 *
 * Implementations:
 * - ArrayMailbox: Unbounded FIFO queue using JavaScript arrays
 * - BoundedMailbox: Capacity-limited queue with overflow policies
 *
 * Key characteristics:
 * - Messages are delivered one at a time (no concurrent processing)
 * - Suspension queues messages without delivering them
 * - Closing routes new messages to dead letters
 */
export interface Mailbox {
  /**
   * Closes the mailbox, preventing further message delivery.
   * Messages sent after close are routed to dead letters.
   */
  close(): void

  /**
   * Returns whether the mailbox is closed.
   * @returns true if closed, false otherwise
   */
  isClosed(): boolean

  /**
   * Suspends message processing.
   * Messages can still be queued but won't be delivered until resumed.
   */
  suspend(): void

  /**
   * Resumes message processing after suspension.
   * Triggers dispatch if messages are queued.
   */
  resume(): void

  /**
   * Returns whether the mailbox is currently suspended.
   * @returns true if suspended, false otherwise
   */
  isSuspended(): boolean

  /**
   * Dequeues and delivers the next message asynchronously.
   * Self-draining: recursively processes additional messages that arrived during delivery.
   * @returns Promise that resolves when dispatch completes
   */
  dispatch(): Promise<void>

  /**
   * Checks if the mailbox can deliver messages.
   * @returns true if not closed, not suspended, and has queued messages
   */
  isReceivable(): boolean

  /**
   * Dequeues and returns the next message.
   * @returns The next message or EmptyMessage if queue is empty
   */
  receive(): Message

  /**
   * Enqueues a message for delivery to the actor.
   * Triggers dispatch if mailbox is not suspended.
   * @param message The message to send
   */
  send(message: Message): void
}