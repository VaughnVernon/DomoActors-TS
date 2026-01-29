// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { DeadLetter, DeadLettersListener } from "../DeadLetters.js"

/**
 * Test implementation of DeadLettersListener that captures all dead letters
 * for inspection in tests.
 *
 * Usage:
 * ```typescript
 * const listener = new TestDeadLettersListener()
 * stage().deadLetters().registerListener(listener)
 *
 * // ... test code that may generate dead letters ...
 *
 * expect(listener.count()).toBe(2)
 * expect(listener.all()[0].message).toContain('processRequest')
 * ```
 */
export class TestDeadLettersListener implements DeadLettersListener {
  private deadLetters: DeadLetter[] = []

  /**
   * Handles a dead letter by storing it in the collection.
   * Called by the DeadLetters system when a message cannot be delivered.
   *
   * @param deadLetter The dead letter to capture
   */
  handle(deadLetter: DeadLetter): void {
    this.deadLetters.push(deadLetter)
  }

  /**
   * Returns the total number of captured dead letters.
   *
   * @returns The count of captured dead letters
   */
  count(): number {
    return this.deadLetters.length
  }

  /**
   * Returns all captured dead letters as a copy.
   * Safe to iterate/mutate without affecting internal state.
   *
   * @returns Array of all captured dead letters
   */
  all(): DeadLetter[] {
    return [...this.deadLetters]
  }

  /**
   * Returns the most recently captured dead letter, or undefined if none.
   *
   * @returns The latest dead letter or undefined if none captured
   */
  latest(): DeadLetter | undefined {
    return this.deadLetters[this.deadLetters.length - 1]
  }

  /**
   * Returns the first captured dead letter, or undefined if none.
   *
   * @returns The first dead letter or undefined if none captured
   */
  first(): DeadLetter | undefined {
    return this.deadLetters[0]
  }

  /**
   * Clears all captured dead letters.
   * Useful when reusing the same listener across multiple tests.
   */
  clear(): void {
    this.deadLetters = []
  }

  /**
   * Finds all dead letters whose message representation contains the given pattern.
   *
   * @param pattern String to search for in message representation
   * @returns Array of matching dead letters
   */
  findByRepresentation(pattern: string): DeadLetter[] {
    return this.deadLetters.filter(dl => dl.message().includes(pattern))
  }

  /**
   * Returns true if any dead letters have been captured.
   *
   * @returns true if at least one dead letter was captured, false otherwise
   */
  hasDeadLetters(): boolean {
    return this.deadLetters.length > 0
  }
}