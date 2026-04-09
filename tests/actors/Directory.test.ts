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

import { describe, it, expect, beforeEach } from 'vitest'
import { Directory, DirectoryConfigs } from '@/actors/Directory'
import { Uuid7Address } from '@/actors/Uuid7Address'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Address } from '@/actors/Address'

// Mock actor for testing
const createMockActor = (id: string): ActorProtocol => {
  return {
    actor: () => ({}) as any,
    address: () => Uuid7Address.unique(),
    stage: () => ({}) as any,
    isStopped: () => false,
    definition: () => ({}) as any,
    protocolName: () => id,
    type: () => id,
    logger: () => ({}) as any,
    deadLetters: () => ({}) as any,
    scheduler: () => ({}) as any,
    parent: () => undefined,
    children: () => [],
    stateSnapshot: () => undefined,
    restoreSnapshot: () => {},
    equals: () => false,
    hashCode: () => 0,
    toString: () => id,
    start: async () => {},
    stop: async () => {},
    restart: async () => {}
  }
}

describe('Directory', () => {
  describe('Construction and Configuration', () => {
    it('should create directory with default configuration', () => {
      const directory = new Directory()
      const config = directory.getConfig()

      expect(config.buckets).toBe(DirectoryConfigs.DEFAULT.buckets)
      expect(config.initialCapacityPerBucket).toBe(DirectoryConfigs.DEFAULT.initialCapacityPerBucket)
      expect(directory.size()).toBe(0)
    })

    it('should create directory with high-capacity configuration', () => {
      const directory = new Directory(DirectoryConfigs.HIGH_CAPACITY)
      const config = directory.getConfig()

      expect(config.buckets).toBe(128)
      expect(config.initialCapacityPerBucket).toBe(16384)
    })

    it('should create directory with small configuration', () => {
      const directory = new Directory(DirectoryConfigs.SMALL)
      const config = directory.getConfig()

      expect(config.buckets).toBe(16)
      expect(config.initialCapacityPerBucket).toBe(16)
    })

    it('should create directory with custom configuration', () => {
      const customConfig = { buckets: 64, initialCapacityPerBucket: 128 }
      const directory = new Directory(customConfig)
      const config = directory.getConfig()

      expect(config.buckets).toBe(64)
      expect(config.initialCapacityPerBucket).toBe(128)
    })
  })

  describe('Basic Operations', () => {
    let directory: Directory
    let address1: Address
    let address2: Address
    let address3: Address
    let actor1: ActorProtocol
    let actor2: ActorProtocol
    let actor3: ActorProtocol

    beforeEach(() => {
      directory = new Directory()
      address1 = Uuid7Address.unique()
      address2 = Uuid7Address.unique()
      address3 = Uuid7Address.unique()
      actor1 = createMockActor('actor1')
      actor2 = createMockActor('actor2')
      actor3 = createMockActor('actor3')
    })

    it('should set and get an actor', () => {
      directory.set(address1, actor1)

      const retrieved = directory.get(address1)

      expect(retrieved).toBe(actor1)
    })

    it('should return undefined for non-existent address', () => {
      const retrieved = directory.get(address1)

      expect(retrieved).toBeUndefined()
    })

    it('should set multiple actors', () => {
      directory.set(address1, actor1)
      directory.set(address2, actor2)
      directory.set(address3, actor3)

      expect(directory.get(address1)).toBe(actor1)
      expect(directory.get(address2)).toBe(actor2)
      expect(directory.get(address3)).toBe(actor3)
      expect(directory.size()).toBe(3)
    })

    it('should overwrite actor at same address', () => {
      directory.set(address1, actor1)
      directory.set(address1, actor2)

      const retrieved = directory.get(address1)

      expect(retrieved).toBe(actor2)
      expect(directory.size()).toBe(1)
    })

    it('should remove an actor', () => {
      directory.set(address1, actor1)

      const removed = directory.remove(address1)

      expect(removed).toBe(true)
      expect(directory.get(address1)).toBeUndefined()
      expect(directory.size()).toBe(0)
    })

    it('should return false when removing non-existent actor', () => {
      const removed = directory.remove(address1)

      expect(removed).toBe(false)
    })

    it('should remove only specified actor', () => {
      directory.set(address1, actor1)
      directory.set(address2, actor2)

      directory.remove(address1)

      expect(directory.get(address1)).toBeUndefined()
      expect(directory.get(address2)).toBe(actor2)
      expect(directory.size()).toBe(1)
    })

    it('should clear all actors', () => {
      directory.set(address1, actor1)
      directory.set(address2, actor2)
      directory.set(address3, actor3)

      directory.clear()

      expect(directory.size()).toBe(0)
      expect(directory.get(address1)).toBeUndefined()
      expect(directory.get(address2)).toBeUndefined()
      expect(directory.get(address3)).toBeUndefined()
    })
  })

  describe('Size Calculation', () => {
    it('should report correct size with no actors', () => {
      const directory = new Directory()

      expect(directory.size()).toBe(0)
    })

    it('should report correct size with one actor', () => {
      const directory = new Directory()
      const address = Uuid7Address.unique()
      const actor = createMockActor('actor')

      directory.set(address, actor)

      expect(directory.size()).toBe(1)
    })

    it('should report correct size with many actors', () => {
      const directory = new Directory()
      const count = 100

      for (let i = 0; i < count; i++) {
        const address = Uuid7Address.unique()
        const actor = createMockActor(`actor${i}`)
        directory.set(address, actor)
      }

      expect(directory.size()).toBe(count)
    })

    it('should update size when actors are removed', () => {
      const directory = new Directory()
      const addresses: Address[] = []

      for (let i = 0; i < 50; i++) {
        const address = Uuid7Address.unique()
        addresses.push(address)
        directory.set(address, createMockActor(`actor${i}`))
      }

      expect(directory.size()).toBe(50)

      // Remove half
      for (let i = 0; i < 25; i++) {
        directory.remove(addresses[i])
      }

      expect(directory.size()).toBe(25)
    })
  })

  describe('Distribution Statistics', () => {
    it('should provide statistics for empty directory', () => {
      const directory = new Directory()
      const stats = directory.getStats()

      expect(stats.buckets).toBe(DirectoryConfigs.DEFAULT.buckets)
      expect(stats.totalActors).toBe(0)
      expect(stats.averagePerBucket).toBe(0)
      expect(stats.minPerBucket).toBe(0)
      expect(stats.maxPerBucket).toBe(0)
      expect(stats.distribution.length).toBe(DirectoryConfigs.DEFAULT.buckets)
    })

    it('should provide statistics for populated directory', () => {
      const directory = new Directory()
      const count = 100

      for (let i = 0; i < count; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      const stats = directory.getStats()

      expect(stats.totalActors).toBe(count)
      expect(stats.averagePerBucket).toBeCloseTo(count / stats.buckets, 1)
      expect(stats.minPerBucket).toBeGreaterThanOrEqual(0)
      expect(stats.maxPerBucket).toBeGreaterThan(0)
      expect(stats.distribution.reduce((sum, n) => sum + n, 0)).toBe(count)
    })

    it('should show reasonable distribution across buckets', () => {
      const directory = new Directory()
      const count = 1000

      for (let i = 0; i < count; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      const stats = directory.getStats()

      // With good hash distribution, max shouldn't be more than ~3x average
      const expectedAverage = count / stats.buckets
      expect(stats.maxPerBucket).toBeLessThan(expectedAverage * 3)

      // Should use most buckets
      const nonEmptyBuckets = stats.distribution.filter(n => n > 0).length
      expect(nonEmptyBuckets).toBeGreaterThan(stats.buckets * 0.8)
    })
  })

  describe('Sharding Behavior', () => {
    it('should distribute actors across multiple buckets', () => {
      const directory = new Directory(DirectoryConfigs.DEFAULT)
      const count = 320 // 10x the number of buckets

      for (let i = 0; i < count; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      const stats = directory.getStats()

      // Should use multiple buckets
      const usedBuckets = stats.distribution.filter(n => n > 0).length
      expect(usedBuckets).toBeGreaterThan(1)
      expect(usedBuckets).toBeGreaterThan(stats.buckets * 0.5)
    })

    it('should handle hash collisions gracefully', () => {
      // Even if addresses hash to same bucket, they should all be stored
      const directory = new Directory({ buckets: 4, initialCapacityPerBucket: 10 })
      const addresses: Address[] = []
      const count = 20

      for (let i = 0; i < count; i++) {
        const address = Uuid7Address.unique()
        addresses.push(address)
        directory.set(address, createMockActor(`actor${i}`))
      }

      // All should be retrievable
      for (let i = 0; i < count; i++) {
        expect(directory.get(addresses[i])).toBeDefined()
      }

      expect(directory.size()).toBe(count)
    })
  })

  describe('Large Scale Operations', () => {
    it('should handle thousands of actors efficiently', () => {
      const directory = new Directory(DirectoryConfigs.DEFAULT)
      const count = 10000
      const addresses: Address[] = []

      // Insert
      for (let i = 0; i < count; i++) {
        const address = Uuid7Address.unique()
        addresses.push(address)
        directory.set(address, createMockActor(`actor${i}`))
      }

      expect(directory.size()).toBe(count)

      // Retrieve random samples
      for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * count)
        expect(directory.get(addresses[randomIndex])).toBeDefined()
      }

      // Remove half
      for (let i = 0; i < count / 2; i++) {
        directory.remove(addresses[i])
      }

      expect(directory.size()).toBe(count / 2)
    })

    it('should maintain performance with high-capacity config', () => {
      const directory = new Directory(DirectoryConfigs.HIGH_CAPACITY)
      const count = 50000

      for (let i = 0; i < count; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      expect(directory.size()).toBe(count)

      const stats = directory.getStats()
      expect(stats.totalActors).toBe(count)

      // Should have good distribution
      const nonEmptyBuckets = stats.distribution.filter(n => n > 0).length
      expect(nonEmptyBuckets).toBeGreaterThan(100) // Most buckets should be used
    })
  })

  describe('Configuration Immutability', () => {
    it('should return a copy of config, not the original', () => {
      const directory = new Directory()
      const config1 = directory.getConfig()
      const config2 = directory.getConfig()

      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2) // Different object references

      // Modifying returned config shouldn't affect directory
      config1.buckets = 999
      expect(directory.getConfig().buckets).toBe(DirectoryConfigs.DEFAULT.buckets)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single bucket configuration', () => {
      const directory = new Directory({ buckets: 1, initialCapacityPerBucket: 10 })

      for (let i = 0; i < 10; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      expect(directory.size()).toBe(10)

      const stats = directory.getStats()
      expect(stats.distribution[0]).toBe(10) // All in one bucket
    })

    it('should handle many small buckets', () => {
      const directory = new Directory({ buckets: 256, initialCapacityPerBucket: 1 })

      for (let i = 0; i < 100; i++) {
        directory.set(Uuid7Address.unique(), createMockActor(`actor${i}`))
      }

      expect(directory.size()).toBe(100)
    })
  })
})
