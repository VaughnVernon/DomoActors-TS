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

import { ActorProtocol } from './ActorProtocol.js'
import { Address } from './Address.js'
import { Directory } from './Directory.js'
import { Stage } from './Stage.js'
import { StageSupervisedActor } from './Supervisor.js'

/**
 * Internal Stage interface with methods that should not be exposed to clients.
 *
 * This interface extends Stage and adds methods that are only meant to be called
 * by library-internal code (like root actors, lifecycle management, etc.).
 *
 * Clients should never have access to StageInternal - only the Stage interface.
 */
export interface StageInternal extends Stage {
  /**
   * Returns the actor directory for address-based lookup.
   * Used by (protected) Actor.childActorFor() to look up parent proxy.
   *
   * @internal - Only for use by Actor and other library-internal code
   * @returns The actor directory
   */
  directory(): Directory

  /**
   * Sets the default parent for user-created actors.
   * Called by PublicRootActor during initialization.
   *
   * @internal - Only for use by PublicRootActor
   */
  setDefaultParent(actor: ActorProtocol | undefined): void

  /**
   * Removes an actor from the directory.
   * Called by LifeCycle during actor stop sequence.
   *
   * @internal - Only for use by LifeCycle
   */
  removeFromDirectory(address: Address): void

  /**
   * Routes actor failures to the supervision system.
   * Called by LocalMessage when message processing fails, and by
   * LocalStage when lifecycle failures occur.
   *
   * Following xoom-actors pattern: Stage is the central orchestrator
   * for supervision routing.
   *
   * @param supervised The supervised actor wrapper with protocol, actor instance, and error
   * @internal - Only for use by LocalMessage and LocalStage
   */
  handleFailureOf(supervised: StageSupervisedActor): void
}
