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
import { Actor } from '@/actors/Actor'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'
import { ActorProtocol } from '@/actors/ActorProtocol'

// ============================================================================
// Stateful Protocol: Implements custom stateSnapshot
// ============================================================================

interface Stateful extends ActorProtocol {
  setValue(value: string): Promise<void>
  getValue(): Promise<string>
  saveSnapshot(): Promise<void>
  restoreSnapshot(): Promise<void>
}

interface StatefulSnapshot {
  value: string
  timestamp: number
}

class StatefulActor extends Actor implements Stateful {
  private _value: string = ''
  private _snapshot: StatefulSnapshot | undefined = undefined

  constructor() {
    super()
  }

  async setValue(value: string): Promise<void> {
    this._value = value
  }

  async getValue(): Promise<string> {
    return this._value
  }

  async saveSnapshot(): Promise<void> {
    const snapshot: StatefulSnapshot = {
      value: this._value,
      timestamp: Date.now()
    }
    this.stateSnapshot(snapshot)
  }

  async restoreSnapshot(): Promise<void> {
    const snapshot = this.stateSnapshot<StatefulSnapshot>()
    if (snapshot) {
      this._value = snapshot.value
    }
  }

  // Override stateSnapshot to store/retrieve snapshots
  stateSnapshot<S>(stateSnapshot: S): void
  stateSnapshot<S>(): S
  stateSnapshot<S>(stateSnapshot?: S): S | void {
    if (stateSnapshot !== undefined) {
      this._snapshot = stateSnapshot as any
      return
    }
    return this._snapshot as S
  }
}

const statefulActors: Map<string, StatefulActor> = new Map()

class StatefulInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new StatefulActor()
    statefulActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

export class StatefulProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new StatefulInstantiator()
  }

  type(): string {
    return 'Stateful'
  }
}

// ============================================================================
// Simple Protocol: Uses default stateSnapshot (returns undefined)
// ============================================================================

interface Simple extends ActorProtocol {
  doSomething(): Promise<void>
}

class SimpleActor extends Actor implements Simple {
  constructor() {
    super()
   }

  async doSomething(): Promise<void> {
    // No-op
  }
}

const simpleActors: Map<string, SimpleActor> = new Map()

class SimpleInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new SimpleActor()
    simpleActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

export class SimpleProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SimpleInstantiator()
  }

  type(): string {
    return 'Simple'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Actor State Snapshots', () => {
  beforeEach(() => {
    // Clear actor maps before each test
    statefulActors.clear()
    simpleActors.clear()
  })

  describe('Custom stateSnapshot implementation', () => {
    it('should store and retrieve state snapshot', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())

      // Set a value
      await proxy.setValue('test-value')

      // Save snapshot
      await proxy.saveSnapshot()

      // Get the underlying actor to access stateSnapshot directly
      const actor = statefulActors.get(proxy.address().valueAsString())
      expect(actor).toBeDefined()

      // Retrieve snapshot and verify
      const snapshot = actor!.stateSnapshot<StatefulSnapshot>()
      expect(snapshot).toBeDefined()
      expect(snapshot!.value).toBe('test-value')
      expect(snapshot!.timestamp).toBeGreaterThan(0)
    })

    it('should restore state from snapshot', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())

      // Set initial value and save snapshot
      await proxy.setValue('initial')
      await proxy.saveSnapshot()

      // Change the value
      await proxy.setValue('changed')
      let value = await proxy.getValue()
      expect(value).toBe('changed')

      // Restore from snapshot
      await proxy.restoreSnapshot()
      value = await proxy.getValue()
      expect(value).toBe('initial')
    })

    it('should update snapshot when saved multiple times', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())
      const actor = statefulActors.get(proxy.address().valueAsString())!

      // First snapshot
      await proxy.setValue('first')
      await proxy.saveSnapshot()
      const snapshot1 = actor.stateSnapshot<StatefulSnapshot>()
      expect(snapshot1!.value).toBe('first')
      const timestamp1 = snapshot1!.timestamp

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      // Second snapshot
      await proxy.setValue('second')
      await proxy.saveSnapshot()
      const snapshot2 = actor.stateSnapshot<StatefulSnapshot>()
      expect(snapshot2!.value).toBe('second')
      expect(snapshot2!.timestamp).toBeGreaterThan(timestamp1)
    })

    it('should return undefined before any snapshot is saved', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())
      const actor = statefulActors.get(proxy.address().valueAsString())!

      // No snapshot saved yet
      const snapshot = actor.stateSnapshot<StatefulSnapshot>()
      expect(snapshot).toBeUndefined()
    })

    it('should preserve snapshot after state changes', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())
      const actor = statefulActors.get(proxy.address().valueAsString())!

      // Save snapshot
      await proxy.setValue('snapshot-value')
      await proxy.saveSnapshot()

      // Change state without saving
      await proxy.setValue('new-value')

      // Snapshot should still have old value
      const snapshot = actor.stateSnapshot<StatefulSnapshot>()
      expect(snapshot!.value).toBe('snapshot-value')

      // But current value is different
      const currentValue = await proxy.getValue()
      expect(currentValue).toBe('new-value')
    })
  })

  describe('Default stateSnapshot behavior', () => {
    it('should return undefined for actors without custom implementation', async () => {
      const proxy: Simple = stage().actorFor(new SimpleProtocol())
      const actor = simpleActors.get(proxy.address().valueAsString())!

      // Default implementation returns undefined
      const snapshot = actor.stateSnapshot<any>()
      expect(snapshot).toBeUndefined()
    })

    it('should not throw when setting snapshot on default implementation', async () => {
      const proxy: Simple = stage().actorFor(new SimpleProtocol())
      const actor = simpleActors.get(proxy.address().valueAsString())!

      // Default implementation is a no-op for setter
      expect(() => {
        actor.stateSnapshot({ some: 'data' })
      }).not.toThrow()

      // But getter still returns undefined
      const snapshot = actor.stateSnapshot<any>()
      expect(snapshot).toBeUndefined()
    })
  })

  describe('Snapshot isolation between actors', () => {
    it('should maintain separate snapshots for different actors', async () => {
      const proxy1: Stateful = stage().actorFor(new StatefulProtocol())
      const proxy2: Stateful = stage().actorFor(new StatefulProtocol())

      const actor1 = statefulActors.get(proxy1.address().valueAsString())!
      const actor2 = statefulActors.get(proxy2.address().valueAsString())!

      // Set different values and save snapshots
      await proxy1.setValue('actor1-value')
      await proxy1.saveSnapshot()

      await proxy2.setValue('actor2-value')
      await proxy2.saveSnapshot()

      // Verify snapshots are isolated
      const snapshot1 = actor1.stateSnapshot<StatefulSnapshot>()
      const snapshot2 = actor2.stateSnapshot<StatefulSnapshot>()

      expect(snapshot1!.value).toBe('actor1-value')
      expect(snapshot2!.value).toBe('actor2-value')
    })

    it('should not share snapshot state between actor instances', async () => {
      const proxy1: Stateful = stage().actorFor(new StatefulProtocol())
      const proxy2: Stateful = stage().actorFor(new StatefulProtocol())

      const actor1 = statefulActors.get(proxy1.address().valueAsString())!
      const actor2 = statefulActors.get(proxy2.address().valueAsString())!

      // Save snapshot only for actor1
      await proxy1.setValue('has-snapshot')
      await proxy1.saveSnapshot()

      // Actor2 should not have a snapshot
      const snapshot1 = actor1.stateSnapshot<StatefulSnapshot>()
      const snapshot2 = actor2.stateSnapshot<StatefulSnapshot>()

      expect(snapshot1).toBeDefined()
      expect(snapshot2).toBeUndefined()
    })
  })

  describe('Complex snapshot scenarios', () => {
    it('should handle multiple save and restore cycles', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())

      // Cycle 1
      await proxy.setValue('v1')
      await proxy.saveSnapshot()
      await proxy.setValue('temp1')
      await proxy.restoreSnapshot()
      expect(await proxy.getValue()).toBe('v1')

      // Cycle 2
      await proxy.setValue('v2')
      await proxy.saveSnapshot()
      await proxy.setValue('temp2')
      await proxy.restoreSnapshot()
      expect(await proxy.getValue()).toBe('v2')
    })

    it('should restore from latest snapshot after multiple saves', async () => {
      const proxy: Stateful = stage().actorFor(new StatefulProtocol())

      // Multiple snapshots - only latest should be kept
      await proxy.setValue('v1')
      await proxy.saveSnapshot()

      await proxy.setValue('v2')
      await proxy.saveSnapshot()

      await proxy.setValue('v3')
      await proxy.saveSnapshot()

      // Restore should use latest (v3)
      await proxy.setValue('current')
      await proxy.restoreSnapshot()
      expect(await proxy.getValue()).toBe('v3')
    })
  })
})
