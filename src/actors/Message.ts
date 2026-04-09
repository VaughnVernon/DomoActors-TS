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
import { createDeferred, DeferredPromise } from "./DeferredPromise.js"

/**
 * Function signature for actor message handlers.
 *
 * Takes the actor instance as a parameter and returns a Promise.
 * Protocol method arguments are captured in the closure when the message is created.
 *
 * @example
 * ```typescript
 * // Protocol: increment(): Promise<void>
 * // ActorFunction: (actor) => actor.increment()
 *
 * // Protocol: add(n: number): Promise<number>
 * // ActorFunction: (actor) => actor.add(5)  // 5 captured in closure
 * ```
 */
export type ActorFunction<TReturn = any> = (actor: ActorProtocol) => Promise<TReturn>;

/**
 * Represents a message sent to an actor.
 *
 * Messages encapsulate:
 * - A lambda function to invoke on the actor
 * - The target actor
 * - A deferred promise for the return value
 * - A string representation for debugging
 *
 * Messages are created by ActorProxy when protocol methods are called.
 * The mailbox queues and delivers messages asynchronously.
 */
export interface Message {
  /**
   * Returns the deferred promise for this message's return value.
   * Resolved when the message is delivered or handled.
   * @returns Deferred promise
   */
  deferred(): DeferredPromise<any>

  /**
   * Delivers this message to the target actor by invoking the lambda.
   * Handles errors and resolves the deferred promise.
   * @returns Promise resolving to this message after delivery
   */
  deliver(): Promise<Message>

  /**
   * Returns whether this message can be delivered.
   * EmptyMessage returns false, real messages return true.
   * @returns true if deliverable, false otherwise
   */
  isDeliverable(): boolean

  /**
   * Returns a human-readable representation of this message.
   * Typically the protocol method name (e.g., "increment", "add").
   * @returns String representation for debugging/logging
   */
  representation(): string

  /**
   * Returns the target actor for this message.
   * @returns Actor protocol instance
   */
  to(): ActorProtocol

  /**
   * Returns a string representation of this message.
   * @returns Formatted string with message details
   */
  toString(): string
}

/**
 * Sentinel message representing "no message".
 *
 * Returned by mailbox.receive() when the queue is empty.
 * Not deliverable - isDeliverable() returns false.
 *
 * Using EmptyMessage avoids null checks and optional return types.
 */
export const EmptyMessage: Message = {
  /**
   * Returns a new deferred promise (never used).
   * @returns Fresh deferred promise
   */
  deferred: function (): DeferredPromise<any> {
    return createDeferred()
  },

  /**
   * No-op delivery that returns EmptyMessage.
   * @returns Promise resolving to EmptyMessage
   */
  deliver: function (): Promise<Message> {
    return Promise.resolve(EmptyMessage);
  },

  /**
   * Always returns false - empty messages cannot be delivered.
   * @returns false
   */
  isDeliverable: function (): boolean {
    return false;
  },

  /**
   * Returns a placeholder representation.
   * @returns "not-a-message"
   */
  representation: function (): string {
    return "not-a-message";
  },

  /**
   * Returns undefined cast to ActorProtocol (should never be called).
   * @returns undefined
   */
  to: function (): ActorProtocol {
    return undefined as unknown as ActorProtocol;
  },

  /**
   * Returns string representation.
   * @returns "EmptyMessage"
   */
  toString(): string {
    return "EmptyMessage";
  }
}