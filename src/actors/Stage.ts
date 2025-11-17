// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from './Actor'
import { ActorProtocol } from './ActorProtocol'
import { Address } from './Address'
import { DeadLetters } from './DeadLetters'
import { Environment } from './Environment'
import { ExecutionContext } from './ExecutionContext'
import { LocalStage } from './LocalStage'
import { Logger } from './Logger'
import { Mailbox } from './Mailbox'
import { Protocol } from './Protocol'
import { Scheduler } from './Scheduler'
import { Supervisor } from './Supervisor'

/**
 * Main entry point and runtime environment for the actor system.
 *
 * The Stage manages the entire actor lifecycle:
 * - Actor creation and instantiation via actorFor()
 * - Actor directory/lookup via actorOf()
 * - Supervision strategy registration
 * - System-wide services (logging, scheduling, dead letters)
 * - Execution context management
 *
 * Get the stage instance via the stage() factory function:
 * ```typescript
 * const myStage = stage()
 * const actor = myStage.actorFor<MyProtocol>(MyActor)
 * ```
 *
 * The stage is the "world" in which actors live, providing all
 * necessary infrastructure for actor-based applications.
 */
export interface Stage {
  /**
   * Returns a new unique address of the default `Address` type.
   * @returns a new unique Address
   */
  address(): Address

  /**
   * Returns the execution context for isolating actor state.
   * @returns Execution context instance
   */
  executionContext(): ExecutionContext

  /**
   * Returns the dead letters facility for handling undeliverable messages.
   * @returns DeadLetters instance
   */
  deadLetters(): DeadLetters

  /**
   * Returns a formatted ID string for an actor.
   * Used for logging and debugging.
   *
   * @param environment The actor's environment
   * @returns Formatted ID string (e.g., "MyActor[123]")
   */
  idFrom(environment: Environment): string

  /**
   * Returns the stage's logger.
   * @returns Logger instance
   */
  logger(): Logger

  /**
   * Returns a new mailbox for an actor.
   * Creates unbounded ArrayMailbox by default.
   *
   * @returns New mailbox instance
   */
  mailbox(): Mailbox

  /**
   * Returns the stage's scheduler for delayed/periodic tasks.
   * @returns Scheduler instance
   */
  scheduler(): Scheduler

  /**
   * Creates a new actor instance with type-safe protocol.
   *
   * This is the primary method for creating actors. Returns a proxy that
   * implements the protocol interface, providing type-safe method calls
   * that are automatically converted to asynchronous messages.
   *
   * @template T The protocol interface type
   * @param protocol The Protocol definition (class and type)
   * @param parent Optional parent actor (defaults to stage's public root)
   * @param supervisorName Optional supervisor name (defaults to 'default')
   * @param mailbox Optional custom mailbox (defaults to ArrayMailbox)
   * @param parameters Constructor parameters for the actor class
   * @returns Type-safe proxy implementing the protocol interface
   *
   * @example
   * ```typescript
   * interface Counter {
   *   increment(): Promise<void>
   *   getValue(): Promise<number>
   * }
   *
   * class CounterActor extends Actor implements Counter {
   *   private count = 0
   *   async increment() { this.count++ }
   *   async getValue() { return this.count }
   * }
   *
   * const myStage = stage()
   * const counter = myStage.actorFor<Counter>(Protocol.of(CounterActor))
   * await counter.increment()
   * const value = await counter.getValue() // 1
   * ```
   */
  actorFor<T>(protocol: Protocol, parent?: ActorProtocol, supervisorName?: string, mailbox?: Mailbox, ...parameters: any[]): T

  /**
   * Looks up an actor by its address.
   *
   * Searches the stage's actor directory for an actor with the given address.
   * Returns undefined if the actor doesn't exist or has been stopped.
   *
   * @param address The actor's address to look up
   * @returns Promise resolving to the actor protocol or undefined
   */
  actorOf(address: Address): Promise<ActorProtocol | undefined>

  /**
   * Returns the supervisor with the given name.
   *
   * @param name Optional supervisor name (defaults to 'default')
   * @returns Supervisor instance
   * @throws Error if supervisor not found
   */
  supervisor(name?: string): Supervisor

  /**
   * Registers a supervisor with the stage.
   *
   * Supervisors must be registered before actors reference them via supervisorName.
   * The stage comes with a 'default' supervisor pre-registered.
   *
   * @param name The supervisor's name (for lookup)
   * @param supervisor The supervisor instance to register
   */
  registerSupervisor(name: string, supervisor: Supervisor): void

  /**
   * Registers a runtime value with the stage.
   *
   * This allows applications to register shared runtime objects (such as database
   * instances, connection pools, or configuration objects) that can be accessed
   * by actors and other components throughout the application.
   *
   * Use namespaced names to avoid conflicts (e.g., 'myapp:database', 'myapp:config').
   *
   * @template V The type of value being registered
   * @param name The name to register the value under
   * @param value The value to register
   *
   * @example
   * ```typescript
   * const myStage = stage()
   * const db = new DatabaseConnection()
   * myStage.registerValue('myapp:database', db)
   * ```
   */
  registerValue<V>(name: string, value: V): void

  /**
   * Retrieves a previously registered runtime value.
   *
   * Returns the value that was registered under the given name.
   *
   * @template V The expected type of the registered value
   * @param name The name the value was registered under
   * @returns The registered value
   * @throws Error if no value is registered under the given name
   *
   * @example
   * ```typescript
   * const myStage = stage()
   * const db = myStage.registeredValue<DatabaseConnection>('myapp:database')
   * await db.query('SELECT * FROM users')
   * ```
   */
  registeredValue<V>(name: string): V

  /**
   * Removes a previously registered runtime value and returns it.
   *
   * This removes the value from the registry and returns it, allowing for cleanup
   * operations. Subsequent calls to registeredValue() with this name will throw
   * an error unless the value is registered again.
   *
   * Warning: Deregistering a value that actors are still using may cause runtime
   * errors. Ensure no actors will access this value before deregistering it.
   *
   * @template V The expected type of the registered value
   * @param name The name of the value to deregister
   * @returns The previously registered value, or undefined if no value was registered under that name
   *
   * @example
   * ```typescript
   * const myStage = stage()
   * myStage.registerValue('myapp:database', db)
   *
   * // Later, when no longer needed - get value and remove atomically
   * const db = myStage.deregisterValue<DatabaseConnection>('myapp:database')
   * if (db) {
   *   await db.close()  // Clean up the resource
   * }
   *
   * // Trying to deregister again returns undefined
   * const removed = myStage.deregisterValue('myapp:database')
   * console.log(removed)  // undefined (already removed)
   * ```
   */
  deregisterValue<V>(name: string): V | undefined

  /**
   * Creates a proxy for an existing actor instance.
   *
   * This is an advanced method primarily used for self-messaging within actors.
   * It creates a new proxy that sends messages to the provided actor's mailbox.
   *
   * Use Actor.selfAs<T>() instead of calling this directly.
   *
   * @template T The protocol interface type
   * @param protocol The protocol defining the actor's interface
   * @param actor The actor instance to proxy
   * @param mailbox The mailbox to send messages to
   * @returns Type-safe proxy implementing the protocol interface
   *
   * @example
   * ```typescript
   * // Internal usage - typically via Actor.selfAs<T>()
   * const selfProxy = stage.actorProxyFor<MyProtocol>(protocol, this, mailbox)
   * await selfProxy.someMethod() // Sends message to own mailbox
   * ```
   */
  actorProxyFor<T extends object>(protocol: Protocol, actor: Actor, mailbox: Mailbox): T

  /**
   * Closes the stage and stops all actors in proper hierarchical order.
   *
   * Shutdown sequence:
   * 1. Application parent actors (which automatically stop their children)
   * 2. Application supervisor actors
   * 3. System-level actors (PublicRootActor, then PrivateRootActor)
   *
   * This ensures graceful shutdown with proper lifecycle hooks being called.
   * Actors can perform cleanup in their beforeStop() and afterStop() hooks.
   *
   * @returns Promise that resolves when all actors have been stopped
   *
   * @example
   * ```typescript
   * const myStage = stage()
   * // ... create actors and run application ...
   * await myStage.close() // Shutdown all actors gracefully
   * ```
   */
  close(): Promise<void>
}

/**
 * Singleton stage instance initialized synchronously on module load.
 * Root actors are created immediately when the stage is constructed.
 */
const _stage = new LocalStage()

/**
 * Returns the default stage instance.
 *
 * This is the primary way to access the stage in your application:
 * ```typescript
 * const myStage = stage()
 * const actor = myStage.actorFor<MyProtocol>(MyActor)
 * ```
 *
 * The stage and its root actors are fully initialized when this module loads.
 *
 * @returns The default stage instance
 */
export const stage = (): Stage => {
  return _stage
}