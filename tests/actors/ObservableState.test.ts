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

import { describe, it, expect } from 'vitest'
import { Actor } from '@/actors/Actor'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Definition } from '@/actors/Definition'
import { ObservableState, ObservableStateProvider } from '@/actors/ObservableState'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'
import { awaitObservableState, awaitStateValue, awaitAssert } from '@/actors/testkit/TestAwaitAssist'

// ============================================================================
// Worker Protocol and Implementation
// ============================================================================

interface Worker extends ActorProtocol {
  process(id: number): Promise<void>
  reset(): Promise<void>
  getProcessedCount(): Promise<number>
}

/**
 * Example actor demonstrating ObservableStateProvider pattern.
 *
 * This actor implements both its business protocol (Worker)
 * and ObservableStateProvider for testability.
 */
class WorkerActor extends Actor implements Worker, ObservableStateProvider {
  private processedIds: number[] = []
  private processedCount: number = 0
  private status: string = 'idle'

  async process(id: number): Promise<void> {
    this.status = 'busy'
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 10))
    this.processedIds.push(id)
    this.processedCount++
    this.status = 'idle'
  }

  async reset(): Promise<void> {
    this.processedIds = []
    this.processedCount = 0
    this.status = 'idle'
  }

  async getProcessedCount(): Promise<number> {
    return this.processedCount
  }

  /**
   * Exposes internal state for testing.
   * Returns a snapshot - not mutable internal references!
   */
  async observableState(): Promise<ObservableState> {
    return new ObservableState()
      .putValue('processedCount', this.processedCount)
      .putValue('processedIds', [...this.processedIds])  // Copy array
      .putValue('status', this.status)
      .putValue('lastProcessed', this.processedIds[this.processedIds.length - 1])
  }
}

const WorkerProtocol: Protocol = {
  instantiator(): ProtocolInstantiator {
    return {
      instantiate(_definition: Definition): Actor {
        return new WorkerActor()
      }
    }
  },
  type(): string {
    return 'Worker'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ObservableState Pattern', () => {
  describe('ObservableState class', () => {
    it('should store and retrieve values', () => {
      const state = new ObservableState()
      state.putValue('count', 42)
      state.putValue('status', 'active')

      expect(state.valueOf('count')).toBe(42)
      expect(state.valueOf('status')).toBe('active')
      expect(state.valueOf('missing')).toBeUndefined()
    })

    it('should support fluent chaining', () => {
      const state = new ObservableState()
        .putValue('a', 1)
        .putValue('b', 2)
        .putValue('c', 3)

      expect(state.valueOf('a')).toBe(1)
      expect(state.valueOf('b')).toBe(2)
      expect(state.valueOf('c')).toBe(3)
    })

    it('should provide typed valueOf', () => {
      const state = new ObservableState()
        .putValue('count', 42)
        .putValue('items', [1, 2, 3])

      const count: number = state.valueOf<number>('count')
      const items: number[] = state.valueOf<number[]>('items')

      expect(count).toBe(42)
      expect(items).toEqual([1, 2, 3])
    })

    it('should provide valueOfOrDefault', () => {
      const state = new ObservableState()
        .putValue('count', 10)

      expect(state.valueOfOrDefault('count', 0)).toBe(10)
      expect(state.valueOfOrDefault('missing', 0)).toBe(0)
      expect(state.valueOfOrDefault('missing', 'default')).toBe('default')
    })

    it('should check value existence', () => {
      const state = new ObservableState()
        .putValue('exists', 'yes')

      expect(state.hasValue('exists')).toBe(true)
      expect(state.hasValue('missing')).toBe(false)
    })

    it('should return size and keys', () => {
      const state = new ObservableState()
        .putValue('a', 1)
        .putValue('b', 2)
        .putValue('c', 3)

      expect(state.size()).toBe(3)
      expect(state.keys()).toEqual(['a', 'b', 'c'])
    })

    it('should provide snapshot', () => {
      const state = new ObservableState()
        .putValue('count', 42)
        .putValue('status', 'active')

      const snapshot = state.snapshot()

      expect(snapshot).toEqual({
        count: 42,
        status: 'active'
      })
    })

    it('should clear all values', () => {
      const state = new ObservableState()
        .putValue('a', 1)
        .putValue('b', 2)

      expect(state.size()).toBe(2)

      state.clear()

      expect(state.size()).toBe(0)
      expect(state.hasValue('a')).toBe(false)
    })
  })

  describe('ObservableStateProvider usage', () => {
    it('should expose internal state for testing', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)
      await worker.process(2)
      await worker.process(3)

      const state = await worker.observableState()

      expect(state.valueOf('processedCount')).toBe(3)
      expect(state.valueOf('processedIds')).toEqual([1, 2, 3])
      expect(state.valueOf('lastProcessed')).toBe(3)
      expect(state.valueOf('status')).toBe('idle')
    })

    it('should provide state snapshot, not mutable references', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)

      const state1 = await worker.observableState()
      const ids1 = state1.valueOf<number[]>('processedIds')

      await worker.process(2)

      const state2 = await worker.observableState()
      const ids2 = state2.valueOf<number[]>('processedIds')

      // Different snapshots - modifications don't affect actor
      expect(ids1).toEqual([1])
      expect(ids2).toEqual([1, 2])

      ids1.push(999)  // Mutate snapshot

      const state3 = await worker.observableState()
      expect(state3.valueOf('processedIds')).toEqual([1, 2])  // Unaffected
    })

    it('should work alongside normal protocol methods', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)
      await worker.process(2)

      // Traditional query method
      const count = await worker.getProcessedCount()
      expect(count).toBe(2)

      // Observable state (more detailed)
      const state = await worker.observableState()
      expect(state.valueOf('processedCount')).toBe(2)
      expect(state.valueOf('processedIds')).toEqual([1, 2])
      expect(state.valueOf('status')).toBe('idle')
    })
  })

  describe('Test utilities', () => {
    it('should await observable state condition', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      // Start async processing
      worker.process(1)
      worker.process(2)
      worker.process(3)

      // Wait for condition to be satisfied
      const state = await awaitObservableState(
        worker,
        s => s.valueOf('processedCount') === 3,
        { timeout: 1000 }
      )

      expect(state.valueOf('processedCount')).toBe(3)
      expect(state.valueOf('processedIds')).toHaveLength(3)
    })

    it('should await specific state value', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      worker.process(1)
      worker.process(2)
      worker.process(3)

      await awaitStateValue(worker, 'processedCount', 3, { timeout: 1000 })

      const state = await worker.observableState()
      expect(state.valueOf('processedCount')).toBe(3)
    })

    it('should throw if state condition not met within timeout', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)

      await expect(
        awaitObservableState(
          worker,
          s => s.valueOf('processedCount') === 999,
          { timeout: 100, interval: 10 }
        )
      ).rejects.toThrow(/not satisfied within 100ms/)
    })

    it('should await assertion to pass', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      worker.process(1)
      worker.process(2)
      worker.process(3)

      await awaitAssert(async () => {
        const state = await worker.observableState()
        expect(state.valueOf('processedCount')).toBe(3)
        expect(state.valueOf('status')).toBe('idle')
      }, { timeout: 1000 })
    })

    it('should throw last assertion error on timeout', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)

      await expect(
        awaitAssert(async () => {
          const state = await worker.observableState()
          expect(state.valueOf('processedCount')).toBe(999)
        }, { timeout: 100, interval: 10 })
      ).rejects.toThrow(/expected.*999/i)
    })
  })

  describe('Real-world testing patterns', () => {
    it('should verify async processing completes', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      // Fire off multiple async operations
      for (let i = 1; i <= 10; i++) {
        worker.process(i)
      }

      // Wait for all to complete
      const state = await awaitObservableState(
        worker,
        s => s.valueOf('processedCount') === 10,
        { timeout: 2000 }
      )

      expect(state.valueOf('processedIds')).toHaveLength(10)
      expect(state.valueOf('status')).toBe('idle')
    })

    it('should verify intermediate state during processing', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      worker.process(1)
      worker.process(2)

      // Wait for partial completion
      await awaitStateValue(worker, 'processedCount', 2, { timeout: 1000 })

      // Continue processing
      worker.process(3)
      worker.process(4)

      // Wait for full completion
      await awaitStateValue(worker, 'processedCount', 4, { timeout: 1000 })
    })

    it('should verify state after reset', async () => {
      const worker = stage().actorFor<Worker & ObservableStateProvider>(WorkerProtocol)

      await worker.process(1)
      await worker.process(2)

      let state = await worker.observableState()
      expect(state.valueOf('processedCount')).toBe(2)

      await worker.reset()

      state = await worker.observableState()
      expect(state.valueOf('processedCount')).toBe(0)
      expect(state.valueOf('processedIds')).toEqual([])
      expect(state.valueOf('status')).toBe('idle')
    })
  })
})
