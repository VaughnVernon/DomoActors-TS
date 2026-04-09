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

import { uuidv7 } from 'uuidv7'
import { Address, AddressFactory } from "./Address.js"

/**
 * UUIDv7 address implementation.
 *
 * Generates globally unique, time-sortable addresses using the UUIDv7 standard (RFC 9562).
 * UUIDv7 combines:
 * - Timestamp (milliseconds since Unix epoch) - 48 bits
 * - Random payload - 74 bits
 * - Version and variant fields
 *
 * Advantages over NumericAddress:
 * - Globally unique (suitable for distributed systems)
 * - Time-ordered with millisecond precision (useful for debugging and logging)
 * - No coordination required
 * - RFC standard with native database support
 * - Runtime-agnostic (works in browsers, Node.js, Deno, Bun, edge runtimes)
 *
 * Recommended for production use.
 *
 * @example
 * ```typescript
 * const addr = Uuid7Address.unique()  // "018e6c7e-8e7a-7c3e-9f1a-3b2c1d0e0f1a"
 * ```
 */
export const Uuid7Address: AddressFactory = class implements Address {
  private _value: string

  /**
   * Generates a new unique UUIDv7 address.
   * @returns A new address with UUIDv7 value
   */
  static unique(): Address {
    return new Uuid7Address()
  }

  /**
   * Creates a new UUIDv7 address.
   * Generates a random UUIDv7 using Web Crypto API.
   */
  constructor() {
    this._value = uuidv7()
  }

  /**
   * Returns the UUIDv7 as a string.
   * @returns String representation of the UUIDv7
   */
  valueAsString(): string {
    return this.value()
  }

  /**
   * Returns the UUIDv7 value with generic type.
   * @returns The UUIDv7 string value
   */
  value<T>(): T {
    return this._value as T
  }

  /**
   * Compares this address with another by UUIDv7 string value.
   * @param other Address to compare with
   * @returns true if UUIDv7 values are equal, false otherwise
   */
  equals(other: Address): boolean {
    return this.value() === other.value()
  }

  /**
   * Returns a hash code based on the UUIDv7 string.
   * Uses a simple string hashing algorithm.
   * @returns Positive 32-bit hash code
   */
  hashCode(): number {
    // Simple string hash algorithm
    const str = this.value<string>()
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Returns a string representation of this address.
   * @returns Formatted string "Address: <uuid>"
   */
  toString(): string {
    return "Address: " + this.value()
  }
}
