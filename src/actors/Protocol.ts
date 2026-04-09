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
import { Definition } from './Definition.js'

/**
 * Factory interface for creating actor instances.
 *
 * The instantiator creates the raw actor instance (not the proxy).
 * The stage wraps the actor with a proxy after instantiation.
 *
 * Typically implemented as an inline object in Protocol definitions:
 * ```typescript
 * {
 *   instantiate(definition: Definition): Actor {
 *     return new MyActor(...definition.parameters())
 *   }
 * }
 * ```
 */
export interface ProtocolInstantiator {
  /**
   * Creates an actor instance from the given definition.
   * @param definition Metadata containing type, address, and constructor parameters
   * @returns New actor instance (not proxied)
   */
  instantiate(definition: Definition): Actor
}

/**
 * Defines the interface and instantiation logic for an actor type.
 *
 * Protocols specify:
 * - How to create instances of the actor (instantiator)
 * - The actor's type identifier (type)
 *
 * Passed to stage.actorFor() to create typed actor proxies.
 *
 * @example
 * ```typescript
 * const CounterProtocol: Protocol = {
 *   instantiator: () => ({
 *     instantiate: (def: Definition) => new CounterActor()
 *   }),
 *   type: () => 'Counter'
 * }
 *
 * const counter = stage().actorFor<Counter>(CounterProtocol)
 * ```
 */
export interface Protocol {
  /**
   * Returns the instantiator for creating actor instances.
   * @returns Protocol instantiator
   */
  instantiator(): ProtocolInstantiator

  /**
   * Returns the type identifier for this protocol.
   * @returns Type string (typically matches the actor class name)
   */
  type(): string
}