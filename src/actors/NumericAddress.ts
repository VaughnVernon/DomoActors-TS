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

import { Address, AddressFactory } from "./Address.js"

/**
 * Sequential numeric address implementation.
 *
 * Generates unique addresses using incrementing integers starting from 1.
 * Suitable for testing and development where human-readable IDs are helpful.
 *
 * Thread-safety: Safe in single-threaded JavaScript environment.
 * For production use with distributed systems, consider KsuidAddress.
 *
 * @example
 * ```typescript
 * const addr1 = NumericAddress.unique()  // Address: 1
 * const addr2 = NumericAddress.unique()  // Address: 2
 * ```
 */
export const NumericAddress: AddressFactory = class implements Address {
  private _value: number

  /**
   * Generates a new unique numeric address.
   * @returns A new address with sequential ID
   */
  static unique(): Address {
    return new NumericAddress()
  }

  /**
   * Creates a new numeric address with auto-incremented value.
   */
  constructor() {
    this._value = nextAddressValue()
  }

  /**
   * Returns the numeric address as a string.
   * @returns String representation of the numeric value
   */
  valueAsString(): string {
    return "" + this.value()
  }

  /**
   * Returns the numeric value with generic type.
   * @returns The numeric address value
   */
  value<T>(): T {
    return this._value as T
  }

  /**
   * Compares this address with another by numeric value.
   * @param other Address to compare with
   * @returns true if numeric values are equal, false otherwise
   */
  equals(other: Address): boolean {
    return this.value() === other.value()
  }

  /**
   * Returns a hash code based on the numeric value.
   * @returns Hash code (31 * numeric value)
   */
  hashCode(): number {
    return 31 * this.value<number>()
  }

  /**
   * Returns a string representation of this address.
   * @returns Formatted string "Address: <value>"
   */
  toString(): string {
    return "Address: " + this.value()
  }
}

/**
 * Internal counter for generating sequential address values.
 * Starts at 1 and increments with each new address.
 */
let nextValue = 1

/**
 * Generates the next sequential address value.
 * Thread-safe in single-threaded JavaScript environment.
 * @returns The next numeric address value
 */
const nextAddressValue = (): number => {
  return nextValue++ // safe for single-threaded environment
}