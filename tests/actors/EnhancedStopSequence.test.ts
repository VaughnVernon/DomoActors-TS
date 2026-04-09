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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Actor } from '@/actors/Actor'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { INTERNAL_ENVIRONMENT_ACCESS, InternalActorAccess } from '@/actors/InternalAccess'

// ============================================================================
// Test Helpers
// ============================================================================

// Helper to access environment for testing purposes
// In production code, clients should NOT have access to environment()
function getEnvironment(actor: ActorProtocol): any {
  return (actor as any as InternalActorAccess)[INTERNAL_ENVIRONMENT_ACCESS]()
}

// ============================================================================
// Test Actors
// ============================================================================

interface Trackable extends ActorProtocol {
  doSomething(): Promise<void>
}

// Actor that tracks lifecycle hook calls
class TrackingActor extends Actor implements Trackable {
  private _beforeStopCalled = false
  private _afterStopCalled = false
  private _stopOrder: string[] = []

  constructor() {
    super()
  }

  beforeStop(): void {
    super.beforeStop()
    this._beforeStopCalled = true
    this._stopOrder.push('beforeStop')
  }

  afterStop(): void {
    super.afterStop()
    this._afterStopCalled = true
    this._stopOrder.push('afterStop')
  }

  async doSomething(): Promise<void> {
    // No-op
  }

  wasBeforeStopCalled(): boolean {
    return this._beforeStopCalled
  }

  wasAfterStopCalled(): boolean {
    return this._afterStopCalled
  }

  getStopOrder(): string[] {
    return [...this._stopOrder]
  }
}

// Actor that throws error in beforeStop
class BeforeStopErrorActor extends Actor implements Trackable {
  constructor() {
    super()
  }

  beforeStop(): void {
    throw new Error('beforeStop failed intentionally')
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// Actor that takes time to stop (for timeout tests)
class SlowStopActor extends Actor implements Trackable {
  constructor() {
    super()
  }

  async beforeStop(): Promise<void> {
    // Simulate slow cleanup
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// Parent actor that tracks child stop ordering
class ParentActor extends Actor implements Trackable {
  private _stopOrder: string[] = []

  constructor() {
    super()
  }

  beforeStop(): void {
    super.beforeStop()
    this._stopOrder.push('parent-beforeStop')
  }

  afterStop(): void {
    super.afterStop()
    this._stopOrder.push('parent-afterStop')
  }

  async doSomething(): Promise<void> {
    // No-op
  }

  getStopOrder(): string[] {
    return [...this._stopOrder]
  }
}

// Child actor that records when it stops
class ChildActor extends Actor implements Trackable {
  private _parentActor: ParentActor | undefined

  constructor() {
    super()
  }

  setParentActor(parent: ParentActor): void {
    this._parentActor = parent
  }

  beforeStop(): void {
    super.beforeStop()
    if (this._parentActor) {
      this._parentActor.getStopOrder().push(`child-${this.address().valueAsString()}-beforeStop`)
    }
  }

  afterStop(): void {
    super.afterStop()
    if (this._parentActor) {
      this._parentActor.getStopOrder().push(`child-${this.address().valueAsString()}-afterStop`)
    }
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

const trackingActors: Map<string, TrackingActor> = new Map()
const parentActors: Map<string, ParentActor> = new Map()
const childActors: Map<string, ChildActor> = new Map()

class TrackingInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new TrackingActor()
    trackingActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class BeforeStopErrorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new BeforeStopErrorActor()
  }
}

class SlowStopInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new SlowStopActor()
  }
}

class ParentInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new ParentActor()
    parentActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class ChildInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new ChildActor()
    childActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class TrackingProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new TrackingInstantiator()
  }
  type(): string {
    return 'Tracking'
  }
}

class BeforeStopErrorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new BeforeStopErrorInstantiator()
  }
  type(): string {
    return 'BeforeStopError'
  }
}

class SlowStopProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SlowStopInstantiator()
  }
  type(): string {
    return 'SlowStop'
  }
}

class ParentProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new ParentInstantiator()
  }
  type(): string {
    return 'Parent'
  }
}

class ChildProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new ChildInstantiator()
  }
  type(): string {
    return 'Child'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Enhanced Stop Sequence', () => {
  beforeEach(() => {
    trackingActors.clear()
    parentActors.clear()
    childActors.clear()
  })

  describe('beforeStop() lifecycle hook', () => {
    it('should call beforeStop() before closing mailbox', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the actor
      await proxy.stop()

      // beforeStop should have been called
      expect(actor.wasBeforeStopCalled()).toBe(true)
      expect(proxy.isStopped()).toBe(true)
    })

    it('should call beforeStop() before afterStop()', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the actor
      await proxy.stop()

      // Check order
      const stopOrder = actor.getStopOrder()
      expect(stopOrder).toEqual(['beforeStop', 'afterStop'])
    })

    it('should handle errors in beforeStop() gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: Trackable = stage().actorFor(new BeforeStopErrorProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop should complete despite error
      await proxy.stop()
      expect(proxy.isStopped()).toBe(true)

      // Error should have been logged
      const errorCalls = errorSpy.mock.calls.filter(call =>
        call[0]?.includes('beforeStop() failed')
      )
      expect(errorCalls.length).toBeGreaterThan(0)

      errorSpy.mockRestore()
    })

    it('should not prevent stop if beforeStop() throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: Trackable = stage().actorFor(new BeforeStopErrorProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should be able to send messages before stop
      await proxy.doSomething()

      // Stop should work despite beforeStop error
      await proxy.stop()

      // Actor should be stopped
      expect(proxy.isStopped()).toBe(true)

      errorSpy.mockRestore()
    })
  })

  describe('Child actor stopping coordination', () => {
    it('should stop child actors before parent', async () => {
      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())
      const parentActor = parentActors.get(parentProxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create child actors by manually adding them to parent's environment
      const child1Proxy: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)
      const child1Actor = childActors.get(child1Proxy.address().valueAsString())!
      child1Actor.setParentActor(parentActor)

      const child2Proxy: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)
      const child2Actor = childActors.get(child2Proxy.address().valueAsString())!
      child2Actor.setParentActor(parentActor)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the parent
      await parentProxy.stop()

      // Children should be stopped before parent completes afterStop
      expect(child1Proxy.isStopped()).toBe(true)
      expect(child2Proxy.isStopped()).toBe(true)
      expect(parentProxy.isStopped()).toBe(true)

      // Check stop order - children should stop before parent's afterStop
      const stopOrder = parentActor.getStopOrder()
      expect(stopOrder[0]).toBe('parent-beforeStop')
      // Children stop here (order may vary)
      expect(stopOrder[stopOrder.length - 1]).toBe('parent-afterStop')
    })

    it('should continue stopping other children if one fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create children - one that fails, one normal
      const errorChild: Trackable = stage().actorFor(new BeforeStopErrorProtocol(), parentProxy)
      const normalChild: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop parent
      await parentProxy.stop()

      // All should be stopped despite one child failing
      expect(errorChild.isStopped()).toBe(true)
      expect(normalChild.isStopped()).toBe(true)
      expect(parentProxy.isStopped()).toBe(true)

      errorSpy.mockRestore()
    })

    it('should remove child from parent when child stops', async () => {
      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create a child
      const childProxy: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Parent should have one child
      expect(getEnvironment(parentProxy).children().length).toBe(1)

      // Stop the child
      await childProxy.stop()

      // Parent should have zero children now
      expect(getEnvironment(parentProxy).children().length).toBe(0)
    })

    it('should remove all children from parent when they stop', async () => {
      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create three children
      const child1: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)
      const child2: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)
      const child3: Trackable = stage().actorFor(new ChildProtocol(), parentProxy)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Parent should have three children
      expect(getEnvironment(parentProxy).children().length).toBe(3)

      // Stop child2
      await child2.stop()

      // Parent should have two children
      expect(getEnvironment(parentProxy).children().length).toBe(2)

      // Stop child1 and child3
      await child1.stop()
      await child3.stop()

      // Parent should have zero children
      expect(getEnvironment(parentProxy).children().length).toBe(0)
    })

    it('should remove children when parent stops them', async () => {
      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create children
      stage().actorFor(new ChildProtocol(), parentProxy)
      stage().actorFor(new ChildProtocol(), parentProxy)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Parent should have two children
      expect(getEnvironment(parentProxy).children().length).toBe(2)

      // Stop the parent (which stops all children)
      await parentProxy.stop()

      // Parent should have zero children (all removed during stop)
      expect(getEnvironment(parentProxy).children().length).toBe(0)
    })

    it('should handle removing child that does not exist', async () => {
      const parentProxy: Trackable = stage().actorFor(new ParentProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create a child of a different parent
      const otherParentProxy: Trackable = stage().actorFor(new ParentProtocol())
      const childProxy: Trackable = stage().actorFor(new ChildProtocol(), otherParentProxy)

      await new Promise(resolve => setTimeout(resolve, 10))

      // Try to remove child from wrong parent - should not throw
      expect(() => {
        getEnvironment(parentProxy).removeChild(childProxy)
      }).not.toThrow()

      // Original parent should still have the child
      expect(getEnvironment(otherParentProxy).children().length).toBe(1)
    })
  })

  describe('Graceful shutdown with timeout', () => {
    it('should stop normally if within timeout', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop with a generous timeout
      await proxy.stop(1000)

      // Should stop normally
      expect(proxy.isStopped()).toBe(true)
      expect(actor.wasBeforeStopCalled()).toBe(true)
      expect(actor.wasAfterStopCalled()).toBe(true)
    })

    it('should force stop if timeout expires', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: Trackable = stage().actorFor(new SlowStopProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop with short timeout (actor takes 100ms to stop)
      let timeoutOccurred = false
      try {
        await proxy.stop(50)
      } catch (error: any) {
        // Should timeout
        timeoutOccurred = true
        expect(error.message).toContain('timeout')
      }

      // Should have timed out
      expect(timeoutOccurred).toBe(true)

      // Mailbox should be closed (forced)
      expect(proxy.isStopped()).toBe(true)

      // Should have logged timeout error
      const errorCalls = errorSpy.mock.calls.filter(call =>
        call[0]?.includes('timeout')
      )
      expect(errorCalls.length).toBeGreaterThan(0)

      errorSpy.mockRestore()
    })

    it('should not apply timeout if not specified', async () => {
      const proxy: Trackable = stage().actorFor(new SlowStopProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop without timeout - should wait for full completion
      await proxy.stop()

      expect(proxy.isStopped()).toBe(true)
    })

    it('should ignore zero or negative timeout values', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop with zero timeout - should behave like no timeout
      await proxy.stop(0)

      expect(proxy.isStopped()).toBe(true)
      expect(actor.wasBeforeStopCalled()).toBe(true)
      expect(actor.wasAfterStopCalled()).toBe(true)
    })
  })

  describe('Stop sequence integration', () => {
    it('should execute full stop sequence in correct order', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Process some messages
      await proxy.doSomething()
      await proxy.doSomething()

      // Stop the actor
      await proxy.stop()

      // Verify complete sequence
      expect(actor.wasBeforeStopCalled()).toBe(true)
      expect(actor.wasAfterStopCalled()).toBe(true)
      expect(proxy.isStopped()).toBe(true)

      // Verify order
      const stopOrder = actor.getStopOrder()
      expect(stopOrder[0]).toBe('beforeStop')
      expect(stopOrder[1]).toBe('afterStop')
    })

    it('should not process new messages after beforeStop', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the actor
      await proxy.stop()

      // Try to send a message after stop
      proxy.doSomething() // This should go to dead letters

      await new Promise(resolve => setTimeout(resolve, 10))

      // Actor should remain stopped
      expect(proxy.isStopped()).toBe(true)
    })

    it('should handle stop being called multiple times', async () => {
      const proxy: Trackable = stage().actorFor(new TrackingProtocol())
      const actor = trackingActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop multiple times
      await proxy.stop()
      await proxy.stop()
      await proxy.stop()

      // Should only execute stop sequence once
      const stopOrder = actor.getStopOrder()
      expect(stopOrder.length).toBe(2) // beforeStop, afterStop
      expect(stopOrder).toEqual(['beforeStop', 'afterStop'])
    })
  })
})
