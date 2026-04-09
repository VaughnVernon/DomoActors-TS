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

import { Address } from "./Address.js"

/**
 * Metadata for creating an actor instance.
 *
 * Defines:
 * - The actor type (string identifier, typically class name)
 * - The actor's unique address
 * - Constructor parameters for instantiation
 *
 * Created by the stage when actorFor() is called and passed to
 * the protocol's instantiator to create the actor.
 */
export class Definition {
  /**
   * Creates a new actor definition.
   * @param _type Actor type identifier (typically class name)
   * @param _address Unique address for the actor
   * @param _parameters Constructor parameters (default: empty array)
   */
  constructor(
    private _type: string,
    private _address: Address,
    private _parameters: any[] = []
  ) {}

  /**
   * Returns the actor type identifier.
   * @returns Type string (typically class name)
   */
  type(): string {
    return this._type
  }

  /**
   * Returns the actor's unique address.
   * @returns Actor address
   */
  address(): Address {
    return this._address
  }

  /**
   * Returns a copy of the constructor parameters.
   * @returns Array of parameters (defensive copy)
   */
  parameters(): any[] {
    return [... this._parameters]
  }
}