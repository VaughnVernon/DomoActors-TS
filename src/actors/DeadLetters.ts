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

import { ActorProtocol } from "./ActorProtocol.js"

/**
 * Represents a message that could not be delivered to its target actor.
 *
 * Created when:
 * - Actor is stopped/closed
 * - Mailbox is full (BoundedMailbox with Reject policy)
 * - Actor address is invalid
 *
 * Contains:
 * - Target actor protocol
 * - String representation of the message (method name)
 *
 * Dead letters are logged and distributed to registered listeners
 * for monitoring, debugging, or recovery.
 */
export class DeadLetter {
  private _actorProtocol: ActorProtocol
  private _message: string

  /**
   * Creates a dead letter.
   * @param actorProtocol The target actor that couldn't receive the message
   * @param message String representation of the message (typically method name)
   */
  constructor(actorProtocol: ActorProtocol, message: string) {
    this._actorProtocol = actorProtocol
    this._message = message
  }

  /**
   * Returns the target actor protocol.
   * @returns Actor protocol instance
   */
  actorProtocol(): ActorProtocol {
    return this._actorProtocol
  }

  /**
   * Returns the string representation of the message.
   * @returns Message representation (typically method name)
   */
  message(): string {
    return this._message
  }

  /**
   * Returns a formatted string representation of this dead letter.
   * @returns Formatted string with actor type, address, and message
   */
  toString(): string {
    return "DeadLetter[to: " + this.actorProtocol().type() +
           " at: " + this.actorProtocol().address() +
           " subject: " + this.message() +
           "]"
  }
}

/**
 * Listener interface for dead letter notifications.
 *
 * Implement this to handle dead letters for:
 * - Logging/monitoring
 * - Alerting on delivery failures
 * - Testing (e.g., TestDeadLettersListener)
 * - Recovery/retry logic
 *
 * Registered via DeadLetters.registerListener()
 */
export interface DeadLettersListener {
  /**
   * Handles a dead letter notification.
   * @param deadLetter The dead letter to process
   */
  handle(deadLetter: DeadLetter): void
}

/**
 * Central facility for handling undeliverable messages.
 *
 * Responsibilities:
 * - Logs all dead letters
 * - Distributes dead letters to registered listeners
 * - Protects against listener errors (catches and logs exceptions)
 *
 * Each stage has one DeadLetters instance accessible via stage.deadLetters().
 */
export class DeadLetters {
  private _listeners: DeadLettersListener[] = []

  /**
   * Handles a failed message delivery.
   *
   * Process:
   * 1. Logs the dead letter to the actor's logger
   * 2. Notifies all registered listeners
   * 3. Catches and logs any listener errors
   *
   * @param deadLetter The dead letter to process
   */
  failedDelivery(deadLetter: DeadLetter): void {
    const logger = deadLetter.actorProtocol().logger()

    logger.error(deadLetter.toString())

    this._listeners.forEach((listener: DeadLettersListener) => {
      try {
        listener.handle(deadLetter)
      } catch (error: any) {
        const message = error instanceof Error ? error.message : error
        logger.error("DeadLetter: Listener crashed because: " + message, error)
      }
    })
  }

  /**
   * Registers a listener for dead letter notifications.
   * Listeners are notified in registration order.
   *
   * @param listener The listener to register
   */
  registerListener(listener: DeadLettersListener): void {
    this._listeners.push(listener)
  }
}