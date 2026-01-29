// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Address } from './Address.js'
import { ActorProtocol } from './ActorProtocol.js'

/**
 * Configuration for Directory capacity tuning.
 *
 * Based on xoom-actors Directory.java sharding approach:
 * - Uses array of Map instances to distribute load
 * - Each bucket is independent for better cache locality
 * - Avoids single large map with resize overhead
 */
export interface DirectoryConfig {
  /**
   * Number of buckets (shards) for distributing actors.
   * More buckets = better distribution for large actor counts.
   */
  buckets: number

  /**
   * Initial capacity hint per bucket.
   * Total pre-allocated capacity = buckets * initialCapacityPerBucket
   */
  initialCapacityPerBucket: number
}

/**
 * Predefined directory configurations for common use cases.
 */
export class DirectoryConfigs {
  /**
   * Default configuration: 32 buckets × 32 capacity = ~1,000 actors
   * Suitable for most applications with moderate actor counts.
   * Low memory overhead, good performance.
   */
  static readonly DEFAULT: DirectoryConfig = {
    buckets: 32,
    initialCapacityPerBucket: 32
  }

  /**
   * High-capacity configuration: 128 buckets × 16,384 capacity = ~2,000,000 actors
   * Suitable for large-scale applications (e.g., distributed grids).
   * Higher memory overhead, excellent scalability.
   */
  static readonly HIGH_CAPACITY: DirectoryConfig = {
    buckets: 128,
    initialCapacityPerBucket: 16384
  }

  /**
   * Small configuration: 16 buckets × 16 capacity = ~256 actors
   * Suitable for testing or very small applications.
   * Minimal memory overhead.
   */
  static readonly SMALL: DirectoryConfig = {
    buckets: 16,
    initialCapacityPerBucket: 16
  }
}

/**
 * Sharded actor directory for efficient lookup and registration.
 *
 * Uses an array of Map instances to distribute actors across multiple buckets,
 * providing better scalability and cache locality than a single large map.
 *
 * Inspired by xoom-actors Directory.java implementation.
 *
 * Performance characteristics:
 * - Lookup: O(1) average case (hash-based with modulo sharding)
 * - Insert: O(1) average case
 * - Remove: O(1) average case
 * - Size: O(buckets) - must iterate all buckets
 *
 * Scalability:
 * - DEFAULT config: ~1K actors (32 buckets × 32 capacity)
 * - HIGH_CAPACITY config: ~2M actors (128 buckets × 16K capacity)
 */
export class Directory {
  private readonly buckets: Map<string, ActorProtocol>[]
  private readonly config: DirectoryConfig
  private readonly typeIndex: Map<string, ActorProtocol>

  /**
   * Creates a new Directory with the specified configuration.
   *
   * @param config Directory configuration (defaults to DirectoryConfigs.DEFAULT)
   * @example
   * ```typescript
   * // Use default configuration (~1K actors)
   * const directory = new Directory()
   *
   * // Use high-capacity configuration (~2M actors)
   * const directory = new Directory(DirectoryConfigs.HIGH_CAPACITY)
   *
   * // Custom configuration
   * const directory = new Directory({ buckets: 64, initialCapacityPerBucket: 128 })
   * ```
   */
  constructor(config: DirectoryConfig = DirectoryConfigs.DEFAULT) {
    this.config = config
    this.buckets = new Array(config.buckets)
    this.typeIndex = new Map<string, ActorProtocol>()

    // Initialize each bucket as an empty Map
    // Note: JavaScript Map doesn't have initial capacity, but we track it for documentation
    for (let i = 0; i < config.buckets; i++) {
      this.buckets[i] = new Map<string, ActorProtocol>()
    }
  }

  /**
   * Registers an actor in the directory.
   *
   * @param address Actor's unique address
   * @param actor Actor protocol instance
   */
  set(address: Address, actor: ActorProtocol): void {
    const bucket = this.bucketFor(address)
    bucket.set(address.valueAsString(), actor)

    // Index by type for supervisor and well-known actor lookup
    const type = actor.type()
    this.typeIndex.set(type, actor)
  }

  /**
   * Looks up an actor by address.
   *
   * @param address Actor's address
   * @returns Actor protocol instance or undefined if not found
   */
  get(address: Address): ActorProtocol | undefined {
    const bucket = this.bucketFor(address)
    return bucket.get(address.valueAsString())
  }

  /**
   * Removes an actor from the directory.
   *
   * @param address Actor's address
   * @returns true if actor was removed, false if not found
   */
  remove(address: Address): boolean {
    const bucket = this.bucketFor(address)
    const actor = bucket.get(address.valueAsString())

    if (actor) {
      // Remove from type index
      const type = actor.type()
      this.typeIndex.delete(type)
    }

    return bucket.delete(address.valueAsString())
  }

  /**
   * Returns the total number of registered actors.
   *
   * Note: This is O(buckets) as it must iterate all buckets.
   * Consider caching if called frequently.
   */
  size(): number {
    let total = 0
    for (const bucket of this.buckets) {
      total += bucket.size
    }
    return total
  }

  /**
   * Looks up an actor by its type name.
   * Used for finding supervisors and well-known actors (e.g., '__publicRoot').
   *
   * @param type Actor type name from Definition
   * @returns Actor protocol instance or undefined if not found
   */
  findByType(type: string): ActorProtocol | undefined {
    return this.typeIndex.get(type)
  }

  /**
   * Removes all actors from the directory.
   */
  clear(): void {
    for (const bucket of this.buckets) {
      bucket.clear()
    }
    this.typeIndex.clear()
  }

  /**
   * Returns all actors in the directory.
   * Used for stage shutdown to stop actors in proper order.
   *
   * @returns Array of all actor protocol instances
   */
  all(): ActorProtocol[] {
    const actors: ActorProtocol[] = []
    for (const bucket of this.buckets) {
      for (const actor of bucket.values()) {
        actors.push(actor)
      }
    }
    return actors
  }

  /**
   * Returns configuration details for debugging/monitoring.
   */
  getConfig(): DirectoryConfig {
    return { ...this.config }
  }

  /**
   * Returns distribution statistics across buckets.
   * Useful for monitoring load distribution and detecting hotspots.
   *
   * @returns Statistics object containing:
   *   - buckets: Number of shards in the directory
   *   - totalActors: Total number of registered actors
   *   - averagePerBucket: Average actors per bucket
   *   - minPerBucket: Minimum actors in any bucket
   *   - maxPerBucket: Maximum actors in any bucket
   *   - distribution: Array of actor counts for each bucket
   *
   * @example
   * ```typescript
   * const stats = directory.getStats()
   * console.log(`Total actors: ${stats.totalActors}`)
   * console.log(`Average per bucket: ${stats.averagePerBucket.toFixed(2)}`)
   * console.log(`Load distribution: ${stats.minPerBucket} - ${stats.maxPerBucket}`)
   * ```
   */
  getStats(): {
    buckets: number
    totalActors: number
    averagePerBucket: number
    minPerBucket: number
    maxPerBucket: number
    distribution: number[]
  } {
    const distribution = this.buckets.map(bucket => bucket.size)
    const totalActors = distribution.reduce((sum, count) => sum + count, 0)

    return {
      buckets: this.buckets.length,
      totalActors,
      averagePerBucket: totalActors / this.buckets.length,
      minPerBucket: Math.min(...distribution, 0),
      maxPerBucket: Math.max(...distribution, 0),
      distribution
    }
  }

  /**
   * Determines which bucket an address maps to using modulo hashing.
   *
   * Formula: bucketIndex = Math.abs(address.hashCode()) % buckets.length
   *
   * Uses Math.abs() to handle negative hash codes.
   */
  private bucketFor(address: Address): Map<string, ActorProtocol> {
    const hashCode = address.hashCode()
    const index = Math.abs(hashCode) % this.buckets.length
    return this.buckets[index]!
  }
}
