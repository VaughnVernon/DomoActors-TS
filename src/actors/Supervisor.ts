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
import { Environment } from "./Environment.js"

/**
 * Defines the scope of supervision actions.
 *
 * - One: Apply directive to only the failed actor
 * - All: Apply directive to the failed actor and all its siblings
 */
export enum SupervisionScope {
  /** Apply directive to all actors (failed actor and siblings) */
  All,
  /** Apply directive only to the failed actor */
  One
}

/**
 * Supervision directives that determine how to handle actor failures.
 *
 * Based on Erlang/Akka supervision model:
 * - Restart: Create new actor instance, preserving address
 * - Resume: Continue processing, ignore the error
 * - Stop: Terminate the actor(s)
 * - Escalate: Forward error to parent supervisor
 */
export enum SupervisionDirective {
  /** Restart the failed actor with a new instance */
  Restart,
  /** Resume processing, ignoring the error */
  Resume,
  /** Stop the actor(s) */
  Stop,
  /** Escalate the error to the parent supervisor */
  Escalate
}

/**
 * Abstract base class for supervision strategies.
 *
 * Defines how actors should be supervised when failures occur:
 * - Intensity: Maximum number of restarts within the period
 * - Period: Time window (ms) for measuring restart intensity
 * - Scope: Whether to apply directives to one actor or all siblings
 *
 * Supervision prevents cascading failures by limiting restart rates.
 */
export abstract class SupervisionStrategy {
  /** Default intensity: 1 restart allowed per period */
  static DefaultIntensity = 1
  /** Forever intensity: Unlimited restarts (-1 = no limit) */
  static ForeverIntensity = -1

  /** Default period: 5 seconds */
  static DefaultPeriod = 5000;
  /** Forever period: Maximum safe integer (effectively infinite) */
  static ForeverPeriod = Number.MAX_SAFE_INTEGER

  /**
   * Returns the maximum number of restarts allowed within the period.
   * @returns Intensity value (-1 = unlimited)
   */
  abstract intensity(): number

  /**
   * Returns the time window (milliseconds) for measuring restart intensity.
   * @returns Period in milliseconds
   */
  abstract period(): number

  /**
   * Returns the scope of supervision actions.
   * @returns Supervision scope (One or All)
   */
  abstract scope(): SupervisionScope
}

/**
 * Default supervision strategy implementation.
 *
 * Configuration:
 * - Intensity: 1 restart per period
 * - Period: 5 seconds
 * - Scope: One (only the failed actor)
 *
 * Suitable for most applications with moderate error rates.
 */
export class DefaultSupervisionStrategy extends SupervisionStrategy {
  /**
   * Returns the default intensity (1 restart per period).
   * @returns 1
   */
  intensity(): number {
    return SupervisionStrategy.DefaultIntensity
  }

  /**
   * Returns the default period (5000ms = 5 seconds).
   * @returns 5000
   */
  period(): number {
    return SupervisionStrategy.DefaultPeriod
  }

  /**
   * Returns the default scope (One - only the failed actor).
   * @returns SupervisionScope.One
   */
  scope(): SupervisionScope {
    return SupervisionScope.One
  }
}

/**
 * Interface for actors under supervision.
 *
 * Provides methods for supervisors to control failed actors:
 * - Query actor state (address, error)
 * - Apply supervision directives (restart, resume, stop, escalate)
 * - Control message processing (suspend)
 */
export interface Supervised {
  /**
   * Returns the actor protocol instance.
   * @returns Actor protocol
   */
  actor(): ActorProtocol

  /**
   * Returns the actor's address.
   * @returns Actor address
   */
  address(): Address

  /**
   * Returns the error that caused supervision.
   * @returns Error instance
   */
  error(): Error

  /**
   * Escalates the error to the parent supervisor.
   */
  escalate(): void

  /**
   * Restarts the actor(s) within the specified constraints.
   * @param period Time window (ms) for measuring restart intensity
   * @param intensity Maximum restarts allowed within period
   * @param scope Whether to restart one actor or all siblings
   */
  restartWithin(period: number, intensity: number, scope: SupervisionScope): void

  /**
   * Resumes message processing after an error.
   * Calls beforeResume() lifecycle hook and resumes the mailbox.
   */
  resume(): void

  /**
   * Stops the actor(s) gracefully.
   * @param scope Whether to stop one actor or all siblings
   */
  stop(scope: SupervisionScope): void

  /**
   * Returns the supervisor managing this actor.
   * @returns Supervisor instance
   */
  supervisor(): Supervisor

  /**
   * Suspends message processing.
   * Messages are queued but not delivered until resumed.
   */
  suspend(): void
}

/**
 * Interface for actor supervisors.
 *
 * Supervisors handle actor failures and decide how to recover:
 * - Receive error notifications
 * - Apply supervision strategy
 * - Execute supervision directives
 *
 * Implements the "let it crash" philosophy - failures are expected
 * and handled systematically rather than defensively prevented.
 */
export interface Supervisor {
  /**
   * Informs the supervisor of an actor failure.
   * Applies the supervision strategy to decide how to handle the error.
   *
   * @param error The error that occurred
   * @param supervised The supervised actor that failed
   * @returns Promise that resolves when supervision is complete
   */
  inform(error: Error, supervised: Supervised): Promise<void>

  /**
   * Returns the supervision strategy for this supervisor.
   * @returns Promise resolving to the supervision strategy
   */
  supervisionStrategy(): Promise<SupervisionStrategy>

  /**
   * Returns the parent supervisor (for escalation).
   * @returns Supervisor instance
   */
  supervisor(): Supervisor
}

/**
 * Stage implementation of Supervised interface.
 *
 * Wraps a failed actor and provides supervision operations.
 * Created by the stage when an actor failure is detected.
 *
 * Following xoom-actors pattern: maintains both the protocol (proxy)
 * and the actor instance for proper supervision handling.
 *
 * Key responsibilities:
 * - Execute supervision directives (restart/resume/stop/escalate)
 * - Manage lifecycle hooks (beforeResume)
 * - Coordinate with mailbox for suspension/resumption
 * - Handle both single-actor and sibling-group operations
 */
export class StageSupervisedActor implements Supervised {
  private _protocol: ActorProtocol
  private _actorInstance: Actor
  private _error: Error

  /**
   * Creates a supervised actor wrapper.
   *
   * @param protocol The actor protocol (proxy wrapper)
   * @param actor The actor instance
   * @param error The error that occurred
   */
  constructor(protocol: ActorProtocol, actor: Actor, error: Error) {
    this._protocol = protocol
    this._actorInstance = actor
    this._error = error
  }

  /**
   * Returns the actor protocol instance (proxy wrapper).
   * @returns Actor protocol
   */
  actor(): ActorProtocol {
    return this._protocol
  }

  /**
   * Returns the actor's address.
   * @returns Actor address
   */
  address(): Address {
    return this.actor().address()
  }

  /**
   * Returns the error that caused supervision.
   * @returns Error instance
   */
  error(): Error {
    return this._error
  }

  /**
   * Escalates the error to the parent supervisor.
   * Forwards this supervised actor and error to the supervisor's parent.
   */
  escalate(): void {
    this.supervisor().supervisor().inform(this.error(), this)
  }

  /**
   * Restarts the actor(s) within the specified constraints.
   *
   * Process:
   * 1. Calls restart() lifecycle method (which calls beforeRestart/afterRestart hooks)
   * 2. Resumes the mailbox after restart completes
   *
   * TODO: Track restart intensity/period for throttling
   * Currently just restarts actor(s) based on scope.
   *
   * @param _period Time window (ms) for measuring restart intensity (not yet implemented)
   * @param _intensity Maximum restarts allowed within period (not yet implemented)
   * @param scope Whether to restart one actor or all siblings
   */
  restartWithin(_period: number, _intensity: number, scope: SupervisionScope): void {
    // TODO: Track restart intensity/period for throttling
    // For now, just restart the actor(s) based on scope

    if (scope === SupervisionScope.One) {
      // Restart just this actor
      this.actor().lifeCycle().restart(this.error())
        .then(() => {
          // Resume mailbox after restart completes
          this.actor().lifeCycle().environment().mailbox().resume()
        })
        .catch((restartError: Error) => {
          // If restart fails, log but still try to resume mailbox
          this.actor().logger().error(
            `Restart failed: ${restartError.message}`,
            restartError
          )
          this.actor().lifeCycle().environment().mailbox().resume()
        })
    } else {
      // Restart this actor and all siblings
      this.selfWithSiblings().forEach((child: Actor) => {
        child.lifeCycle().restart(this.error())
          .then(() => {
            // Resume each mailbox after restart
            child.lifeCycle().environment().mailbox().resume()
          })
          .catch((restartError: Error) => {
            // If restart fails, log but still try to resume mailbox
            child.logger().error(
              `Restart failed: ${restartError.message}`,
              restartError
            )
            child.lifeCycle().environment().mailbox().resume()
          })
      })
    }
  }

  /**
   * Resumes message processing after an error.
   *
   * Process:
   * 1. Calls beforeResume() lifecycle hook
   * 2. Resumes the mailbox to allow message delivery
   * 3. Logs the resumption
   *
   * If beforeResume() throws, logs the error but continues with resumption.
   */
  resume(): void {
    // Call beforeResume lifecycle hook
    try {
      this._actorInstance.beforeResume(this.error())
    } catch (error: any) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      this.actor().logger().error(
        `Actor beforeResume() failed: ${errorObj.message}`,
        errorObj
      )
    }

    // Resume message processing in the mailbox
    this.actor().lifeCycle().environment().mailbox().resume()
    this.actor().logger().log('Actor resumed after error: ' + this.error().message)
  }

  /**
   * Stops the actor(s) gracefully.
   * @param scope Whether to stop one actor or all siblings
   */
  stop(scope: SupervisionScope): void {
    if (scope == SupervisionScope.One) {
      this.actor().lifeCycle().stop()
    } else {
      this.selfWithSiblings().forEach((child: Actor) => {
        child.stop()
      });
    }
  }

  /**
   * Returns the supervisor managing this actor.
   * @returns Supervisor instance from the actor's environment
   */
  supervisor(): Supervisor {
    return this.actor().lifeCycle().environment().supervisor()
  }

  /**
   * Suspends message processing.
   * Messages are queued but not delivered until resumed.
   */
  suspend(): void {
    // Suspend the actor's mailbox to pause message processing
    this.actor().lifeCycle().environment().mailbox().suspend()
    this.actor().logger().log('Actor suspended - message processing paused')
  }

  /**
   * Gets the environment of an actor.
   * @param actor The actor to get environment from
   * @returns The actor's environment
   */
  private environmentOf(actor: Actor): Environment {
    return actor.lifeCycle().environment();
  }

  /**
   * Returns this actor and all its siblings.
   * Navigates: this actor -> parent -> parent's children
   * @returns Array of sibling actors (including this actor)
   */
  private selfWithSiblings(): Actor[] {
    return this.environmentOf(this.environmentOf(this._actorInstance).parent().actor()).childrenAsActor();
  }
}