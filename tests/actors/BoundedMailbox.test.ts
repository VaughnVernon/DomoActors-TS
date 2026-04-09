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
import { BoundedMailbox } from '@/actors/BoundedMailbox'
import { Definition } from '@/actors/Definition'
import { DeadLetter, DeadLettersListener } from '@/actors/DeadLetters'
import { OverflowPolicy } from '@/actors/OverflowPolicy'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'

// ============================================================================
// Test Actors
// ============================================================================

interface SlowActor extends ActorProtocol {
  processMessage(value: number): Promise<void>
  getProcessedCount(): Promise<number>
  getProcessedValues(): Promise<number[]>
}

class SlowActorImpl extends Actor implements SlowActor {
  private _processedCount: number = 0
  private _processedValues: number[] = []

  constructor() {
    super()
  }

  async processMessage(value: number): Promise<void> {
    // Slow processing to allow queue to build up
    await new Promise(resolve => setTimeout(resolve, 50))
    this._processedCount++
    this._processedValues.push(value)
  }

  async getProcessedCount(): Promise<number> {
    return this._processedCount
  }

  async getProcessedValues(): Promise<number[]> {
    return [...this._processedValues]
  }
}

class SlowActorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new SlowActorImpl()
  }
}

class SlowActorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SlowActorInstantiator()
  }
  type(): string {
    return 'SlowActor'
  }
}

// Test listener for dead letters
class TestDeadLettersListener implements DeadLettersListener {
  private _deadLetters: DeadLetter[] = []

  handle(deadLetter: DeadLetter): void {
    this._deadLetters.push(deadLetter)
  }

  count(): number {
    return this._deadLetters.length
  }

  clear(): void {
    this._deadLetters = []
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('BoundedMailbox', () => {
  describe('Constructor and basic properties', () => {
    it('should create mailbox with specified capacity', () => {
      const mailbox = new BoundedMailbox(100, OverflowPolicy.DropOldest)

      expect(mailbox.getCapacity()).toBe(100)
      expect(mailbox.size()).toBe(0)
      expect(mailbox.isFull()).toBe(false)
      expect(mailbox.droppedMessageCount()).toBe(0)
    })

    it('should throw error for non-positive capacity', () => {
      expect(() => new BoundedMailbox(0, OverflowPolicy.DropOldest))
        .toThrow('Mailbox capacity must be positive')

      expect(() => new BoundedMailbox(-1, OverflowPolicy.DropOldest))
        .toThrow('Mailbox capacity must be positive')
    })

    it('should create mailbox with capacity of 1', () => {
      const mailbox = new BoundedMailbox(1, OverflowPolicy.DropOldest)
      expect(mailbox.getCapacity()).toBe(1)
    })
  })

  describe('DropOldest policy', () => {
    it('should process messages normally when under capacity', async () => {
      const mailbox = new BoundedMailbox(10, OverflowPolicy.DropOldest)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Send 3 messages (under capacity of 10)
      actor.processMessage(1)
      actor.processMessage(2)
      actor.processMessage(3)

      await new Promise(resolve => setTimeout(resolve, 200))

      const count = await actor.getProcessedCount()
      const values = await actor.getProcessedValues()

      expect(count).toBe(3)
      expect(values).toEqual([1, 2, 3])
      expect(mailbox.droppedMessageCount()).toBe(0)
    })

    it('should drop oldest messages when at capacity', async () => {
      const mailbox = new BoundedMailbox(3, OverflowPolicy.DropOldest)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend to prevent processing while we fill queue
      mailbox.suspend()

      // Send 5 messages while suspended - they will queue up
      actor.processMessage(1)
      actor.processMessage(2)
      actor.processMessage(3)
      actor.processMessage(4)
      actor.processMessage(5)

      // At this point, queue should have [3, 4, 5] with messages 1 and 2 dropped
      expect(mailbox.droppedMessageCount()).toBe(2)

      // Now resume and let them process
      mailbox.resume()

      // Wait for all to be processed
      await new Promise(resolve => setTimeout(resolve, 200))

      const values = await actor.getProcessedValues()

      // Should have processed the last 3 messages
      expect(values).toEqual([3, 4, 5])
      expect(mailbox.droppedMessageCount()).toBe(2)
    })

    it('should track dropped message count accurately', async () => {
      const mailbox = new BoundedMailbox(2, OverflowPolicy.DropOldest)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend to fill queue
      mailbox.suspend()

      // Send 10 messages rapidly
      for (let i = 1; i <= 10; i++) {
        actor.processMessage(i)
      }

      // Should have dropped 8 messages (keeping last 2)
      expect(mailbox.droppedMessageCount()).toBe(8)

      mailbox.resume()

      await new Promise(resolve => setTimeout(resolve, 150))

      // Still should be 8 after processing
      expect(mailbox.droppedMessageCount()).toBe(8)
    })
  })

  describe('DropNewest policy', () => {
    it('should drop incoming messages when at capacity', async () => {
      const mailbox = new BoundedMailbox(3, OverflowPolicy.DropNewest)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend to fill queue
      mailbox.suspend()

      // Send 5 messages rapidly
      actor.processMessage(1)
      actor.processMessage(2)
      actor.processMessage(3)
      actor.processMessage(4)
      actor.processMessage(5)

      // Should have dropped newest 2 messages
      expect(mailbox.droppedMessageCount()).toBe(2)

      mailbox.resume()

      await new Promise(resolve => setTimeout(resolve, 200))

      const values = await actor.getProcessedValues()

      // Should process first 3 messages
      expect(values).toEqual([1, 2, 3])
      expect(mailbox.droppedMessageCount()).toBe(2)
    })
  })

  describe('Reject policy', () => {
    it('should send overflow messages to dead letters', async () => {
      const mailbox = new BoundedMailbox(3, OverflowPolicy.Reject)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      const listener = new TestDeadLettersListener()
      stage().deadLetters().registerListener(listener)

      // Suspend to fill queue
      mailbox.suspend()

      // Send 5 messages rapidly
      actor.processMessage(1)
      actor.processMessage(2)
      actor.processMessage(3)
      actor.processMessage(4)
      actor.processMessage(5)

      // Should have rejected 2 messages
      expect(mailbox.droppedMessageCount()).toBe(2)
      expect(listener.count()).toBeGreaterThanOrEqual(2)

      mailbox.resume()

      await new Promise(resolve => setTimeout(resolve, 200))

      const values = await actor.getProcessedValues()

      // Should process first 3
      expect(values).toEqual([1, 2, 3])
      expect(mailbox.droppedMessageCount()).toBe(2)

      // Should have dead letters for overflow
      expect(listener.count()).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Suspension and resumption', () => {
    it('should queue messages when suspended and process on resume', async () => {
      const mailbox = new BoundedMailbox(10, OverflowPolicy.DropOldest)
      const actor: SlowActor = stage().actorFor(
        new SlowActorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend the mailbox
      mailbox.suspend()
      expect(mailbox.isSuspended()).toBe(true)

      // Send messages while suspended
      actor.processMessage(1)
      actor.processMessage(2)
      actor.processMessage(3)

      await new Promise(resolve => setTimeout(resolve, 100))

      // Messages should be queued but not processed yet
      // Can't call actor methods while suspended as those are also messages
      expect(mailbox.size()).toBe(3)

      // Resume processing
      mailbox.resume()
      expect(mailbox.isSuspended()).toBe(false)

      await new Promise(resolve => setTimeout(resolve, 200))

      // Now messages should be processed
      const count = await actor.getProcessedCount()
      expect(count).toBe(3)
      const values = await actor.getProcessedValues()
      expect(values).toEqual([1, 2, 3])
    })
  })

  describe('Integration with default mailbox', () => {
    it('should use ArrayMailbox by default when no mailbox specified', async () => {
      // Create actor without specifying mailbox
      const actor: SlowActor = stage().actorFor(new SlowActorProtocol())

      // Should work normally with unbounded mailbox
      for (let i = 1; i <= 50; i++) {
        actor.processMessage(i)
      }

      await new Promise(resolve => setTimeout(resolve, 2600))

      const count = await actor.getProcessedCount()
      expect(count).toBe(50)
    }, 15000)
  })
})
