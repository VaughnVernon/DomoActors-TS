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
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'

// ============================================================================
// Test Actors
// ============================================================================

interface SimpleActor extends ActorProtocol {
  doWork(): Promise<string>
  getParentAddress(): Promise<string>
  fail(): Promise<void>
}

class SimpleActorImpl extends Actor implements SimpleActor {
  private _failCount: number = 0

  constructor() {
    super()
  }

  async doWork(): Promise<string> {
    return 'work done'
  }

  async getParentAddress(): Promise<string> {
    return this.parent() ? this.parent().address().valueAsString() : 'no parent'
  }

  async fail(): Promise<void> {
    this._failCount++
    throw new Error(`Intentional failure ${this._failCount}`)
  }

  beforeRestart(reason: Error): void {
    super.beforeRestart(reason)
    this.logger().log(`SimpleActor restarting after: ${reason.message}`)
  }

  afterRestart(reason: Error): void {
    super.afterRestart(reason)
    this.logger().log(`SimpleActor restarted after: ${reason.message}`)
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

class SimpleActorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new SimpleActorImpl()
  }
}

class SimpleActorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SimpleActorInstantiator()
  }
  type(): string {
    return 'SimpleActor'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Root Actors (Guardian Actors)', () => {
  // Wait a bit for root actors to initialize
  beforeEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  describe('Root actor hierarchy', () => {
    it('should initialize PrivateRootActor and PublicRootActor on first use', async () => {
      // Create a user actor to trigger root actor initialization
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      // User actor should be functional
      const result = await actor.doWork()
      expect(result).toBe('work done')
    })

    it('should use PublicRootActor as default parent for user actors', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 100))

      const parentAddress = await actor.getParentAddress()
      // Parent should be PublicRootActor (not "no parent")
      expect(parentAddress).not.toBe('no parent')
    })

    it('should allow actors to be created without explicit parent', async () => {
      // Create multiple actors without specifying parent
      const actor1: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const actor2: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const actor3: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // All should have the same parent (PublicRootActor)
      const parent1 = await actor1.getParentAddress()
      const parent2 = await actor2.getParentAddress()
      const parent3 = await actor3.getParentAddress()

      expect(parent1).toBe(parent2)
      expect(parent2).toBe(parent3)
      expect(parent1).not.toBe('no parent')
    })
  })

  describe('PublicRootActor supervision - restart forever', () => {
    it('should restart failing child actors', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // Trigger a failure
      actor.fail().catch(() => {}) // Ignore rejection

      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 100))

      // Actor should still be functional after restart
      const result = await actor.doWork()
      expect(result).toBe('work done')
    })

    it('should restart actors multiple times (forever strategy)', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // Trigger multiple failures
      actor.fail().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 50))

      actor.fail().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 50))

      actor.fail().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 50))

      // Actor should still be functional after multiple restarts
      const result = await actor.doWork()
      expect(result).toBe('work done')
    })

    it('should continue normal operation after restart', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // Do work before failure
      const before = await actor.doWork()
      expect(before).toBe('work done')

      // Trigger failure
      actor.fail().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 100))

      // Do work after restart
      const after = await actor.doWork()
      expect(after).toBe('work done')
    })
  })

  describe('Bulkhead pattern', () => {
    it('should isolate failing actors from the system', async () => {
      const actor1: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const actor2: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // Fail actor1
      actor1.fail().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 100))

      // actor2 should still work normally (not affected by actor1's failure)
      const result = await actor2.doWork()
      expect(result).toBe('work done')

      // actor1 should also work after restart
      const result1 = await actor1.doWork()
      expect(result1).toBe('work done')
    })

    it('should prevent cascading failures', async () => {
      // Create multiple actors
      const actors: SimpleActor[] = []
      for (let i = 0; i < 5; i++) {
        actors.push(stage().actorFor(new SimpleActorProtocol()))
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      // Fail the first two actors
      actors[0].fail().catch(() => {})
      actors[1].fail().catch(() => {})

      await new Promise(resolve => setTimeout(resolve, 150))

      // All actors should still be functional
      const results = await Promise.all(actors.map(a => a.doWork()))
      results.forEach(result => {
        expect(result).toBe('work done')
      })
    })
  })

  describe('Actor hierarchy with root actors', () => {
    it('should support parent-child relationships with PublicRootActor as ancestor', async () => {
      const parent: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      const child: SimpleActor = stage().actorFor(new SimpleActorProtocol(), parent)

      await new Promise(resolve => setTimeout(resolve, 50))

      // Child should have parent address (not PublicRootActor)
      const childParentAddress = await child.getParentAddress()
      const parentAddress = parent.address().valueAsString()

      expect(childParentAddress).toBe(parentAddress)

      // But parent should have PublicRootActor as its parent
      const parentParentAddress = await parent.getParentAddress()
      expect(parentParentAddress).not.toBe('no parent')
      expect(parentParentAddress).not.toBe(parentAddress)
    })

    it('should maintain actor hierarchy integrity', async () => {
      const grandparent: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      await new Promise(resolve => setTimeout(resolve, 30))

      const parent: SimpleActor = stage().actorFor(new SimpleActorProtocol(), grandparent)
      await new Promise(resolve => setTimeout(resolve, 30))

      const child: SimpleActor = stage().actorFor(new SimpleActorProtocol(), parent)
      await new Promise(resolve => setTimeout(resolve, 30))

      // Verify hierarchy
      const childParent = await child.getParentAddress()
      const parentParent = await parent.getParentAddress()
      const grandparentParent = await grandparent.getParentAddress()

      expect(childParent).toBe(parent.address().valueAsString())
      expect(parentParent).toBe(grandparent.address().valueAsString())
      expect(grandparentParent).not.toBe('no parent') // Should be PublicRootActor
    })
  })

  describe('System stability', () => {
    it('should remain stable with multiple concurrent actor creations', async () => {
      // Create many actors concurrently
      const promises: Promise<SimpleActor>[] = []
      for (let i = 0; i < 20; i++) {
        promises.push(Promise.resolve(stage().actorFor(new SimpleActorProtocol())))
      }

      const actors = await Promise.all(promises)

      await new Promise(resolve => setTimeout(resolve, 100))

      // All actors should be functional
      const results = await Promise.all(actors.slice(0, 10).map(a => a.doWork()))
      results.forEach(result => {
        expect(result).toBe('work done')
      })
    })

    it('should handle rapid failure and recovery', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      await new Promise(resolve => setTimeout(resolve, 50))

      // Rapid failures
      for (let i = 0; i < 5; i++) {
        actor.fail().catch(() => {})
        await new Promise(resolve => setTimeout(resolve, 20))
      }

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should still work
      const result = await actor.doWork()
      expect(result).toBe('work done')
    })

    it('should maintain system integrity under stress', async () => {
      // Create actors and cause some to fail
      const actors: SimpleActor[] = []
      for (let i = 0; i < 10; i++) {
        actors.push(stage().actorFor(new SimpleActorProtocol()))
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      // Cause half to fail
      for (let i = 0; i < 5; i++) {
        actors[i].fail().catch(() => {})
      }

      await new Promise(resolve => setTimeout(resolve, 150))

      // All should still be functional
      const results = await Promise.all(actors.map(a => a.doWork()))
      results.forEach(result => {
        expect(result).toBe('work done')
      })
    })
  })
})
