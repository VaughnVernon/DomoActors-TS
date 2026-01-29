// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

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