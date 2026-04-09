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
 * Container for actor state that can be observed during testing or debugging.
 *
 * Provides a type-safe way for actors to expose internal state without
 * breaking encapsulation. Actors implementing ObservableStateProvider
 * populate this with snapshots of their state.
 *
 * Inspired by xoom-actors TestState pattern.
 */
export class ObservableState {
  private state: Map<string, any>

  constructor() {
    this.state = new Map()
  }

  /**
   * Stores a value with the given name.
   * Returns this instance for fluent chaining.
   *
   * @param name The key for the value
   * @param value The value to store
   * @returns This ObservableState instance
   */
  putValue(name: string, value: any): ObservableState {
    this.state.set(name, value)
    return this
  }

  /**
   * Retrieves a value by name with optional type parameter.
   *
   * @param name The key of the value to retrieve
   * @returns The stored value, or undefined if not found
   */
  valueOf<T = any>(name: string): T {
    return this.state.get(name)
  }

  /**
   * Retrieves a value by name, returning a default if not found.
   *
   * @param name The key of the value to retrieve
   * @param defaultValue Value to return if key doesn't exist
   * @returns The stored value or the default
   */
  valueOfOrDefault<T>(name: string, defaultValue: T): T {
    return this.state.has(name) ? this.state.get(name) : defaultValue
  }

  /**
   * Checks if a value exists for the given name.
   *
   * @param name The key to check
   * @returns true if the value exists, false otherwise
   */
  hasValue(name: string): boolean {
    return this.state.has(name)
  }

  /**
   * Returns the number of stored values.
   */
  size(): number {
    return this.state.size
  }

  /**
   * Returns all stored keys.
   */
  keys(): string[] {
    return Array.from(this.state.keys())
  }

  /**
   * Removes all stored values.
   */
  clear(): void {
    this.state.clear()
  }

  /**
   * Returns a plain object snapshot of all state.
   * Useful for debugging and logging.
   */
  snapshot(): Record<string, any> {
    return Object.fromEntries(this.state)
  }
}

/**
 * Interface for actors that can expose their internal state for observation.
 *
 * Primarily used for testing, but can also be useful for debugging,
 * monitoring, or state inspection in development/staging environments.
 *
 * Actors should return a snapshot of their state, not expose mutable
 * internal references.
 *
 * Example:
 * ```typescript
 * class WorkerActor extends Actor implements Worker, ObservableStateProvider {
 *   private processedCount = 0
 *   private items: string[] = []
 *
 *   async observableState(): Promise<ObservableState> {
 *     return new ObservableState()
 *       .putValue('processedCount', this.processedCount)
 *       .putValue('items', [...this.items])  // Copy, don't expose internal array
 *   }
 * }
 * ```
 */
export interface ObservableStateProvider {
  observableState(): Promise<ObservableState>
}