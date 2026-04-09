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

import { ObservableState, ObservableStateProvider } from '../ObservableState.js'

/**
 * Options for await utilities.
 */
export interface AwaitOptions {
  /**
   * Maximum time to wait in milliseconds before throwing.
   * Default: 2000ms
   */
  timeout?: number

  /**
   * Interval between checks in milliseconds.
   * Default: 50ms
   */
  interval?: number
}

/**
 * Waits for an actor's observable state to satisfy a predicate condition.
 *
 * Repeatedly polls the actor's state until the predicate returns true
 * or the timeout expires. This eliminates the need for arbitrary setTimeout()
 * calls in tests.
 *
 * @param actor The actor implementing ObservableStateProvider
 * @param predicate Function that tests the state and returns true when satisfied
 * @param options Timeout and polling interval options
 * @returns The ObservableState that satisfied the predicate
 * @throws Error if timeout expires before predicate is satisfied
 *
 * @example
 * ```typescript
 * // Wait for actor to process 3 messages
 * const state = await awaitObservableState(
 *   worker,
 *   s => s.valueOf('processedCount') === 3,
 *   { timeout: 1000 }
 * )
 * expect(state.valueOf('processedCount')).toBe(3)
 * ```
 */
export async function awaitObservableState(
  actor: ObservableStateProvider,
  predicate: (state: ObservableState) => boolean,
  options: AwaitOptions = {}
): Promise<ObservableState> {
  const { timeout = 2000, interval = 50 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const state = await actor.observableState()
    if (predicate(state)) {
      return state
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  // Timeout - get final state for error message
  const finalState = await actor.observableState()
  throw new Error(
    `Observable state predicate not satisfied within ${timeout}ms. ` +
    `Final state: ${JSON.stringify(finalState.snapshot())}`
  )
}

/**
 * Waits for a specific observable state value to reach an expected value.
 *
 * Convenience wrapper around awaitObservableState for the common case
 * of waiting for a single named value.
 *
 * @param actor The actor implementing ObservableStateProvider
 * @param name The name of the state value to check
 * @param expectedValue The value to wait for
 * @param options Timeout and polling interval options
 * @returns The ObservableState when the value matches
 * @throws Error if timeout expires
 *
 * @example
 * ```typescript
 * await awaitStateValue(worker, 'status', 'ready')
 * await awaitStateValue(worker, 'count', 5, { timeout: 500 })
 * ```
 */
export async function awaitStateValue(
  actor: ObservableStateProvider,
  name: string,
  expectedValue: any,
  options: AwaitOptions = {}
): Promise<ObservableState> {
  return awaitObservableState(
    actor,
    state => state.valueOf(name) === expectedValue,
    options
  )
}

/**
 * Repeatedly executes an assertion function until it passes or timeout expires.
 *
 * Useful for testing async actor behavior without hardcoding delays.
 * The assertion function should use normal expect() calls - if they throw,
 * the function retries until timeout.
 *
 * @param assertion Function containing expect() calls
 * @param options Timeout and polling interval options
 * @throws The last assertion error if timeout expires
 *
 * @example
 * ```typescript
 * await awaitAssert(async () => {
 *   const count = await actor.getCount()
 *   expect(count).toBe(5)
 * }, { timeout: 1000 })
 * ```
 */
export async function awaitAssert(
  assertion: () => Promise<void> | void,
  options: AwaitOptions = {}
): Promise<void> {
  const { timeout = 2000, interval = 50 } = options
  const start = Date.now()
  let lastError: Error | undefined

  while (Date.now() - start < timeout) {
    try {
      await assertion()
      return // Assertion passed!
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }

  // Timeout - throw the last assertion error
  throw lastError || new Error('Assertion did not pass within timeout')
}
