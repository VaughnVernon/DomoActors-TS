// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { ActorProtocol } from "./ActorProtocol"

/**
 * Context for storing execution-scoped data.
 *
 * Provides a key-value store for sharing data across actor operations
 * within the same execution context. Can be used for request-scoped
 * data, transaction contexts, or other contextual information.
 *
 * Currently minimal implementation - may be extended for future features
 * like distributed tracing, correlation IDs, or transaction boundaries.
 */
export class ExecutionContext {
  private _collaborators: ActorProtocol[]
  private _map: Map<string, any>

  /**
   * Creates a new execution context with empty storage.
   */
  constructor() {
    this._map = new Map()
    this._collaborators = []
  }

  /**
   * Records the list of my collaborators to which I propagate my ExecutionContext.
   * @param collaborators the ActorProtocol[] proxies of all actors to set
   */
  collaborators(collaborators: ActorProtocol[]): void {
    this._collaborators = this._collaborators.concat([...collaborators])
  }

  /**
   * Provides an exact but unique copy of myself.
   * @returns a new ExecutionContext that is an exact but unique copy of myself
   */
  copy(): ExecutionContext {
    const copy = new ExecutionContext()
    copy._collaborators = [...this._collaborators]
    copy._map = new Map([...this._map])
    return copy
  }

  /**
   * Provides the number of key-value pairs currently held.
   * @return the number of key-value pairs currently held
   */
  count(): number {
    return this._map.size
  }

  /**
   * Indicates whether there are any key-value pairs.
   * @return true if there is one or more key-value pairs; otherwise false
   */
  hasContext(): boolean {
    return this.count() > 0
  }

  /**
   * Retrieves a value from the context by key.
   * @param key The key to look up
   * @returns The stored value or undefined if not found
   */
  getValue<T>(key: string): T | undefined {
    return this._map.get(key)
  }

  /**
   * Stores a value in the context with the given key.
   * @param key The key to store under
   * @param value The value to store
   * @returns Myself so that another value can be set
   */
  setValue<T>(key: string, value: T): ExecutionContext {
    this._map.set(key, value)
    return this
  }

  /**
   * Sets my key-value pairs on each of the actors in actorProxies.
   * @param collaborators the ActorProtocol[] proxies of all actors to set
   */
  propagate(): void {
    this._collaborators.forEach(collaborator => {
      const context = (collaborator as ActorProtocol).executionContext()
      context.setAll(this._map)
    })
  }

  /**
   * Resets my state to have not key-value pairs.
   * @returns Myself so that a value can be set immediately following
   */
  reset(): ExecutionContext {
    this._map.clear()
    return this
  }

  toString(): string {
    let representation = 'ExecutionContext: '

    this._collaborators.forEach((actor) => {
      representation = representation + `\n${actor}}`
    })

    representation = representation + ' with:\n'

    this._map.forEach((value: any, key: string) => {
      representation = representation + `${key} = ${value.toString()}\n`
    })

    return representation
  }

  private setAll(map: Map<string, any>): void {
    this._map = new Map([...map])
  }
}

class NoPairsExecutionContext extends ExecutionContext {
  constructor() {
    super()
  }

  setValue<T>(key: string, value: T): ExecutionContext {
    key as any
    value as any

    return this
  }
}

export const EmptyExecutionContext = new NoPairsExecutionContext()