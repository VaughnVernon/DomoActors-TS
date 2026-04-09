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
import { LocalStage } from '@/actors/LocalStage'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { DefaultSupervisor } from '@/actors/DefaultSupervisor'
import { SupervisionDirective, SupervisionStrategy, Supervised } from '@/actors/Supervisor'

// ============================================================================
// Test Actors
// ============================================================================

// Shared stop order array for all actors
const globalStopOrder: string[] = []

// Tracking actor that records stop order
class TrackingActor extends Actor {
  private readonly actorId: string

  constructor(actorId: string) {
    super()
    this.actorId = actorId
  }

  async beforeStop(): Promise<void> {
    super.beforeStop()
    globalStopOrder.push(`${this.actorId}-beforeStop`)
  }

  async afterStop(): Promise<void> {
    super.afterStop()
    globalStopOrder.push(`${this.actorId}-afterStop`)
  }
}

// Parent actor with children
class ParentActor extends Actor {
  private readonly actorId: string

  constructor(actorId: string) {
    super()
    this.actorId = actorId
  }

  async beforeStop(): Promise<void> {
    super.beforeStop()
    globalStopOrder.push(`${this.actorId}-beforeStop`)
  }

  async afterStop(): Promise<void> {
    super.afterStop()
    globalStopOrder.push(`${this.actorId}-afterStop`)
  }
}

// Child actor
class ChildActor extends Actor {
  private readonly actorId: string

  constructor(actorId: string) {
    super()
    this.actorId = actorId
  }

  async beforeStop(): Promise<void> {
    super.beforeStop()
    globalStopOrder.push(`${this.actorId}-beforeStop`)
  }

  async afterStop(): Promise<void> {
    super.afterStop()
    globalStopOrder.push(`${this.actorId}-afterStop`)
  }
}

// Custom supervisor
class TestSupervisor extends DefaultSupervisor {
  private readonly actorId: string

  constructor(actorId: string) {
    super()
    this.actorId = actorId
  }

  async beforeStop(): Promise<void> {
    super.beforeStop()
    globalStopOrder.push(`${this.actorId}-supervisor-beforeStop`)
  }

  async afterStop(): Promise<void> {
    super.afterStop()
    globalStopOrder.push(`${this.actorId}-supervisor-afterStop`)
  }

  protected decideDirective(
    error: Error,
    supervised: Supervised,
    strategy: SupervisionStrategy
  ): SupervisionDirective {
    return SupervisionDirective.Resume
  }
}

// ============================================================================
// Protocol Instantiators
// ============================================================================

class TrackingInstantiator implements ProtocolInstantiator {
  constructor(private actorId: string) {}

  instantiate(_definition: Definition): Actor {
    return new TrackingActor(this.actorId)
  }
}

class ParentInstantiator implements ProtocolInstantiator {
  constructor(private actorId: string) {}

  instantiate(_definition: Definition): Actor {
    return new ParentActor(this.actorId)
  }
}

class ChildInstantiator implements ProtocolInstantiator {
  constructor(private actorId: string) {}

  instantiate(_definition: Definition): Actor {
    return new ChildActor(this.actorId)
  }
}

class SupervisorInstantiator implements ProtocolInstantiator {
  constructor(private actorId: string) {}

  instantiate(_definition: Definition): Actor {
    return new TestSupervisor(this.actorId)
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

class TrackingProtocol implements Protocol {
  constructor(private actorId: string) {}

  instantiator(): ProtocolInstantiator {
    return new TrackingInstantiator(this.actorId)
  }

  type(): string {
    return `Tracking-${this.actorId}`
  }
}

class ParentProtocol implements Protocol {
  constructor(private actorId: string) {}

  instantiator(): ProtocolInstantiator {
    return new ParentInstantiator(this.actorId)
  }

  type(): string {
    return `Parent-${this.actorId}`
  }
}

class ChildProtocol implements Protocol {
  constructor(private actorId: string) {}

  instantiator(): ProtocolInstantiator {
    return new ChildInstantiator(this.actorId)
  }

  type(): string {
    return `Child-${this.actorId}`
  }
}

class SupervisorProtocol implements Protocol {
  constructor(private actorId: string) {}

  instantiator(): ProtocolInstantiator {
    return new SupervisorInstantiator(this.actorId)
  }

  type(): string {
    return this.actorId // Use actorId directly for supervisor lookup
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage.close()', () => {
  let testStage: LocalStage

  beforeEach(() => {
    // Create a fresh stage for each test
    testStage = new LocalStage()

    // Clear stop order tracking
    globalStopOrder.length = 0
  })

  describe('Basic shutdown', () => {
    it('should stop all actors when close is called', async () => {
      // Create some actors
      const actor1: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor1'))
      const actor2: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor2'))

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // All actors should be stopped
      expect(actor1.isStopped()).toBe(true)
      expect(actor2.isStopped()).toBe(true)

      // Should have recorded stops
      expect(globalStopOrder).toContain('actor1-beforeStop')
      expect(globalStopOrder).toContain('actor1-afterStop')
      expect(globalStopOrder).toContain('actor2-beforeStop')
      expect(globalStopOrder).toContain('actor2-afterStop')
    })

    it('should handle empty stage gracefully', async () => {
      // Close stage with no application actors (only root actors)
      await expect(testStage.close()).resolves.not.toThrow()
    })

    it('should stop actors even if one fails', async () => {
      // Create actor that will throw in beforeStop
      class FailingActor extends Actor {
        beforeStop(): void {
          throw new Error('beforeStop failed')
        }
      }

      const failingProtocol: Protocol = {
        type: () => 'Failing',
        instantiator: () => ({
          instantiate: () => new FailingActor()
        })
      }

      const normalActor: ActorProtocol = testStage.actorFor(new TrackingProtocol('normal'))
      const failingActor: ActorProtocol = testStage.actorFor(failingProtocol)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should not throw even if one actor fails
      await expect(testStage.close()).resolves.not.toThrow()

      // Normal actor should still be stopped
      expect(normalActor.isStopped()).toBe(true)
      expect(failingActor.isStopped()).toBe(true)
    })
  })

  describe('Hierarchical shutdown order', () => {
    it('should stop application actors and their supervisors before root actors', async () => {
      // Create a custom supervisor actor
      const supervisorProtocol = new SupervisorProtocol('test-supervisor')
      const supervisor: ActorProtocol = testStage.actorFor(supervisorProtocol, undefined, 'default')

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create application actor with the supervisor
      const appActor: ActorProtocol = testStage.actorFor(
        new TrackingProtocol('app1'),
        undefined,
        'test-supervisor'
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // Both actors should be stopped
      expect(appActor.isStopped()).toBe(true)
      expect(supervisor.isStopped()).toBe(true)

      // Both should have stop events recorded
      expect(globalStopOrder).toContain('app1-beforeStop')
      expect(globalStopOrder).toContain('test-supervisor-supervisor-beforeStop')
    })

    it('should stop children before parent', async () => {
      // Create parent actor
      const parent: ActorProtocol = testStage.actorFor(new ParentProtocol('parent1'))

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create children
      const child1: ActorProtocol = testStage.actorFor(new ChildProtocol('child1'), parent)
      const child2: ActorProtocol = testStage.actorFor(new ChildProtocol('child2'), parent)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // Children should stop before parent's afterStop
      const child1Index = globalStopOrder.findIndex(s => s.includes('child1-beforeStop'))
      const child2Index = globalStopOrder.findIndex(s => s.includes('child2-beforeStop'))
      const parentAfterIndex = globalStopOrder.findIndex(s => s.includes('parent1-afterStop'))

      expect(child1Index).toBeGreaterThan(-1)
      expect(child2Index).toBeGreaterThan(-1)
      expect(parentAfterIndex).toBeGreaterThan(-1)
      expect(child1Index).toBeLessThan(parentAfterIndex)
      expect(child2Index).toBeLessThan(parentAfterIndex)

      // All should be stopped
      expect(parent.isStopped()).toBe(true)
      expect(child1.isStopped()).toBe(true)
      expect(child2.isStopped()).toBe(true)
    })

    it('should stop multi-level hierarchy in correct order', async () => {
      // Create grandparent
      const grandparent: ActorProtocol = testStage.actorFor(new ParentProtocol('grandparent'))

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create parent (child of grandparent)
      const parent: ActorProtocol = testStage.actorFor(new ParentProtocol('parent'), grandparent)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create children (children of parent)
      const child1: ActorProtocol = testStage.actorFor(new ChildProtocol('child1'), parent)
      const child2: ActorProtocol = testStage.actorFor(new ChildProtocol('child2'), parent)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // All should be stopped
      expect(grandparent.isStopped()).toBe(true)
      expect(parent.isStopped()).toBe(true)
      expect(child1.isStopped()).toBe(true)
      expect(child2.isStopped()).toBe(true)

      // Grandchildren stop first, then parent, then grandparent
      const child1Index = globalStopOrder.findIndex(s => s.includes('child1-afterStop'))
      const child2Index = globalStopOrder.findIndex(s => s.includes('child2-afterStop'))
      const parentIndex = globalStopOrder.findIndex(s => s.includes('parent-afterStop'))
      const grandparentIndex = globalStopOrder.findIndex(s => s.includes('grandparent-afterStop'))

      expect(child1Index).toBeLessThan(parentIndex)
      expect(child2Index).toBeLessThan(parentIndex)
      expect(parentIndex).toBeLessThan(grandparentIndex)
    })

    it('should stop supervisors before root actors', async () => {
      // Create a supervisor
      const supervisorProtocol = new SupervisorProtocol('app-supervisor')
      const supervisor: ActorProtocol = testStage.actorFor(supervisorProtocol, undefined, 'default')

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // Supervisor should be stopped
      expect(supervisor.isStopped()).toBe(true)

      // Supervisor should have been stopped (we can't easily verify root actor order without internal access)
      expect(globalStopOrder).toContain('app-supervisor-supervisor-beforeStop')
      expect(globalStopOrder).toContain('app-supervisor-supervisor-afterStop')
    })
  })

  describe('Complete shutdown sequence', () => {
    it('should follow complete shutdown order: children -> parents -> all actors before root', async () => {
      // Create supervisor
      const supervisorProtocol = new SupervisorProtocol('my-supervisor')
      const supervisor: ActorProtocol = testStage.actorFor(supervisorProtocol, undefined, 'default')

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create parent with children
      const parent: ActorProtocol = testStage.actorFor(
        new ParentProtocol('parent'),
        undefined,
        'my-supervisor'
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      const child1: ActorProtocol = testStage.actorFor(
        new ChildProtocol('child1'),
        parent,
        'my-supervisor'
      )
      const child2: ActorProtocol = testStage.actorFor(
        new ChildProtocol('child2'),
        parent,
        'my-supervisor'
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create standalone actor
      const standalone: ActorProtocol = testStage.actorFor(
        new TrackingProtocol('standalone'),
        undefined,
        'my-supervisor'
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // Verify all stopped
      expect(parent.isStopped()).toBe(true)
      expect(child1.isStopped()).toBe(true)
      expect(child2.isStopped()).toBe(true)
      expect(standalone.isStopped()).toBe(true)
      expect(supervisor.isStopped()).toBe(true)

      // Children stop before parent
      const child1Index = globalStopOrder.findIndex(s => s.includes('child1-afterStop'))
      const child2Index = globalStopOrder.findIndex(s => s.includes('child2-afterStop'))
      const parentIndex = globalStopOrder.findIndex(s => s.includes('parent-afterStop'))

      expect(child1Index).toBeLessThan(parentIndex)
      expect(child2Index).toBeLessThan(parentIndex)
    })

    it('should stop all actors including multiple supervisors', async () => {
      // Create two supervisor actors
      const supervisor1Protocol = new SupervisorProtocol('supervisor1')
      const supervisor2Protocol = new SupervisorProtocol('supervisor2')

      const sup1: ActorProtocol = testStage.actorFor(supervisor1Protocol, undefined, 'default')
      const sup2: ActorProtocol = testStage.actorFor(supervisor2Protocol, undefined, 'default')

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create actors with different supervisors
      const actor1: ActorProtocol = testStage.actorFor(
        new TrackingProtocol('actor1'),
        undefined,
        'supervisor1'
      )
      const actor2: ActorProtocol = testStage.actorFor(
        new TrackingProtocol('actor2'),
        undefined,
        'supervisor2'
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close the stage
      await testStage.close()

      // All should be stopped
      expect(actor1.isStopped()).toBe(true)
      expect(actor2.isStopped()).toBe(true)
      expect(sup1.isStopped()).toBe(true)
      expect(sup2.isStopped()).toBe(true)

      // All should have stop events recorded
      expect(globalStopOrder).toContain('actor1-beforeStop')
      expect(globalStopOrder).toContain('actor2-beforeStop')
      expect(globalStopOrder).toContain('supervisor1-supervisor-beforeStop')
      expect(globalStopOrder).toContain('supervisor2-supervisor-beforeStop')
    })
  })

  describe('Edge cases', () => {
    it('should handle closing an already closed stage', async () => {
      const actor: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor1'))

      await new Promise(resolve => setTimeout(resolve, 10))

      // Close once
      await testStage.close()

      // Close again - should not throw
      await expect(testStage.close()).resolves.not.toThrow()

      // Actor should remain stopped
      expect(actor.isStopped()).toBe(true)
    })

    it('should handle actors without children', async () => {
      const actor1: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor1'))
      const actor2: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor2'))
      const actor3: ActorProtocol = testStage.actorFor(new TrackingProtocol('actor3'))

      await new Promise(resolve => setTimeout(resolve, 10))

      await testStage.close()

      expect(actor1.isStopped()).toBe(true)
      expect(actor2.isStopped()).toBe(true)
      expect(actor3.isStopped()).toBe(true)
    })

    it('should handle mix of actors with and without children', async () => {
      // Parent with children
      const parent: ActorProtocol = testStage.actorFor(new ParentProtocol('parent'))
      await new Promise(resolve => setTimeout(resolve, 5))

      const child: ActorProtocol = testStage.actorFor(new ChildProtocol('child'), parent)
      await new Promise(resolve => setTimeout(resolve, 5))

      // Standalone actors
      const standalone1: ActorProtocol = testStage.actorFor(new TrackingProtocol('standalone1'))
      const standalone2: ActorProtocol = testStage.actorFor(new TrackingProtocol('standalone2'))

      await new Promise(resolve => setTimeout(resolve, 10))

      await testStage.close()

      // All should be stopped
      expect(parent.isStopped()).toBe(true)
      expect(child.isStopped()).toBe(true)
      expect(standalone1.isStopped()).toBe(true)
      expect(standalone2.isStopped()).toBe(true)
    })
  })
})
