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
 * Internal symbols for accessing actor infrastructure.
 * These symbols should ONLY be used by library code, never by external clients.
 *
 * Using symbols prevents accidental access and makes it clear these are internal APIs.
 */

/**
 * Symbol for accessing an actor's environment.
 * Only library code should use this.
 *
 * @internal
 */
export const INTERNAL_ENVIRONMENT_ACCESS = Symbol('@@DomoActors/internalEnvironment')

/**
 * Helper type for accessing internal methods on actor proxies.
 * Library code can cast to this type to access internal infrastructure.
 *
 * @internal
 */
export interface InternalActorAccess {
  [INTERNAL_ENVIRONMENT_ACCESS]: () => any
}
