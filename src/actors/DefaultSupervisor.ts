// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from './Actor.js'
import {
  Supervisor,
  Supervised,
  SupervisionStrategy,
  SupervisionDirective,
  DefaultSupervisionStrategy
} from './Supervisor.js'

/**
 * Abstract base class for supervisor actors.
 *
 * Extends Actor to make all supervisors first-class actors that can:
 * - Send and receive messages
 * - Maintain state (e.g., restart counts, failure history)
 * - Be supervised themselves
 * - Access ExecutionContext from failed actors
 *
 * Behavior:
 * - Uses DefaultSupervisionStrategy (can be overridden)
 * - Implements inform() to apply supervision directives
 * - Requires subclasses to implement decideDirective()
 *
 * To create a custom supervisor:
 * 1. Extend DefaultSupervisor
 * 2. Override decideDirective() to return the appropriate directive
 * 3. Optionally override inform() for custom error handling/logging
 * 4. Optionally override supervisionStrategy() for custom strategy
 *
 * Example:
 * ```typescript
 * class MyCustomSupervisor extends DefaultSupervisor {
 *   protected decideDirective(
 *     error: Error,
 *     supervised: Supervised,
 *     strategy: SupervisionStrategy
 *   ): SupervisionDirective {
 *     if (error.message.includes('validation')) {
 *       return SupervisionDirective.Resume
 *     }
 *     return SupervisionDirective.Restart
 *   }
 * }
 * ```
 */
export abstract class DefaultSupervisor extends Actor implements Supervisor {
  /**
   * Handles actor failure by applying supervision strategy.
   *
   * Process:
   * 1. Get supervision strategy
   * 2. Decide which directive to apply (restart/resume/stop/escalate)
   * 3. Execute the directive on the supervised actor
   *
   * Override this method to add custom error handling, logging, or
   * context-aware behavior before applying directives.
   *
   * @param error The error that occurred
   * @param supervised The supervised actor that failed
   * @returns Promise that resolves when supervision is complete
   */
  async inform(error: Error, supervised: Supervised): Promise<void> {
    // Get the supervision strategy
    const strategy = await this.supervisionStrategy()

    // Apply the appropriate supervision directive based on strategy
    const directive = this.decideDirective(error, supervised, strategy)

    switch (directive) {
      case SupervisionDirective.Restart:
        supervised.restartWithin(
          strategy.period(),
          strategy.intensity(),
          strategy.scope()
        )
        break

      case SupervisionDirective.Resume:
        supervised.resume()
        break

      case SupervisionDirective.Stop:
        supervised.stop(strategy.scope())
        break

      case SupervisionDirective.Escalate:
        supervised.escalate()
        break
    }
  }

  /**
   * Returns the supervision strategy to use.
   * Override to provide custom strategy.
   *
   * @returns Promise resolving to DefaultSupervisionStrategy
   */
  supervisionStrategy(): Promise<SupervisionStrategy> {
    return Promise.resolve(new DefaultSupervisionStrategy())
  }

  /**
   * Returns this actor's supervisor reference.
   * Uses selfAs<Supervisor>() to return a properly typed proxy.
   *
   * @returns This supervisor as a Supervisor proxy
   */
  supervisor(): Supervisor {
    return this.selfAs<Supervisor>()
  }

  /**
   * Decides which supervision directive to apply based on the error and strategy.
   * **Must be implemented by subclasses.**
   *
   * This is where custom supervision logic goes:
   * - Check error types
   * - Track restart counts
   * - Apply different directives based on failure patterns
   * - Access ExecutionContext for context-aware decisions
   *
   * @param error The error that occurred
   * @param supervised The supervised actor
   * @param strategy The supervision strategy
   * @returns The directive to apply
   *
   * @example
   * ```typescript
   * protected decideDirective(
   *   error: Error,
   *   supervised: Supervised,
   *   strategy: SupervisionStrategy
   * ): SupervisionDirective {
   *   // Access ExecutionContext for context-aware supervision
   *   const context = supervised.actor()
   *     .lifeCycle()
   *     .environment()
   *     .getCurrentMessageExecutionContext()
   *
   *   const command = context.getValue<string>('command')
   *
   *   if (error.message.includes('validation')) {
   *     return SupervisionDirective.Resume  // Keep state, just log error
   *   }
   *
   *   return SupervisionDirective.Restart  // Reset state
   * }
   * ```
   */
  protected abstract decideDirective(
    error: Error,
    supervised: Supervised,
    strategy: SupervisionStrategy
  ): SupervisionDirective
}
