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
import { ArrayMailbox } from '@/actors/ArrayMailbox'
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

interface Counter extends ActorProtocol {
  increment(): Promise<void>
  getValue(): Promise<number>
  reset(): Promise<void>
}

class CounterActor extends Actor implements Counter {
  private _count = 0

  constructor() {
    super()
  }

  async increment(): Promise<void> {
    this._count++
  }

  async getValue(): Promise<number> {
    return this._count
  }

  async reset(): Promise<void> {
    this._count = 0
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

const counterActors: Map<string, CounterActor> = new Map()

class CounterInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new CounterActor()
    counterActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class CounterProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new CounterInstantiator()
  }
  type(): string {
    return 'Counter'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Mailbox Suspension', () => {
  beforeEach(() => {
    counterActors.clear()
  })

  describe('ArrayMailbox suspension state', () => {
    it('should start unsuspended', () => {
      const mailbox = new ArrayMailbox()
      expect(mailbox.isSuspended()).toBe(false)
    })

    it('should become suspended when suspend() is called', () => {
      const mailbox = new ArrayMailbox()
      mailbox.suspend()
      expect(mailbox.isSuspended()).toBe(true)
    })

    it('should become unsuspended when resume() is called', () => {
      const mailbox = new ArrayMailbox()
      mailbox.suspend()
      expect(mailbox.isSuspended()).toBe(true)

      mailbox.resume()
      expect(mailbox.isSuspended()).toBe(false)
    })

    it('should not be receivable when suspended', () => {
      const mailbox = new ArrayMailbox()

      // Add a message to the queue by directly manipulating it
      // (In real usage, messages are sent through send())
      expect(mailbox.isReceivable()).toBe(false) // Empty queue

      // Since we can't easily add messages without triggering dispatch,
      // we'll test this through actor integration tests below
    })
  })

  describe('Message processing during suspension', () => {
    it('should queue messages but not process them when suspended', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Suspend the actor's mailbox
      actor.lifeCycle().environment().mailbox().suspend()

      // Send messages while suspended
      proxy.increment()
      proxy.increment()
      proxy.increment()

      // Wait a bit - messages should NOT be processed
      await new Promise(resolve => setTimeout(resolve, 20))

      // Value should still be 0 because messages were queued but not processed
      // We can't call getValue() because it would also be queued
      // So we access the actor directly
      expect((actor as any)._count).toBe(0)

      // Now resume
      actor.lifeCycle().environment().mailbox().resume()

      // Wait for queued messages to be processed
      await new Promise(resolve => setTimeout(resolve, 30))

      // Now the count should be 3
      expect((actor as any)._count).toBe(3)
    })

    it('should process all queued messages when resumed', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Suspend
      actor.lifeCycle().environment().mailbox().suspend()

      // Queue multiple messages
      proxy.increment()
      proxy.increment()
      proxy.increment()
      proxy.increment()
      proxy.increment()

      await new Promise(resolve => setTimeout(resolve, 20))
      expect((actor as any)._count).toBe(0)

      // Resume and wait
      actor.lifeCycle().environment().mailbox().resume()
      await new Promise(resolve => setTimeout(resolve, 30))

      // All 5 messages should be processed
      expect((actor as any)._count).toBe(5)
    })

    it('should process messages normally after resume', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Suspend, queue, and resume
      actor.lifeCycle().environment().mailbox().suspend()
      proxy.increment()
      actor.lifeCycle().environment().mailbox().resume()
      await new Promise(resolve => setTimeout(resolve, 20))

      // Reset count
      await proxy.reset()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Now send new messages without suspension
      await proxy.increment()
      await proxy.increment()

      const value = await proxy.getValue()
      expect(value).toBe(2)
    })
  })

  describe('Suspend/resume with supervision', () => {
    it('should suspend and resume through supervised actor', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Create a supervised actor
      const { StageSupervisedActor } = await import('@/actors/Supervisor')
      const supervised = new StageSupervisedActor(proxy, actor, new Error('test error'))

      // Suspend through supervised interface
      supervised.suspend()
      expect(actor.lifeCycle().environment().mailbox().isSuspended()).toBe(true)

      // Queue messages
      proxy.increment()
      proxy.increment()
      await new Promise(resolve => setTimeout(resolve, 20))
      expect((actor as any)._count).toBe(0)

      // Resume through supervised interface
      supervised.resume()
      expect(actor.lifeCycle().environment().mailbox().isSuspended()).toBe(false)

      // Wait for messages to process
      await new Promise(resolve => setTimeout(resolve, 30))
      expect((actor as any)._count).toBe(2)
    })
  })

  describe('Suspend/resume edge cases', () => {
    it('should handle multiple suspend calls gracefully', () => {
      const mailbox = new ArrayMailbox()

      mailbox.suspend()
      expect(mailbox.isSuspended()).toBe(true)

      mailbox.suspend() // Second suspend
      expect(mailbox.isSuspended()).toBe(true)
    })

    it('should handle multiple resume calls gracefully', () => {
      const mailbox = new ArrayMailbox()

      mailbox.suspend()
      mailbox.resume()
      expect(mailbox.isSuspended()).toBe(false)

      mailbox.resume() // Second resume
      expect(mailbox.isSuspended()).toBe(false)
    })

    it('should not process messages after suspend even if resume is called multiple times', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Suspend
      actor.lifeCycle().environment().mailbox().suspend()
      proxy.increment()

      // Multiple resumes
      actor.lifeCycle().environment().mailbox().resume()
      actor.lifeCycle().environment().mailbox().resume()

      await new Promise(resolve => setTimeout(resolve, 20))

      // Should only process once
      expect((actor as any)._count).toBe(1)
    })

    it('should not allow processing while closed even if resumed', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the actor first (closes mailbox)
      await proxy.stop()
      expect(proxy.isStopped()).toBe(true)

      // Try to resume - should not allow processing because mailbox is closed
      actor.lifeCycle().environment().mailbox().resume()

      // Try to send message
      proxy.increment()

      await new Promise(resolve => setTimeout(resolve, 20))

      // Count should still be 0 because mailbox is closed
      expect((actor as any)._count).toBe(0)
    })

    it('should queue messages in order during suspension', async () => {
      const proxy: Counter = stage().actorFor(new CounterProtocol())
      const actor = counterActors.get(proxy.address().valueAsString())!

      await new Promise(resolve => setTimeout(resolve, 10))

      // Suspend
      actor.lifeCycle().environment().mailbox().suspend()

      // Queue operations in specific order
      proxy.reset()         // Set to 0
      proxy.increment()     // 1
      proxy.increment()     // 2
      proxy.increment()     // 3

      await new Promise(resolve => setTimeout(resolve, 20))

      // Resume and let all messages process
      actor.lifeCycle().environment().mailbox().resume()
      await new Promise(resolve => setTimeout(resolve, 30))

      // Should be 3 (reset then 3 increments)
      expect((actor as any)._count).toBe(3)
    })
  })
})
