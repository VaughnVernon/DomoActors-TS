// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from './Actor.js'
import { Supervisor, SupervisionStrategy, SupervisionScope, Supervised } from './Supervisor.js'
import { StageInternal } from './StageInternal.js'

/**
 * PublicRootActor is the default parent for all user-created actors
 * that don't specify an explicit parent.
 *
 * It acts as a bulkhead to prevent system crashes by implementing a
 * "restart forever" supervision strategy. When child actors fail,
 * PublicRootActor attempts to restart them indefinitely.
 *
 * If PublicRootActor encounters a failure it cannot handle, it escalates
 * to its parent (PrivateRootActor) which will stop the failed actor as
 * the final line of defense.
 *
 * The PublicRootActor implements a supervision strategy with:
 * - intensity: ForeverIntensity (-1, unlimited restarts)
 * - period: ForeverPeriod (no time limit)
 * - scope: One (affects only the failing actor)
 */
export class PublicRootActor extends Actor implements Supervisor {
  /** Well-known type name for PublicRootActor */
  public static readonly PUBLIC_ROOT_NAME = '__publicRoot'

  /**
   * Self-reference as Supervisor for the supervisor() method.
   * Initialized after construction to avoid circular dependencies.
   */
  private _self!: Supervisor

  /**
   * Supervision strategy for the public root.
   *
   * Configuration:
   * - intensity: ForeverIntensity (-1, unlimited restarts)
   * - period: ForeverPeriod (no time limit)
   * - scope: One (only the failed actor is restarted)
   *
   * This strategy attempts to restart failed actors indefinitely.
   */
  private readonly _supervisionStrategy: SupervisionStrategy = new class extends SupervisionStrategy {
    intensity(): number {
      return SupervisionStrategy.ForeverIntensity
    }

    period(): number {
      return SupervisionStrategy.ForeverPeriod
    }

    scope(): SupervisionScope {
      return SupervisionScope.One
    }
  }()

  /**
   * Creates the PublicRootActor.
   *
   * Public constructor to allow instantiation from Stage.
   *
   * Initializes self-reference as Supervisor after construction completes.
   */
  constructor() {
    super()
    // Store reference to self as Supervisor for the supervisor() method
    // Use setTimeout to ensure this is set after full construction
    setTimeout(() => {
      this._self = this.selfAs<Supervisor>()
    }, 0)
  }

  /**
   * Lifecycle hook called before the PublicRootActor starts.
   *
   * Note: LocalStage.initializeRootActors() already set this actor as the default parent,
   * so we only need to log the initialization.
   */
  beforeStart(): void {
    super.beforeStart()
    this.logger().log('PublicRootActor: Initialized as default parent and default supervisor')
  }

  /**
   * Lifecycle hook called after the PublicRootActor stops.
   *
   * Clears the default parent reference in the stage so no new actors
   * can be created with this actor as parent.
   */
  afterStop(): void {
    // Clear default parent reference in stage
    // Cast to StageInternal to access internal method
    (this.stage() as StageInternal).setDefaultParent(undefined)
    this.logger().log('PublicRootActor: Stopped')
    super.afterStop()
  }

  //=========================================
  // Supervisor
  //=========================================

  /**
   * Handles failures by restarting the supervised actor.
   *
   * This implements the "restart forever" strategy to keep actors running.
   * Failed actors are restarted indefinitely without any time or count limits.
   *
   * @param error The error that occurred
   * @param supervised The supervised actor that failed
   * @returns Promise that resolves when the restart is initiated
   */
  async inform(error: Error, supervised: Supervised): Promise<void> {
    this.logger().error(
      `PublicRootActor: Failure of: ${supervised.address().valueAsString()} because: ${error.message} Action: Restarting.`,
      error
    )

    // Restart the supervised actor with the forever strategy
    supervised.restartWithin(
      this._supervisionStrategy.period(),
      this._supervisionStrategy.intensity(),
      this._supervisionStrategy.scope()
    )
  }

  /**
   * Returns the supervision strategy for the PublicRootActor.
   *
   * @returns Promise resolving to the strategy (restarts actors forever)
   */
  async supervisionStrategy(): Promise<SupervisionStrategy> {
    return Promise.resolve(this._supervisionStrategy)
  }

  /**
   * Returns this actor's supervisor.
   *
   * This should never be invoked because PublicRootActor always restarts
   * failed actors. If called (e.g., for escalation), returns itself which
   * allows escalation to the parent (PrivateRootActor).
   *
   * @returns This actor (self-reference)
   */
  supervisor(): Supervisor {
    // This should never be invoked because we always restart the Supervised.
    // If it is invoked, return self to escalate to parent (PrivateRootActor).
    return this._self
  }
}
