// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { ActorProtocol } from './ActorProtocol.js'
import { Address } from './Address.js'
import { DeadLetters } from './DeadLetters.js'
import { Definition } from './Definition.js'
import { Environment } from './Environment.js'
import { ExecutionContext } from './ExecutionContext.js'
import { LifeCycle } from './LifeCycle.js'
import { Logger } from './Logger.js'
import { Protocol } from './Protocol.js'
import { Scheduler } from './Scheduler.js'
import { stage, Stage } from './Stage.js'
import { StageInternal } from './StageInternal.js'

/**
 * Abstract base class for all actors in the system.
 *
 * Actor provides the foundation for implementing message-driven, concurrent entities.
 * Extend this class and implement your protocol interface to create custom actors:
 *
 * ```typescript
 * interface Counter {
 *   increment(): Promise<void>
 *   getValue(): Promise<number>
 * }
 *
 * class CounterActor extends Actor implements Counter {
 *   private count = 0
 *
 *   async increment(): Promise<void> {
 *     this.count++
 *   }
 *
 *   async getValue(): Promise<number> {
 *     return this.count
 *   }
 * }
 *
 * const counter = stage().actorFor<Counter>(Protocol.of(CounterActor))
 * await counter.increment()
 * const value = await counter.getValue() // 1
 * ```
 *
 * Key features:
 * - Implements ActorProtocol for consistent actor interface
 * - Extends LifeCycle for start/stop/restart hooks
 * - Provides access to runtime services (logger, scheduler, stage)
 * - Manages actor identity (address, definition, type)
 * - Supports actor hierarchy (parent, children)
 * - State snapshot mechanism for persistence/testing
 *
 * Actors are created via stage.actorFor() and should not be instantiated directly.
 */
export abstract class Actor extends LifeCycle implements ActorProtocol {
  /**
   * Returns a formatted ID string for an actor.
   * Utility method for logging and debugging.
   *
   * @param actor The actor to get ID for
   * @returns Formatted ID string (e.g., "To: Counter At: 2Bx...")
   */
  static id(actor: ActorProtocol): string {
    return stage().idFrom(actor.environment())
  }

  /**
   * Returns this actor instance.
   * Used to unwrap the actor from its protocol proxy.
   *
   * @returns This actor
   */
  actor(): Actor {
    return this
  }

  /**
   * Returns this actor's unique address.
   * @returns Actor address
   */
  address(): Address {
    return this.environment().address()
  }

  /**
   * Returns the dead letters facility for undeliverable messages.
   * @returns DeadLetters instance from the stage
   */
  deadLetters(): DeadLetters {
    return this.stage().deadLetters()
  }

  /**
   * Returns this actor's definition (type and constructor parameters).
   * @returns Actor definition
   */
  definition(): Definition {
    return this.environment().definition()
  }

  // environment() is inherited from LifeCycle - no need to override

  /**
   * Returns the execution context for this actor.
   * Request handlers can use reset() and setValue() to configure the context.
   * @returns ExecutionContext instance
   */
  executionContext(): ExecutionContext {
    return this.environment().executionContext()
  }

  /**
   * Returns this actor's lifecycle manager.
   * @returns LifeCycle instance (this actor)
   */
  lifeCycle(): LifeCycle {
    return this
  }

  /**
   * Returns this actor's logger.
   * @returns Logger instance
   */
  logger(): Logger {
    return this.environment().logger()
  }

  /**
   * Returns this actor's parent actor.
   * All actors have a parent, with PublicRootActor as the default.
   *
   * @returns Parent actor protocol
   */
  parent(): ActorProtocol {
    return this.environment().parent()
  }

  /**
   * Returns the stage's scheduler for delayed/periodic tasks.
   * @returns Scheduler instance
   */
  scheduler(): Scheduler {
    return this.stage().scheduler()
  }

  /**
   * Returns the stage managing this actor.
   * @returns Stage instance
   */
  stage(): Stage {
    return this.environment().stage()
  }

  /**
   * Sets the actor's state snapshot (setter overload).
   * Override in subclass to store state for persistence or restart recovery.
   *
   * @template S The state type
   * @param stateSnapshot The state to save
   */
  stateSnapshot<S>(stateSnapshot: S): void

  /**
   * Gets the actor's state snapshot (getter overload).
   * Override in subclass to retrieve stored state.
   *
   * @template S The state type
   * @returns The saved state
   */
  stateSnapshot<S>(): S

  /**
   * State snapshot getter/setter implementation.
   *
   * Default implementation does nothing (no-op).
   * Override in subclass to implement state persistence:
   *
   * ```typescript
   * class StatefulActor extends Actor {
   *   private _state: MyState
   *
   *   stateSnapshot<MyState>(state?: MyState): MyState | void {
   *     if (state !== undefined) {
   *       this._state = state  // Restore state
   *       return
   *     }
   *     return this._state  // Save state
   *   }
   * }
   * ```
   *
   * @template S The state type
   * @param stateSnapshot Optional state to set
   * @returns State if getter, void if setter
   */
  stateSnapshot<S>(stateSnapshot?: S): S | void {
    if (stateSnapshot !== undefined) {
      // Setter: do nothing by default (subclasses can override to store state)
      return
    }
    // Getter: return undefined (subclasses can override to retrieve state)
    return undefined as S
  }

  /**
   * Returns this actor's type name.
   * The type is the class name or custom name from Protocol.
   *
   * @returns Actor type string
   */
  type(): string {
    return this.definition().type()
  }

  //================================
  // object
  //================================

  /**
   * Compares this actor with another actor for equality.
   * Actors are equal if they have the same address.
   *
   * @param other The other actor to compare
   * @returns true if actors have the same address
   */
  equals(other: ActorProtocol): boolean {
    return this.address().equals(other.address())
  }

  /**
   * Returns a hash code for this actor based on its address.
   * @returns Hash code
   */
  hashCode(): number {
    return 31 * this.address().hashCode()
  }

  /**
   * Returns a string representation of this actor.
   * Format: "To: <type> At: <address>"
   *
   * @returns String representation
   */
  toString(): string {
    return `${this.type()}: ${Actor.id(this)}`
  }

  //================================
  // protected interface
  //================================

  /**
   * Creates a child actor with this actor as the parent.
   *
   * Looks up this actor's proxy from the directory and uses it as the parent
   * for the new child actor. This establishes the parent-child supervision hierarchy.
   *
   * Delegates to stage.actorFor() with:
   * - This actor's proxy as the parent
   * - Parameters from the definition
   * - Optional supervisor name (defaults to parent's supervisor if not specified)
   * - Default mailbox (ArrayMailbox)
   *
   * Note: The definition's address is not used - the stage generates a new unique address.
   * This ensures no address conflicts in the directory.
   *
   * @template T The protocol interface type
   * @param protocol The protocol for the child actor (defines type and instantiation)
   * @param definition The definition containing constructor parameters
   * @param supervisorName Optional name of supervisor actor (defaults to parent's supervisor)
   * @returns Child actor proxy implementing the protocol interface
   */
  protected childActorFor<T>(protocol: Protocol, definition: Definition, supervisorName?: string): T {
    // Look up our own proxy from the directory to use as parent.
    // This is synchronous and safe - we're already registered in the directory.
    const stageInternal = this.stage() as StageInternal
    const parentProxy = stageInternal.directory().get(this.address())

    return this.stage().actorFor<T>(
      protocol,
      parentProxy,  // Use the proxy as parent, not the raw actor
      supervisorName,  // use specified supervisor or default
      undefined,  // use default mailbox
      ...definition.parameters()  // spread constructor parameters from definition
    )
  }

  /**
   * Returns a proxy to this actor for self-messaging.
   *
   * This method enables an actor to send messages to itself through its mailbox,
   * ensuring all state changes go through the message processing pipeline.
   * This is essential for maintaining actor model semantics where all state
   * modifications must be serialized through the mailbox.
   *
   * The returned proxy sends messages asynchronously, even though the sender
   * and receiver are the same actor. This ensures:
   * - Message ordering is preserved
   * - Supervision can intercept failures
   * - The mailbox can be suspended/resumed
   *
   * Typical usage pattern: call this.selfAs<T>() in beforeStart() and store
   * the result for use in message handlers.
   *
   * @template T The protocol interface this actor implements
   * @returns A proxy that sends messages to this actor's mailbox
   *
   * @example
   * ```typescript
   * interface MyProtocol extends ActorProtocol {
   *   doWork(): Promise<void>
   *   updateState(value: number): Promise<void>
   * }
   *
   * class MyActor extends Actor implements MyProtocol {
   *   private self!: MyProtocol
   *
   *   async beforeStart(): Promise<void> {
   *     // Get self-proxy for async messaging
   *     this.self = this.selfAs<MyProtocol>()
   *   }
   *
   *   async doWork(): Promise<void> {
   *     // Self-send to update state (goes through mailbox)
   *     await this.self.updateState(42)
   *   }
   *
   *   async updateState(value: number): Promise<void> {
   *     // Message handler - executes when message is processed
   *     this.state = value
   *   }
   * }
   * ```
   */
  protected selfAs<T extends object>(): T {
    // Get my mailbox for message delivery
    const mailbox = this.environment().mailbox()

    // Create a dummy protocol. It's not used by actorProxyFor, but required for the signature.
    // The proxy creation only needs the actor instance and mailbox.
    const dummyProtocol: Protocol = {
      type: () => this.type(),
      instantiator: () => ({ instantiate: () => this })
    }

    // Create a new proxy that routes messages to our own mailbox
    return this.stage().actorProxyFor<T>(dummyProtocol, this, mailbox)
  }

  /**
   * Protected constructor for Actor base class.
   *
   * Actors are created by the stage via Environment.setCurrentEnvironment()
   * and Environment.retrieveEnvironment() pattern. This ensures actors are
   * properly initialized with their runtime context.
   *
   * Subclass constructors should call super() and then initialize actor state.
   *
   * IMPORTANT: Never instantiate actors directly - always use stage.actorFor()
   */
  protected constructor() {
    super(Environment.retrieveEnvironment())
  }
}
