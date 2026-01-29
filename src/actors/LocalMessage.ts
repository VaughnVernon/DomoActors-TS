// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from "./Actor.js"
import { ActorProtocol } from "./ActorProtocol.js"
import { ActorFunction, Message, EmptyMessage } from "./Message.js"
import { DeferredPromise } from "./DeferredPromise.js"
import { DeadLetter } from "./DeadLetters.js"
import { EmptyExecutionContext, ExecutionContext } from "./ExecutionContext.js"
import { StageInternal } from "./StageInternal.js"
import { StageSupervisedActor } from "./Supervisor.js"

/**
 * Concrete implementation of Message for local actor invocations.
 *
 * Encapsulates a lambda function to be invoked on an actor, along with:
 * - The target actor
 * - A deferred promise for the return value
 * - A string representation (method name) for debugging
 * - A copy of the execution context for supervision
 *
 * Created by ActorProxy when protocol methods are called.
 * Delivered by the mailbox's dispatch mechanism.
 */
export class LocalMessage implements Message {
  private _function: ActorFunction
  private _deferred: DeferredPromise<any>
  private _representation: string
  private _to: ActorProtocol
  private _executionContext: ExecutionContext

  /**
   * Creates a new local message.
   * @param to Target actor
   * @param f Lambda function to invoke on the actor
   * @param deferred Deferred promise for the return value
   * @param representation String representation (typically method name)
   * @param executionContext Copy of the execution context (or EmptyExecutionContext)
   */
  constructor(
    to: Actor,
    f: ActorFunction,
    deferred: DeferredPromise<any>,
    representation: string,
    executionContext: ExecutionContext
  ) {
    this._to = to
    this._function = f
    this._deferred = deferred
    this._representation = representation
    this._executionContext = executionContext
  }

  /**
   * Returns the deferred promise for this message's return value.
   * @returns Deferred promise
   */
  deferred(): DeferredPromise<any> {
    return this._deferred
  }

  /**
   * Always returns true for local messages.
   * @returns true
   */
  isDeliverable(): boolean {
    return true
  }

  /**
   * Delivers this message by invoking the lambda on the target actor.
   *
   * Behavior:
   * - If actor is stopped: Routes to dead letters and returns EmptyMessage
   * - Sets actor's environment ExecutionContext to message's copy before invocation
   * - On success: Resolves deferred promise with result
   * - On error: Suspends mailbox, routes to supervision system, rejects promise
   * - Resets actor's environment ExecutionContext to EmptyExecutionContext after invocation
   *
   * Following xoom-actors pattern: message processing errors are routed to
   * the stage for supervision handling.
   *
   * @returns Promise resolving to EmptyMessage after delivery
   */
  async deliver(): Promise<Message> {
    const actor = this.to()

    if (actor.lifeCycle().isStopped()) {
      const deadLetter = new DeadLetter(actor, this.representation())
      actor.deadLetters().failedDelivery(deadLetter)
      return Promise.resolve(EmptyMessage)
    }

    // Set the actor's environment ExecutionContext to this message's copy
    // This allows supervisors to access the context via supervised.actor().environment().executionContext()
    const environment = actor.lifeCycle().environment()
    environment.setCurrentMessageExecutionContext(this._executionContext)
    this._executionContext.propagate()

    try {
      const result = await this.function()(actor)
      this.deferred().resolve(result)
      return Promise.resolve(EmptyMessage)
    } catch (error: unknown) {
      const errorObj = error instanceof Error ? error : new Error(String(error))

      // Log the error
      actor.logger().error(`Message processing failed: ${errorObj.message}\n`, errorObj)

      // 1. Reject the caller's promise (message failed, caller must know)
      this._deferred.reject(errorObj)

      // 2. Suspend mailbox to prevent further processing during supervision
      environment.mailbox().suspend()

      // 3. Route to stage for supervision (xoom-actors pattern)
      const stage = actor.stage() as StageInternal
      stage.handleFailureOf(new StageSupervisedActor(this.to(), actor.actor(), errorObj))

      return Promise.resolve(EmptyMessage)
    } finally {
      environment.setCurrentMessageExecutionContext(EmptyExecutionContext)
    }
  }

  /**
   * Returns the string representation of this message.
   * Typically the protocol method name (e.g., "increment").
   * @returns String representation for debugging
   */
  representation(): string {
    return this._representation
  }

  /**
   * Returns the target actor for this message.
   * @returns Actor protocol instance
   */
  to(): ActorProtocol {
    return this._to
  }

  /**
   * Returns a detailed string representation.
   * @returns Formatted string with target and function
   */
  toString(): string {
    return 'LocalMessage [to: ' + this.to() + ' function: ' + this.function() + ']'
  }

  /**
   * Returns the lambda function to be invoked.
   * @returns Actor function
   */
  private function(): ActorFunction {
    return this._function
  }
}