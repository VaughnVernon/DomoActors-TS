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
 * A promise that can be resolved or rejected from outside its executor.
 *
 * Used to bridge synchronous protocol method calls with asynchronous
 * actor message processing. When a protocol method is called:
 * 1. A deferred promise is created
 * 2. The promise is returned to the caller
 * 3. A message containing the deferred is queued
 * 4. When the message is delivered, the deferred is resolved/rejected
 *
 * This allows actors to return promises without blocking execution.
 */
export interface DeferredPromise<T> {
  /**
   * The promise that will be resolved or rejected.
   */
  promise: Promise<T>

  /**
   * Resolves the promise with a value.
   * @param value The resolution value
   */
  resolve: (value: T) => void

  /**
   * Rejects the promise with a reason.
   * @param reason The rejection reason (typically an Error)
   */
  reject: (reason?: any) => void
}

/**
 * Creates a deferred promise that can be resolved or rejected externally.
 * This is used to bridge synchronous proxy method calls with asynchronous actor message processing.
 *
 * @returns A DeferredPromise object containing the promise and its resolve/reject functions
 */
export function createDeferred<T>(): DeferredPromise<T> {
  let resolve: (value: T) => void
  let reject: (reason?: any) => void

  const promise = new Promise<T>((resolveWith, rejectWith) => {
    resolve = resolveWith
    reject = rejectWith
  })

  return {
    promise,
    resolve: resolve!,
    reject: reject!
  }
}