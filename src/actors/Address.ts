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
 * Factory interface for creating actor addresses.
 *
 * Implementations provide both constructor and static factory method
 * for generating unique addresses.
 */
export interface AddressFactory {
  /**
   * Constructs a new address instance.
   */
  new (): Address

  /**
   * Generates a unique address.
   * @returns A newly created unique address
   */
  unique(): Address
}

/**
 * Unique identifier for an actor within the actor system.
 *
 * Addresses are immutable and must provide equality comparison and hashing.
 * Implementations include NumericAddress (sequential IDs) and KsuidAddress
 * (K-Sortable Unique IDentifiers).
 *
 * Used for actor lookup in the directory and message routing.
 */
export interface Address {
  /**
   * Returns the address value with generic type.
   * @returns The underlying address value
   */
  value<T>(): T

  /**
   * Returns the address as a string.
   * @returns String representation of the address value
   */
  valueAsString(): string

  /**
   * Compares this address with another for equality.
   * @param other Address to compare with
   * @returns true if addresses are equal, false otherwise
   */
  equals(other: Address): boolean

  /**
   * Returns a hash code for this address.
   * Used for efficient storage and lookup in hash-based collections.
   * @returns Hash code integer
   */
  hashCode(): number

  /**
   * Returns a string representation of this address.
   * @returns Formatted string with address details
   */
  toString(): string
}