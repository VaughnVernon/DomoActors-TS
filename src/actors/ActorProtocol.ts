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

import { Actor } from './Actor.js'
import { Address } from './Address.js'
import { DeadLetters } from './DeadLetters.js'
import { Definition } from './Definition.js'
import { Environment } from './Environment.js'
import { ExecutionContext } from './ExecutionContext.js'
import { LifeCycle } from './LifeCycle.js'
import { Logger } from './Logger.js'
import { Scheduler } from './Scheduler.js'
import { Stage } from './Stage.js'

/**
 * Core protocol interface for all actors in the system.
 *
 * ActorProtocol represents the proxy wrapper around an actor instance,
 * providing access to the actor's runtime environment, lifecycle, and
 * operational methods. All actor references returned from the stage
 * implement this interface.
 *
 * Extends LifeCycle to provide start/stop/resume/suspend capabilities.
 */
export interface ActorProtocol extends LifeCycle {
  //================================
  // operational
  //================================

  /**
   * Returns the underlying actor instance.
   * For internal use only - application code should use protocol methods.
   * @returns The actor implementation
   */
  actor(): Actor

  /**
   * Returns the unique address for this actor.
   * @returns Actor's address
   */
  address(): Address

  /**
   * Returns the dead letters facility for handling undeliverable messages.
   * @returns DeadLetters instance from the stage
   */
  deadLetters(): DeadLetters

  /**
   * Returns the definition used to create this actor.
   * Contains type information and constructor parameters.
   * @returns Actor's definition
   */
  definition(): Definition

  /**
   * Returns the runtime environment for this actor.
   * Provides access to mailbox, logger, parent, and other runtime facilities.
   * @returns Actor's environment
   */
  environment(): Environment

  /**
   * Returns the execution context for this actor.
   * Request handlers can use reset() and setValue() to configure the context.
   * @returns ExecutionContext instance
   */
  executionContext(): ExecutionContext;

  /**
   * Returns the lifecycle management interface for this actor.
   * @returns This actor's lifecycle
   */
  lifeCycle(): LifeCycle

  /**
   * Returns the logger for this actor.
   * @returns Logger instance
   */
  logger(): Logger

  /**
   * Returns this actor's parent actor.
   * @returns Parent actor protocol
   */
  parent(): ActorProtocol

  /**
   * Returns the scheduler for delayed/recurring tasks.
   * @returns Scheduler instance from the stage
   */
  scheduler(): Scheduler

  /**
   * Returns the stage that manages this actor.
   * @returns Stage instance
   */
  stage(): Stage

  /**
   * Stores a state snapshot for this actor.
   * Used for testing and debugging to capture actor state.
   * @param stateSnapshot State to store
   */
  stateSnapshot<S>(stateSnapshot: S): void

  /**
   * Retrieves the stored state snapshot for this actor.
   * @returns Previously stored state or undefined
   */
  stateSnapshot<S>(): S

  /**
   * Causes the receiving actor to stop and be removed from its stage.
   * @param timeoutMs Optional timeout for graceful shutdown
   * @returns Promise that resolves when stop completes
   */
  stop(timeoutMs?: number): Promise<void>

  /**
   * Returns whether this actor has been stopped.
   * @returns true if stopped, false otherwise
   */
  isStopped(): boolean

  /**
   * Returns the type name of this actor from its definition.
   * @returns Actor type string
   */
  type(): string

  //================================
  // object
  //================================

  /**
   * Compares this actor with another for equality.
   * Typically compares by address.
   * @param other Other actor to compare with
   * @returns true if equal, false otherwise
   */
  equals(other: ActorProtocol): boolean

  /**
   * Returns a hash code for this actor.
   * Typically derived from the address.
   * @returns Hash code
   */
  hashCode(): number

  /**
   * Returns a string representation of this actor.
   * @returns Formatted string with actor details
   */
  toString(): string
}