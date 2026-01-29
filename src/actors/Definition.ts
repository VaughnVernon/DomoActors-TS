// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

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