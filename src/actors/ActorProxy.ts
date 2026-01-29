// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from "./Actor.js"
import { createDeferred } from "./DeferredPromise.js"
import { EmptyExecutionContext } from "./ExecutionContext.js"
import { LocalMessage } from "./LocalMessage.js"
import { Mailbox } from "./Mailbox.js"
import { INTERNAL_ENVIRONMENT_ACCESS } from "./InternalAccess.js"

/**
 * ActorProtocol methods that are exposed synchronously through the proxy
 * without going through message passing.
 *
 * These methods provide direct access to actor metadata and state without
 * the overhead of mailbox delivery. All other methods are converted to
 * asynchronous messages.
 *
 * Synchronous methods:
 * - address, definition, type: Actor identity
 * - logger, stage, lifeCycle: Runtime access
 * - executionContext: Request-scoped context access
 * - isStopped: State query
 * - equals, hashCode, toString: Object methods
 */
const SYNCHRONOUS_ACTOR_METHODS = new Set([
  'address',
  'definition',
  'executionContext',
  'logger',
  'lifeCycle',
  'isStopped',
  'stage',
  'type',
  'equals',
  'hashCode',
  'toString'
])

/**
 * Creates a dynamic proxy that implements the actor's protocol interface.
 *
 * The proxy intercepts all method calls and converts them into asynchronous messages
 * that are sent to the actor's mailbox. This enables type-safe actor communication
 * without requiring manual message classes or handlers.
 *
 * Certain ActorProtocol methods (address, definition, isStopped, stage) are exposed
 * synchronously for direct access without message passing.
 *
 * @param actor The actor instance that will process messages
 * @param mailbox The mailbox where messages will be enqueued
 * @returns A proxy implementing the protocol interface T
 *
 * @example
 * ```typescript
 * interface Counter {
 *   increment(): Promise<void>
 *   getValue(): Promise<number>
 * }
 *
 * const actor = new CounterActor(env)
 * const proxy = createActorProxy<Counter>(actor, mailbox)
 *
 * // Type-safe method calls
 * await proxy.increment()
 * const value = await proxy.getValue()
 *
 * // Synchronous ActorProtocol access
 * const address = proxy.address()
 * const stopped = proxy.isStopped()
 * ```
 */
export function createActorProxy<T extends object>(actor: Actor, mailbox: Mailbox): T {
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      // Handle internal symbol-based access for library code
      if (prop === INTERNAL_ENVIRONMENT_ACCESS) {
        return () => actor.lifeCycle().environment()
      }

      // Ignore symbols, special properties, and Promise-related methods
      // The proxy should not be treated as a Promise by JavaScript's await mechanism
      if (typeof prop === 'symbol' || prop.startsWith('_')) {
        return undefined
      }

      // Explicitly return undefined for Promise-related methods so the proxy
      // is not mistaken for a thenable/Promise
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined
      }

      // Handle synchronous ActorProtocol methods directly
      if (typeof prop === 'string' && SYNCHRONOUS_ACTOR_METHODS.has(prop)) {
        const method = (actor as any)[prop]
        if (typeof method === 'function') {
          return method.bind(actor)
        }
        return method
      }

      // Return a function that intercepts the protocol method call
      return function(...args: any[]) {
        // Create deferred promise for caller
        const deferred = createDeferred<any>()

        // Get ExecutionContext from actor's environment
        // Copy it if it has context, otherwise use EmptyExecutionContext
        const currentContext = actor.lifeCycle().environment().executionContext()
        const contextCopy = currentContext.hasContext()
          ? currentContext.copy()
          : EmptyExecutionContext

        // Create message with function that will invoke actual actor method
        const message = new LocalMessage(
          actor,
          (actorInstance: any) => actorInstance[prop](...args),
          deferred,
          prop + "(" + args.toString() + ")",
          contextCopy
        )

        // Send to mailbox (async delivery)
        mailbox.send(message)

        // Return promise immediately to caller
        return deferred.promise
      }
    }
  }) as T
}