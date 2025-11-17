// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from './Actor';
import { ActorProtocol } from './ActorProtocol';
import { createActorProxy } from './ActorProxy';
import { Address } from './Address';
import { ArrayMailbox } from './ArrayMailbox';
import { DeadLetters } from './DeadLetters';
import { Definition } from './Definition';
import { Directory, DirectoryConfigs } from './Directory';
import { Environment } from './Environment';
import { ExecutionContext } from './ExecutionContext';
import { Uuid7Address } from './Uuid7Address';
import { LifeCycle } from './LifeCycle';
import { DefaultLogger, Logger } from './Logger';
import { Mailbox } from './Mailbox';
import { Protocol } from './Protocol';
import { DefaultScheduler, Scheduler } from './Scheduler';
import { StageInternal } from './StageInternal'
import { DefaultSupervisionStrategy, StageSupervisedActor, Supervised, Supervisor, SupervisionScope, SupervisionStrategy } from './Supervisor';
import { INTERNAL_ENVIRONMENT_ACCESS, InternalActorAccess } from './InternalAccess';

/**
 * Local implementation of the Stage actor system runtime.
 *
 * LocalStage provides a complete in-process actor system with:
 * - Actor lifecycle management (creation, initialization, supervision)
 * - Actor directory for address-based lookup
 * - Root actor hierarchy (PrivateRootActor -> PublicRootActor)
 * - Supervisor registry with default supervision
 * - System services (logging, scheduling, dead letters)
 *
 * The stage handles:
 * 1. Actor instantiation via protocol pattern
 * 2. Proxy creation for type-safe messaging
 * 3. Parent-child relationships
 * 4. Lifecycle hook execution (beforeStart, start)
 * 5. Fault tolerance via supervisor delegation
 *
 * This is the default Stage implementation, instantiated as DefaultStage.
 */
export class LocalStage implements StageInternal {
  /** Dead letters facility for undeliverable messages */
  private _deadLetters: DeadLetters
  /** Stage logger for system-level logging */
  private _logger: Logger
  /** Scheduler for delayed/periodic tasks */
  private _scheduler: Scheduler
  /** Registry of named supervisors (for root actors only) */
  private _supervisors: Map<string, Supervisor>
  /** Actor directory for address-based lookup */
  private _directory: Directory
  /** Default parent (PublicRootActor) for user-created actors */
  private _defaultParent?: ActorProtocol
  /** Flag to ensure root actors are initialized only once */
  private _rootActorsInitialized: boolean = false
  /** Registry for runtime values (database instances, config, etc.) */
  private _registeredValues: Map<string, any> = new Map()

  /**
   * Creates a new local stage instance.
   *
   * Initializes system services and prepares for actor creation.
   * Root actors (PrivateRootActor, PublicRootActor) are lazy-initialized
   * on first actor creation to avoid circular dependencies.
   */
  constructor() {
    this._deadLetters = new DeadLetters()
    this._logger = DefaultLogger
    this._scheduler = new DefaultScheduler()
    this._supervisors = new Map<string, Supervisor>()
    this._directory = new Directory(DirectoryConfigs.DEFAULT)

    // Create bootstrap supervisor for PrivateRootActor
    this.createBootstrapSupervisor()

    // Don't initialize root actors in constructor - do it lazily on first use
    // This avoids circular dependency issues during module loading
  }

  /**
   * Returns the actor directory for address-based lookup.
   * Used by (protected) Actor.childActorFor() to look up parent proxy.
   *
   * @internal - Only for use by Actor and other library-internal code
   * @returns The actor directory
   */
  directory(): Directory {
    return this._directory
  }

  /**
   * Sets the default parent for user-created actors.
   * Called by PublicRootActor during initialization.
   */
  setDefaultParent(actor: ActorProtocol | undefined): void {
    this._defaultParent = actor
  }

  /**
   * Creates an actor instance and returns a proxy implementing the protocol interface.
   *
   * @param protocol The protocol defining the actor's interface and instantiation logic
   * @param parent The parent actor (optional, defaults to root)
   * @param supervisorName The supervisor name (optional, defaults to 'default')
   * @param mailbox The mailbox for the actor (optional, defaults to ArrayMailbox)
   * @param parameters Constructor parameters for the actor
   * @returns A proxy implementing the protocol interface
   */
  actorFor<T>(
    protocol: Protocol,
    parent?: ActorProtocol,
    supervisorName?: string,
    mailbox?: Mailbox,
    ...parameters: any[]
  ): T {
    const address = Uuid7Address.unique()

    // Handle parameter ambiguity: if 'mailbox' doesn't look like a Mailbox,
    // treat it as a constructor parameter instead
    let actualMailbox: Mailbox
    let actualParameters: any[]

    if (mailbox && typeof mailbox === 'object' && 'send' in mailbox && 'receive' in mailbox) {
      // It's a Mailbox
      actualMailbox = mailbox
      actualParameters = parameters
    } else {
      // It's a constructor parameter (or undefined)
      actualMailbox = new ArrayMailbox()
      actualParameters = mailbox !== undefined ? [mailbox, ...parameters] : parameters
    }

    // 1. Create Definition (instantiation metadata)
    const definition = new Definition(
      protocol.type(),
      address,
      actualParameters
    )

    // 2. Determine the actual parent (use default if not specified)
    // Note: defaultParent() may be undefined if we're creating root actors
    const actualParent = parent !== undefined ? parent : this.defaultParent()

    // 3. Create Environment (runtime context for the actor)
    const environment = new Environment(
      this,
      address,
      definition,
      actualParent,
      actualMailbox,
      DefaultLogger,
      supervisorName || 'default'
    )

    // Call setCurrentEnvironment() before actor construction
    Environment.setCurrentEnvironment(environment)

    // 4. Delegate to protocol's instantiator to create the actor instance
    const instantiator = protocol.instantiator()
    const actor = instantiator.instantiate(definition)

    // 5. Create proxy that wraps the actor and implements the protocol interface
    const actorProxy = createActorProxy<any>(actor, environment.mailbox())

    // 6. Register actor in the directory for lookup
    this._directory.set(address, actorProxy)

    // 7. Register this actor as a child of its parent
    // Use internal symbol access to avoid exposing environment() to clients
    // Note: actualParent can still be undefined if we're creating PrivateRootActor
    if (actualParent) {
      const parentEnv = (actualParent as any as InternalActorAccess)[INTERNAL_ENVIRONMENT_ACCESS]()
      parentEnv.addChild(actorProxy)
    }

    this.start(actor, actorProxy as LifeCycle)

    return actorProxy
  }

  /**
   * Looks up an existing actor by its address.
   * Returns a Promise that resolves to the actor proxy if found, or undefined if not found.
   *
   * @param address The address of the actor to look up
   * @returns Promise resolving to the actor proxy or undefined
   */
  async actorOf(address: Address): Promise<ActorProtocol | undefined> {
    return this._directory.get(address)
  }

  /**
   * Creates a proxy for an existing actor instance.
   *
   * This method creates a new proxy that sends messages to the provided actor's mailbox.
   * Primarily used for self-messaging - when an actor needs to send messages to itself
   * through its mailbox rather than making direct method calls.
   *
   * The protocol parameter is currently unused but maintained for API compatibility
   * with xoom-actors and potential future type checking.
   *
   * @template T The protocol interface type
   * @param protocol The protocol defining the actor's interface (currently unused)
   * @param actor The actor instance to create a proxy for
   * @param mailbox The mailbox to send messages to
   * @returns A proxy that sends messages to the actor via the mailbox
   */
  actorProxyFor<T extends object>(_protocol: Protocol, actor: Actor, mailbox: Mailbox): T {
    // Protocol parameter is unused but maintained for API compatibility with xoom-actors
    // Create a new proxy using the same mechanism as actorFor
    // This ensures all messages go through the mailbox, not direct calls
    return createActorProxy<T>(actor, mailbox)
  }

  /**
   * Generates a unique address for a new actor.
   * Uses Uuid7Address for globally unique, time-ordered addresses (RFC 9562).
   *
   * @returns A new unique address
   */
  address(): Address {
    return Uuid7Address.unique()
  }

  /**
   * Creates a new execution context for isolating actor state.
   * Each invocation returns a fresh ExecutionContext instance.
   *
   * @returns New execution context
   */
  executionContext(): ExecutionContext {
    return new ExecutionContext()
  }

  /**
   * Returns the dead letters facility for this stage.
   * @returns DeadLetters instance
   */
  deadLetters(): DeadLetters {
    return this._deadLetters
  }

  /**
   * Delegates actor failure handling to the appropriate supervisor.
   *
   * Gets the actor's supervisor and informs it of the failure.
   * The supervisor will decide how to handle the error (restart/resume/stop/escalate).
   *
   * If the supervisor itself fails, logs the error (supervisor failures are terminal).
   *
   * Following xoom-actors pattern: Stage is the central orchestrator for supervision.
   *
   * @param supervised The supervised actor that failed
   */
  handleFailureOf(supervised: StageSupervisedActor): void {
    // Get the supervisor and inform it of the failure
    const supervisor = supervised.supervisor()

    // Inform the supervisor asynchronously
    supervisor.inform(supervised.error(), supervised)
      .catch((error: Error) => {
        // If supervision fails, log the error
        this._logger.error(
          `Supervisor failed to handle actor failure: ${error.message}`,
          error
        )
      })
  }

  /**
   * Generates a formatted ID string for an actor.
   * Format: "To: <type> At: <address>"
   *
   * @param environment The actor's environment
   * @returns Formatted ID string
   */
  idFrom(environment: Environment): string {
    return "To: " + environment.definition().type() +
           " At: " + environment.address()
  }

  /**
   * Returns the stage logger.
   * @returns Logger instance
   */
  logger(): Logger {
    return this._logger
  }

  /**
   * Creates a new mailbox for an actor.
   * Returns an unbounded ArrayMailbox by default.
   *
   * @returns New ArrayMailbox instance
   */
  mailbox(): Mailbox {
    return new ArrayMailbox()
  }

  /**
   * Returns the stage scheduler for delayed/periodic tasks.
   * @returns Scheduler instance
   */
  scheduler(): Scheduler {
    return this._scheduler
  }

  /**
   * Registers a supervisor with a given name.
   * Multiple actors can share the same supervisor by using the same name.
   *
   * @param name Supervisor name
   * @param supervisor Supervisor instance
   */
  registerSupervisor(name: string, supervisor: Supervisor): void {
    this._supervisors.set(name, supervisor)
  }

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
   */
  registerValue<V>(name: string, value: V): void {
    this._registeredValues.set(name, value)
  }

  /**
   * Retrieves a previously registered runtime value.
   *
   * Returns the value that was registered under the given name.
   *
   * @template V The expected type of the registered value
   * @param name The name the value was registered under
   * @returns The registered value
   * @throws Error if no value is registered under the given name
   */
  registeredValue<V>(name: string): V {
    if (!this._registeredValues.has(name)) {
      throw new Error(`No value registered with name: ${name}`)
    }
    return this._registeredValues.get(name) as V
  }

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
   */
  deregisterValue<V>(name: string): V | undefined {
    const value = this._registeredValues.get(name) as V | undefined
    this._registeredValues.delete(name)
    return value
  }

  /**
   * Removes an actor from the directory.
   * This is typically called internally when an actor is stopped.
   *
   * @param address The address of the actor to remove
   */
  removeFromDirectory(address: Address): void {
    this._directory.remove(address)
  }

  /**
   * Gets a supervisor by name.
   *
   * Lookup strategy:
   * 1. For root actor special cases ('private-root-supervisor', '__privateRoot'), return from registry
   * 2. For 'default', return PublicRootActor from directory
   * 3. For named supervisors, return from directory by type
   *
   * @param name Supervisor name (defaults to 'default')
   * @returns The supervisor instance
   * @throws Error if supervisor not found
   */
  supervisor(name: string = 'default'): Supervisor {
    // Handle root actor special cases - use registry
    if (name === 'private-root-supervisor' || name === '__privateRoot') {
      const supervisor = this._supervisors.get(name)
      if (!supervisor) {
        throw new Error(`Root supervisor not found: ${name}`)
      }
      return supervisor
    }

    // Default supervisor: PublicRootActor from directory
    if (name === 'default') {
      const publicRoot = this._directory.findByType('__publicRoot')
      if (!publicRoot) {
        throw new Error('PublicRootActor not initialized - cannot use default supervisor')
      }
      return publicRoot as unknown as Supervisor
    }

    // Named supervisor: lookup from directory by type
    const supervisor = this._directory.findByType(name)
    if (!supervisor) {
      throw new Error(`Supervisor not found in directory: ${name}`)
    }
    return supervisor as unknown as Supervisor
  }


  /**
   * Closes the stage by stopping all actors in proper hierarchical order.
   *
   * Shutdown sequence:
   * 1. Application parent actors (non-supervisor, non-root actors)
   *    - Parent actors automatically stop their children when stop() is called
   * 2. Application supervisor actors (custom supervisors)
   * 3. System-level actors:
   *    - PublicRootActor (__publicRoot)
   *    - PrivateRootActor (__privateRoot)
   *
   * This ensures graceful shutdown with proper lifecycle hooks being called.
   */
  async close(): Promise<void> {
    const allActors = this._directory.all()

    // Categorize actors
    const applicationParents: ActorProtocol[] = []
    const supervisors: ActorProtocol[] = []
    const rootActors: { publicRoot?: ActorProtocol; privateRoot?: ActorProtocol } = {}

    for (const actor of allActors) {
      const type = actor.type()

      // System root actors
      if (type === '__publicRoot') {
        rootActors.publicRoot = actor
      } else if (type === '__privateRoot') {
        rootActors.privateRoot = actor
      }
      // Application supervisors (registered in _supervisors, excluding root actors)
      else if (this._supervisors.has(type)) {
        supervisors.push(actor)
      }
      // Application parent actors (everything else)
      else {
        applicationParents.push(actor)
      }
    }

    // Phase 1: Stop application parent actors (they stop their children automatically)
    this._logger.log('Stage: Stopping application actors...')
    for (const actor of applicationParents) {
      try {
        await actor.stop()
      } catch (error: any) {
        this._logger.error(`Failed to stop actor ${actor.type()}: ${error.message}`, error)
      }
    }

    // Phase 2: Stop application supervisors
    this._logger.log('Stage: Stopping application supervisors...')
    for (const supervisor of supervisors) {
      try {
        await supervisor.stop()
      } catch (error: any) {
        this._logger.error(`Failed to stop supervisor ${supervisor.type()}: ${error.message}`, error)
      }
    }

    // Phase 3: Stop system actors (PublicRootActor, then PrivateRootActor)
    this._logger.log('Stage: Stopping system actors...')
    if (rootActors.publicRoot) {
      try {
        await rootActors.publicRoot.stop()
      } catch (error: any) {
        this._logger.error(`Failed to stop PublicRootActor: ${error.message}`, error)
      }
    }

    if (rootActors.privateRoot) {
      try {
        await rootActors.privateRoot.stop()
      } catch (error: any) {
        this._logger.error(`Failed to stop PrivateRootActor: ${error.message}`, error)
      }
    }

    this._logger.log('Stage: All actors stopped')
  }

  /**
   * Creates a bootstrap supervisor for PrivateRootActor.
   *
   * This is a non-actor supervisor used only during PrivateRootActor initialization,
   * since PrivateRootActor cannot supervise itself during construction.
   *
   * Behavior: Stops the failed actor (PrivateRootActor failure is fatal).
   */
  private createBootstrapSupervisor(): void {
    const bootstrap = new class implements Supervisor {
      async inform(error: Error, supervised: Supervised): Promise<void> {
        console.error('FATAL: PrivateRootActor failed during initialization', error)
        supervised.stop(SupervisionScope.One)
      }

      async supervisionStrategy(): Promise<SupervisionStrategy> {
        return new DefaultSupervisionStrategy()
      }

      supervisor(): Supervisor {
        return this
      }
    }

    this._supervisors.set('private-root-supervisor', bootstrap)
    this._supervisors.set('__privateRoot', bootstrap)
  }

  /**
   * Returns the default parent actor for user-created actors.
   * The default parent is PublicRootActor, which provides a stable
   * parent for all top-level user actors.
   *
   * Initializes root actors on first call (lazy initialization).
   *
   * @returns PublicRootActor protocol, or undefined if root actors not yet initialized
   */
  private defaultParent(): ActorProtocol | undefined {
    // Initialize root actors if needed (lazy initialization)
    if (!this._defaultParent) {
      this.initializeRootActors()
    }
    return this._defaultParent
  }

  /**
   * Handles lifecycle hook failures by logging and routing to supervision.
   *
   * Called when beforeStart() or start() throws an error. Creates a
   * StageSupervisedActor wrapper and delegates to the supervision system.
   *
   * @param actor The actor that failed
   * @param error The error that occurred
   * @param phase The lifecycle phase where the failure occurred
   */
  private handleLifecycleFailure(actor: Actor, error: any, phase: string): void {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    const message = `Actor ${phase}() failed: ${errorObj.message}`

    actor.logger().error(message, errorObj)

    // Get the actor protocol (proxy) from the directory
    const protocol = this._directory.get(actor.address())

    if (protocol) {
      // Route to supervisor system for fault tolerance handling
      this.handleFailureOf(new StageSupervisedActor(protocol, actor, errorObj))
    } else {
      // Fallback: actor not in directory yet (shouldn't happen)
      this._logger.error(`Cannot supervise actor - not in directory: ${actor.address().valueAsString()}`)
    }
  }

  /**
   * Initializes the root actor hierarchy:
   * PrivateRootActor (ultimate root) -> PublicRootActor (default parent for user actors)
   *
   * Lazily creates root actors on first use. The circular dependency between Stage and
   * root actor classes is avoided by defining the classes inline here.
   *
   * Note: Root actors are stored in _directory and can be found by their well-known type names:
   * - PrivateRootActor: type = '__privateRoot'
   * - PublicRootActor: type = '__publicRoot'
   *
   * We don't keep separate instance variables for them since they're already in the directory.
   * Only _defaultParent is kept as an instance variable since it's used in defaultParent() method.
   */
  private initializeRootActors(): void {
    if (this._rootActorsInitialized) return
    this._rootActorsInitialized = true

    // Capture Actor reference to ensure it's available in nested classes
    const ActorBase = Actor

    // Define PrivateRootActor inline to avoid circular dependency
    class PrivateRootActorImpl extends ActorBase implements Supervisor {
      private readonly _strategy: SupervisionStrategy = new class extends SupervisionStrategy {
        intensity(): number { return 0 }
        period(): number { return 0 }
        scope(): SupervisionScope { return SupervisionScope.One }
      }()

      constructor() {
        super()
      }

      beforeStart(): void {
        super.beforeStart()
        this.logger().log('PrivateRootActor: Initialized')
      }

      afterStop(): void {
        this.logger().log('PrivateRootActor: Stopped')
        super.afterStop()
      }

      async inform(error: Error, supervised: Supervised): Promise<void> {
        this.logger().error(
          `PrivateRootActor: Failure of: ${supervised.address().valueAsString()} because: ${error.message} Action: Stopping.`,
          error
        )
        supervised.stop(this._strategy.scope())
      }

      async supervisionStrategy(): Promise<SupervisionStrategy> {
        return Promise.resolve(this._strategy)
      }

      supervisor(): Supervisor {
        return this
      }
    }

    // Define PublicRootActor inline to avoid circular dependency
    class PublicRootActorImpl extends ActorBase implements Supervisor {
      private _self!: Supervisor

      private readonly _supervisionStrategy: SupervisionStrategy = new class extends SupervisionStrategy {
        intensity(): number { return SupervisionStrategy.ForeverIntensity }
        period(): number { return SupervisionStrategy.ForeverPeriod }
        scope(): SupervisionScope { return SupervisionScope.One }
      }()

      constructor() {
        super()
        setTimeout(() => {
          this._self = this.selfAs<Supervisor>()
        }, 0)
      }

      beforeStart(): void {
        super.beforeStart()
        this.logger().log('PublicRootActor: Initialized as default parent and default supervisor')
      }

      afterStop(): void {
        (this.stage() as StageInternal).setDefaultParent(undefined)
        this.logger().log('PublicRootActor: Stopped')
        super.afterStop()
      }

      async inform(error: Error, supervised: Supervised): Promise<void> {
        this.logger().error(
          `PublicRootActor: Failure of: ${supervised.address().valueAsString()} because: ${error.message} Action: Restarting.`,
          error
        )
        supervised.restartWithin(
          this._supervisionStrategy.period(),
          this._supervisionStrategy.intensity(),
          this._supervisionStrategy.scope()
        )
      }

      async supervisionStrategy(): Promise<SupervisionStrategy> {
        return Promise.resolve(this._supervisionStrategy)
      }

      supervisor(): Supervisor {
        return this._self
      }
    }

    // 1. Create PrivateRootActor (ultimate root)
    const privateRootProtocol: Protocol = {
      instantiator: () => ({
        instantiate: (_definition: Definition) => new PrivateRootActorImpl()
      }),
      type: () => '__privateRoot'
    }

    const privateRoot = this.actorFor<ActorProtocol>(
      privateRootProtocol,
      undefined,  // No parent (it's the root)
      'private-root-supervisor'  // Uses bootstrap supervisor
    )

    // 2. Create PublicRootActor (child of PrivateRootActor)
    const publicRootProtocol: Protocol = {
      instantiator: () => ({
        instantiate: (_definition: Definition) => new PublicRootActorImpl()
        }),
      type: () => '__publicRoot'
    }

    const publicRoot = this.actorFor<ActorProtocol>(
      publicRootProtocol,
      privateRoot as ActorProtocol,      // parent = PrivateRootActor
      '__privateRoot'   // supervisor = PrivateRootActor
    )

    // 3. Set as default parent for user actors
    this._defaultParent = publicRoot
  }

  /**
   * Starts an actor by executing its lifecycle hooks.
   *
   * Process:
   * 1. Calls beforeStart() synchronously before message processing begins
   * 2. Sends start() message to mailbox for async processing
   *
   * Errors in either hook are caught and routed to the supervision system.
   *
   * @param actor The actor instance to start
   * @param lifeCycle The actor's lifecycle manager
   */
  private start(actor: Actor, lifeCycle: LifeCycle): void {
    // Call beforeStart() synchronously before mailbox starts processing
    try {
      actor.beforeStart()
    } catch(error: any) {
      this.handleLifecycleFailure(actor, error, 'beforeStart')
    }

    // Send start() message to mailbox (async processing)
    // Handle promise rejection if start() throws during message delivery
    lifeCycle.start()
      .catch((error: any) => {
        this.handleLifecycleFailure(actor, error, 'start')
      })
  }
}