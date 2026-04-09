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

/**
 * Interface for components that can be stopped.
 *
 * Used by actors and other lifecycle-managed components
 * to perform cleanup and graceful shutdown.
 */
export interface Stoppable {
  /**
   * Stops the component.
   * Called to perform cleanup and shutdown.
   * After stop, the component should not process new work.
   * @returns Promise that resolves when stop completes
   */
  stop(): Promise<void>
}