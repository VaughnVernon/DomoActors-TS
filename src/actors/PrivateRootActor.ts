// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from './Actor.js'
import { Supervisor, SupervisionStrategy, SupervisionScope, Supervised } from './Supervisor.js'

/**
 * PrivateRootActor is the ultimate root actor in the actor hierarchy.
 * It is the parent of PublicRootActor and acts as the final line of defense
 * against system failures.
 *
 * When the PublicRootActor has no recourse for a failure, the PrivateRootActor
 * receives the escalated failure and defensively seals off the system failure
 * by stopping the failed actor. Essentially, "the buck stops here."
 *
 * The PrivateRootActor implements a supervision strategy with:
 * - intensity: 0 (no retries)
 * - period: 0 (immediate decision)
 * - scope: One (affects only the failing actor)
 */
export class PrivateRootActor extends Actor implements Supervisor {
  /** Well-known type name for PrivateRootActor */
  public static readonly PRIVATE_ROOT_NAME = '__privateRoot'

  /** Well-known type name for PublicRootActor */
  public static readonly PUBLIC_ROOT_NAME = '__publicRoot'

  /**
   * Supervision strategy for the private root.
   *
   * Configuration:
   * - intensity: 0 (no retries)
   * - period: 0 (immediate decision)
   * - scope: One (only the failed actor is stopped)
   *
   * This strategy stops the failed actor immediately without retries.
   */
  private readonly _strategy: SupervisionStrategy = new class extends SupervisionStrategy {
    intensity(): number {
      return 0
    }

    period(): number {
      return 0
    }

    scope(): SupervisionScope {
      return SupervisionScope.One
    }
  }()

  /**
   * Creates the PrivateRootActor.
   *
   * Public constructor to allow instantiation from Stage.
   */
  constructor() {
    super()
  }

  /**
   * Lifecycle hook called before the PrivateRootActor starts.
   *
   * Note: LocalStage.initializeRootActors() already created PublicRootActor as our child,
   * so we only need to log the initialization.
   */
  beforeStart(): void {
    super.beforeStart()
    this.logger().log('PrivateRootActor: Initialized')
  }

  /**
   * Lifecycle hook called after the PrivateRootActor stops.
   * Logs the shutdown event.
   */
  afterStop(): void {
    this.logger().log('PrivateRootActor: Stopped')
    super.afterStop()
  }

  //=========================================
  // Supervisor
  //=========================================

  /**
   * Final line of defense - stops the failed actor.
   * This is invoked when PublicRootActor escalates a failure it cannot handle.
   *
   * The PrivateRootActor always stops the failed actor - no retries, no recovery.
   * This prevents cascading failures from bringing down the entire system.
   *
   * @param error The error that occurred
   * @param supervised The supervised actor that failed
   * @returns Promise that resolves when the actor is stopped
   */
  async inform(error: Error, supervised: Supervised): Promise<void> {
    this.logger().error(
      `PrivateRootActor: Failure of: ${supervised.address().valueAsString()} because: ${error.message} Action: Stopping.`,
      error
    )

    // Stop the supervised actor - this is the final action
    supervised.stop(this._strategy.scope())
  }

  /**
   * Returns the supervision strategy for the PrivateRootActor.
   *
   * @returns Promise resolving to the strategy (stops actors immediately with no retries)
   */
  async supervisionStrategy(): Promise<SupervisionStrategy> {
    return Promise.resolve(this._strategy)
  }

  /**
   * Returns this actor's supervisor.
   *
   * PrivateRootActor has no supervisor - it is the ultimate root of the hierarchy.
   * Returns itself to prevent null pointer errors.
   *
   * @returns This actor (self-supervision)
   */
  supervisor(): Supervisor {
    // PrivateRootActor has no supervisor - it is the ultimate root
    return this
  }
}
