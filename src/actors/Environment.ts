// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from "./Actor.js"
import { ActorProtocol } from "./ActorProtocol.js"
import { Address } from "./Address.js"
import { Definition } from "./Definition.js"
import { EmptyExecutionContext, ExecutionContext } from "./ExecutionContext.js"
import { Logger } from "./Logger.js"
import { Mailbox } from "./Mailbox.js"
import { StageInternal } from "./StageInternal.js"
import { Supervisor } from "./Supervisor.js"

/**
 * Runtime context and dependencies for an actor.
 *
 * Environment provides access to:
 * - Address and definition (identity and metadata)
 * - Mailbox (message delivery)
 * - Parent and children (actor hierarchy)
 * - Logger (debugging and monitoring)
 * - Stage (actor system)
 * - Supervisor (fault tolerance)
 *
 * Created by the stage during actor instantiation and injected
 * into the Actor base class via static thread-local pattern.
 *
 * Actors access their environment via `this.lifeCycle().environment()`.
 */
export class Environment {
  // INTERNAL: intended for use by the current Actor being created
  private static _currentEnvironment: Environment | undefined = undefined

  /**
   * Sets the environment for the currently-being-instantiated actor.
   * Called by protocol instantiator before actor construction.
   *
   * INTERNAL: intended for use by the current Actor being created
   *
   * @param environment The environment to make available
   */
  static setCurrentEnvironment(environment: Environment): void {
    Environment._currentEnvironment = environment
  }

  /**
   * Retrieves and clears the environment.
   * Called by Actor constructor.
   *
   * INTERNAL: intended for use by the current Actor being created
   *
   * @returns The environment for the current actor
   * @throws Error if no environment is available
   */
  static retrieveEnvironment(): Environment {
    const environment = Environment._currentEnvironment
    if (!environment) {
      throw new Error('No environment available - actor must be created via Stage.actorFor()')
    }
    Environment._currentEnvironment = undefined  // Clear immediately
    return environment
  }

  private _address: Address
  private _children: ActorProtocol[]
  private _definition: Definition
  private _currentMessageExecutionContext: ExecutionContext
  private _executionContext: ExecutionContext
  private _logger: Logger
  private _mailbox: Mailbox
  private _parent: ActorProtocol
  private _stage: StageInternal
  private _supervisorName: string
  private _supervisor?: Supervisor

  /**
   * Creates a new actor environment.
   * Typically called by the stage during actor instantiation.
   *
   * @param stage The stage managing this actor
   * @param address The actor's unique address
   * @param definition The actor's definition (type and parameters)
   * @param parent The parent actor (undefined only for PrivateRootActor)
   * @param mailbox The message queue for this actor
   * @param logger The logger for this actor
   * @param supervisorName The name of the supervisor (default: 'default')
   */
  constructor(
    stage: StageInternal,
    address: Address,
    definition: Definition,
    parent: ActorProtocol | undefined,
    mailbox: Mailbox,
    logger: Logger,
    supervisorName: string = 'default'
  ) {
    this._stage = stage
    this._address = address
    this._definition = definition
    this._parent = parent!  // ! is safe - will be undefined only for PrivateRootActor
    this._mailbox = mailbox
    this._logger = logger
    this._supervisorName = supervisorName
    this._executionContext = new ExecutionContext()
    this._currentMessageExecutionContext = EmptyExecutionContext


    this._children = []
  }

  /**
   * Returns this actor's unique address.
   * @returns Actor address
   */
  address(): Address {
    return this._address
  }

  /**
   * Returns a copy of this actor's children.
   * @returns Array of child actor protocols (defensive copy)
   */
  children(): ActorProtocol[] {
    return [...this._children]
  }

  /**
   * Returns this actor's children as Actor instances.
   * @returns Array of child actors
   */
  childrenAsActor(): Actor[] {
    return this.children().map((child: ActorProtocol) => child.actor())
  }

  /**
   * Adds a child actor to this actor's children.
   * Called by the stage when creating child actors.
   *
   * @param child The child actor protocol to add
   */
  addChild(child: ActorProtocol): void {
    this._children.push(child)
  }

  /**
   * Removes a child actor from this actor's children.
   * Called when a child actor is stopped.
   *
   * @param childOrAddress The child actor protocol or address to remove
   */
  removeChild(childOrAddress: ActorProtocol | Address): void {
    const addressToRemove = 'address' in childOrAddress && typeof childOrAddress.address === 'function'
      ? childOrAddress.address()
      : childOrAddress as Address

    const index = this._children.findIndex(c => c.address().equals(addressToRemove))
    if (index !== -1) {
      this._children.splice(index, 1)
    }
  }

  /**
   * Returns this actor's definition.
   * @returns Actor definition (type and parameters)
   */
  definition(): Definition {
    return this._definition
  }

  /**
   * Returns the logger for this actor.
   * @returns Logger instance
   */
  logger(): Logger {
    return this._logger
  }

  /**
   * Returns the mailbox for this actor.
   * @returns Mailbox instance
   */
  mailbox(): Mailbox {
    return this._mailbox
  }

  /**
   * Returns this actor's parent actor.
   * @returns Parent actor protocol
   */
  parent(): ActorProtocol {
    return this._parent
  }

  /**
   * Returns the stage managing this actor.
   * @returns Stage instance
   */
  stage(): StageInternal {
    return this._stage
  }

  /**
   * Returns the supervisor for this actor.
   *
   * Lookup strategy:
   * 1. Return cached supervisor if already resolved
   * 2. For root actors ('private-root-supervisor', '__privateRoot'), use Stage.supervisor() registry
   * 3. For 'default', lookup '__publicRoot' from Directory
   * 4. For named supervisors, lookup by type from Directory
   *
   * @returns Supervisor instance
   * @throws Error if supervisor not found
   */
  supervisor(): Supervisor {
    // Return cached supervisor if already resolved
    if (this._supervisor) {
      return this._supervisor
    }

    // Special cases for root actors - use Stage supervisor registry
    if (this._supervisorName === 'private-root-supervisor' ||
        this._supervisorName === '__privateRoot') {
      this._supervisor = this._stage.supervisor(this._supervisorName)
      return this._supervisor
    }

    // Lookup by type name in Directory
    if (this._supervisorName === '__publicRoot') {
      const publicRoot = this._stage.directory().findByType('__publicRoot')
      if (!publicRoot) {
        throw new Error('PublicRootActor not found in directory')
      }
      this._supervisor = publicRoot as unknown as Supervisor
      return this._supervisor
    }

    // Default supervisor: PublicRootActor
    if (this._supervisorName === 'default') {
      const publicRoot = this._stage.directory().findByType('__publicRoot')
      if (!publicRoot) {
        throw new Error('PublicRootActor not initialized - cannot use default supervisor')
      }
      this._supervisor = publicRoot as unknown as Supervisor
      return this._supervisor
    }

    // Named custom supervisor: lookup from directory by type name
    const supervisorActor = this._stage.directory().findByType(this._supervisorName)
    if (!supervisorActor) {
      throw new Error(`Supervisor not found in directory: ${this._supervisorName}`)
    }

    this._supervisor = supervisorActor as unknown as Supervisor
    return this._supervisor
  }

  /**
   * Returns the name of this actor's supervisor.
   * @returns Supervisor name
   */
  supervisorName(): string {
    return this._supervisorName
  }

  /**
   * Returns the execution context for this actor.
   * The execution context holds request-scoped data for supervision and tracing.
   * Request handlers can use reset() and setValue() to configure the context.
   * @returns ExecutionContext instance
   */
  executionContext(): ExecutionContext {
    return this._executionContext
  }

  /**
   * Gets the execution context for this actor's currently delivered message.
   * Used by a Supervisor or any component that needs to know the actor's
   * ExecutionContext that is associated with the current message delivery.
   *
   * INTERNAL: Intended for use by message delivery infrastructure.
   *
   * @return The ExecutionContext instance assocated with the current message delivery
   */
  getCurrentMessageExecutionContext(): ExecutionContext {
    return this._currentMessageExecutionContext
  }

  /**
   * Sets the execution context for message currently being delivered for this actor.
   * Used by message delivery to set a copy of the context before invocation.
   *
   * INTERNAL: Intended for use by message delivery infrastructure.
   *
   * @param context The execution context to set
   */
  setCurrentMessageExecutionContext(executionContext: ExecutionContext): void {
    this._currentMessageExecutionContext = executionContext
  }
}