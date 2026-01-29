// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Environment } from './Environment.js'
import { Startable } from './Startable.js'
import { Stoppable } from './Stoppable.js'
import { INTERNAL_ENVIRONMENT_ACCESS, InternalActorAccess } from './InternalAccess.js'
import { StageInternal } from './StageInternal.js'

/**
 * Interface for actor lifecycle management.
 *
 * Defines the core lifecycle operations that all actors support:
 * - Start: Initialize and begin processing messages
 * - Stop: Gracefully shut down and cleanup
 * - Restart: Recover from failures
 * - isStopped: Check stopped state
 */
export interface LifeCycle {
  /**
   * Starts the actor.
   * @returns Promise that resolves when start completes
   */
  start(): Promise<void>

  /**
   * Stops the actor gracefully.
   * @param timeoutMs Optional timeout for graceful shutdown
   * @returns Promise that resolves when stop completes
   */
  stop(timeoutMs?: number): Promise<void>

  /**
   * Restarts the actor after a failure.
   * @param reason The error that caused the restart
   * @returns Promise that resolves when restart completes
   */
  restart(reason: Error): Promise<void>

  /**
   * Returns whether this actor is stopped.
   * @returns true if stopped, false otherwise
   */
  isStopped(): boolean
}

/**
 * Abstract base class providing actor lifecycle management.
 *
 * Implements the actor lifecycle with hook methods for customization:
 * - beforeStart/afterStop: Initialization and cleanup
 * - beforeRestart/afterRestart: Failure recovery
 * - beforeResume: Supervision resumption
 * - beforeStop: Pre-shutdown cleanup
 *
 * Provides default implementations that log lifecycle events.
 * Override hooks in subclasses for custom behavior.
 */
export abstract class LifeCycle implements Startable, Stoppable {
  private _environment: Environment

  /**
   * Creates a new lifecycle manager.
   * @param environment The actor's runtime environment
   */
  protected constructor(environment: Environment) {
    this._environment = environment
  }

  /**
   * Returns the actor's environment.
   * @returns Environment instance
   */
  environment(): Environment {
    return this._environment
  }

  /**
   * Lifecycle hook called before the actor starts.
   * Override for custom initialization logic.
   *
   * Called synchronously before start() message is delivered.
   */
  beforeStart(): void {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: beforeStart()')
  }

  /**
   * Lifecycle hook called after the actor stops.
   * Override for custom cleanup logic.
   *
   * Called after mailbox is closed and actor is removed from directory.
   */
  afterStop(): void {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: afterStop()')
  }

  /**
   * Lifecycle hook called before the actor restarts.
   * Override for custom pre-restart cleanup.
   *
   * @param reason The error that caused the restart
   */
  beforeRestart(reason: Error): void {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: beforeRestart(): ', reason)
  }

  /**
   * Lifecycle hook called after the actor restarts.
   * Override for custom post-restart initialization.
   *
   * @param reason The error that caused the restart
   */
  afterRestart(reason: Error): void {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: afterRestart(): ', reason)
  }

  /**
   * Lifecycle hook called before resuming after supervision.
   * Override for custom resume logic.
   *
   * @param reason The error that was handled
   */
  beforeResume(reason: Error): void {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: beforeResume(): ', reason)
  }

  /**
   * Lifecycle hook called before the actor stops.
   * Override for custom pre-stop cleanup.
   *
   * Can return a Promise for async cleanup operations.
   * Errors are logged but don't prevent stopping.
   *
   * @returns Optional promise for async cleanup
   */
  beforeStop(): void | Promise<void> {
    // Implement in subclass
    // Can return a Promise for async cleanup operations
    this.environment().logger().log(this.id() + ' subject: beforeStop()')
  }

  /**
   * Starts the actor.
   * Override in subclass for custom start behavior.
   *
   * Default implementation logs the start event.
   *
   * @returns Promise that resolves when start completes
   */
  start(): Promise<void> {
    // Implement in subclass
    this.environment().logger().log(this.id() + ' subject: start()')
    return Promise.resolve()
  }

  /**
   * Restarts the actor after a failure.
   * Override in subclass for custom restart behavior.
   *
   * Default implementation:
   * 1. Calls beforeRestart() hook
   * 2. Logs the restart
   * 3. Calls afterRestart() hook
   *
   * Hook failures are logged but don't prevent restart.
   *
   * @param reason The error that caused the restart
   * @returns Promise that resolves when restart completes
   */
  async restart(reason: Error): Promise<void> {
    // Call beforeRestart() lifecycle hook with error handling
    try {
      this.beforeRestart(reason)
    } catch (error: any) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      this.environment().logger().error(
        `Actor beforeRestart() failed: ${errorObj.message}`,
        errorObj
      )
      // Note: Failures in beforeRestart() are logged but don't prevent restart
      // TODO: Route to supervisor system for escalation
    }

    // Perform restart (can be overridden in subclass)
    this.environment().logger().log(this.id() + ' subject: restart()')

    // Call afterRestart() lifecycle hook with error handling
    try {
      this.afterRestart(reason)
    } catch (error: any) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      this.environment().logger().error(
        `Actor afterRestart() failed: ${errorObj.message}`,
        errorObj
      )
      // Note: Failures in afterRestart() are logged but don't prevent restart completion
      // TODO: Route to supervisor system for escalation
    }

    return Promise.resolve()
  }

  /**
   * Stops the actor gracefully.
   * Override in subclass for custom stop behavior (always call super.stop()).
   *
   * Default implementation:
   * 1. Calls beforeStop() hook (supports async)
   * 2. Stops all child actors (depth-first)
   * 3. Removes self from parent's children
   * 4. Closes the mailbox
   * 5. Removes from stage directory
   * 6. Calls afterStop() hook
   *
   * Hook and child stop failures are logged but don't prevent stopping.
   *
   * @param timeoutMs Optional timeout in milliseconds for graceful shutdown
   * @returns Promise that resolves when stop completes
   */
  async stop(timeoutMs?: number): Promise<void> {
    // If you override in subclass, always call super.stop()
    if (!this.isStopped()) {
      // If timeout is specified, wrap the stop sequence in a timeout
      if (timeoutMs !== undefined && timeoutMs > 0) {
        return this.stopWithTimeout(timeoutMs)
      }

      // Call beforeStop() lifecycle hook with error handling
      try {
        const beforeStopResult = this.beforeStop()
        // If beforeStop returns a promise, await it
        if (beforeStopResult instanceof Promise) {
          await beforeStopResult
        }
      } catch (error: any) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        this.environment().logger().error(
          `Actor beforeStop() failed: ${errorObj.message}`,
          errorObj
        )
        // Note: Failures in beforeStop() are logged but don't prevent stopping
      }

      // Stop all child actors first (depth-first shutdown)
      const children = this.environment().children()
      for (const child of children) {
        try {
          await child.stop()
        } catch (error: any) {
          const errorObj = error instanceof Error ? error : new Error(String(error))
          this.environment().logger().error(
            `Failed to stop child actor: ${errorObj.message}`,
            errorObj
          )
          // Continue stopping other children even if one fails
        }
      }

      // Remove self from parent's children array
      // Use internal symbol access to avoid exposing environment() to clients
      const parent = this.environment().parent()
      if (parent) {
        try {
          const parentEnv = (parent as any as InternalActorAccess)[INTERNAL_ENVIRONMENT_ACCESS]()
          parentEnv.removeChild(this.environment().address())
        } catch (error: any) {
          // Ignore errors if parent doesn't have removeChild or is already gone
          this.environment().logger().debug('Could not remove from parent children:', error)
        }
      }

      // Close the mailbox
      this.environment().mailbox().close()

      // Remove from stage directory
      const stage = this.environment().stage() as StageInternal
      stage.removeFromDirectory(this.environment().address())

      this.environment().logger().log(this.id() + ' subject: stop()')

      // Call afterStop() lifecycle hook with error handling
      try {
        this.afterStop()
      } catch (error: any) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        this.environment().logger().error(
          `Actor afterStop() failed: ${errorObj.message}`,
          errorObj
        )
        // Note: Failures in afterStop() are logged but don't prevent stopping
      }
    }
    return Promise.resolve()
  }

  /**
   * Stops the actor with a timeout for graceful shutdown.
   * If the timeout expires, forces the stop by closing the mailbox immediately.
   *
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that resolves when stop completes or rejects on timeout
   */
  private async stopWithTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Timeout expired - force stop
        this.environment().logger().error(
          `Actor stop timeout after ${timeoutMs}ms - forcing shutdown`
        )
        // Close mailbox immediately
        this.environment().mailbox().close()
        reject(new Error(`Stop timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      // Attempt graceful stop
      this.stop() // recursive, but without timeout means direct stop
        .then(() => {
          clearTimeout(timeout)
          resolve()
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })
    })
  }

  /**
   * Returns whether this actor is stopped.
   * An actor is considered stopped if its mailbox is closed.
   *
   * @returns true if stopped, false otherwise
   */
  isStopped(): boolean {
    return this.environment().mailbox().isClosed()
  }

  /**
   * Returns a formatted ID string for this actor.
   * Used for logging lifecycle events.
   *
   * @returns Formatted ID string from the stage
   */
  private id(): string {
    return this.environment().stage().idFrom(this.environment())
  }
}