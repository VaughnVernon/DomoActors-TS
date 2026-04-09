// Copyright © 2012-2026 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2026 Kalele, Inc. All rights reserved.
//
// See: LICENSE.md in repository root directory
//
// This file is part of DomoActors-TS.
//
// DomoActors-TS is free software: you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation, either version 3 of
// the License, or (at your option) any later version.
//
// DomoActors-TS is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with DomoActors-TS. If not, see <https://www.gnu.org/licenses/>.

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
  private dispatching: boolean
  private suspended: boolean
  private queue: Message[]

  /**
   * Creates a new unbounded array mailbox.
   * Initializes with empty queue in open, non-suspended state.
   */
  constructor() {
    this.closed = false
    this.dispatching = false
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
   * Processes messages one at a time from the queue.
   * Only one dispatch loop runs at a time — concurrent callers
   * (send, resume) return immediately when a loop is active.
   * The active loop re-checks isReceivable() after each message,
   * so it will pick up messages queued during delivery and also
   * resume processing after supervisor-triggered un-suspension.
   */
  async dispatch(): Promise<void> {
    if (this.dispatching) return
    this.dispatching = true
    try {
      while (this.isReceivable()) {
        const message = this.receive()
        if (!message.isDeliverable()) {
          break
        }
        await message.deliver()
      }
    } finally {
      this.dispatching = false
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
