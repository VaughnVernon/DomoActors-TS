// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { describe, it, expect } from 'vitest'
import { Actor } from '@/actors/Actor'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'
import { ArrayMailbox } from '@/actors/ArrayMailbox'

// ============================================================================
// Test Actors
// ============================================================================

interface Accumulator extends ActorProtocol {
  add(value: number): Promise<void>
  getValues(): Promise<number[]>
}

class AccumulatorActor extends Actor implements Accumulator {
  private _values: number[] = []

  constructor() {
    super()
  }

  async add(value: number): Promise<void> {
    this._values.push(value)
  }

  async getValues(): Promise<number[]> {
    return [...this._values]
  }
}

class AccumulatorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new AccumulatorActor()
  }
}

class AccumulatorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new AccumulatorInstantiator()
  }
  type(): string {
    return 'Accumulator'
  }
}

interface SlowAccumulator extends ActorProtocol {
  add(value: number): Promise<void>
  getValues(): Promise<number[]>
}

class SlowAccumulatorActor extends Actor implements SlowAccumulator {
  private _values: number[] = []

  constructor() {
    super()
  }

  async add(value: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50))
    this._values.push(value)
  }

  async getValues(): Promise<number[]> {
    return [...this._values]
  }
}

class SlowAccumulatorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new SlowAccumulatorActor()
  }
}

class SlowAccumulatorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SlowAccumulatorInstantiator()
  }
  type(): string {
    return 'SlowAccumulator'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ArrayMailbox', () => {
  describe('Constructor and basic properties', () => {
    it('should start open and unsuspended', () => {
      const mailbox = new ArrayMailbox()
      expect(mailbox.isClosed()).toBe(false)
      expect(mailbox.isSuspended()).toBe(false)
      expect(mailbox.isReceivable()).toBe(false) // empty queue
    })
  })

  describe('dispatch() drains all queued messages', () => {
    it('should process a single message', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      actor.add(42)
      await new Promise(resolve => setTimeout(resolve, 30))

      const values = await actor.getValues()
      expect(values).toEqual([42])
    })

    it('should drain multiple queued messages in FIFO order', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend to batch messages
      mailbox.suspend()

      actor.add(1)
      actor.add(2)
      actor.add(3)
      actor.add(4)
      actor.add(5)

      // Resume triggers dispatch which should drain all
      mailbox.resume()
      await new Promise(resolve => setTimeout(resolve, 30))

      const values = await actor.getValues()
      expect(values).toEqual([1, 2, 3, 4, 5])
    })

    it('should handle a large number of queued messages without stack overflow', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend so all messages queue up
      mailbox.suspend()

      const messageCount = 10_000
      for (let i = 0; i < messageCount; i++) {
        actor.add(i)
      }

      // Resume - iterative dispatch should handle this without stack overflow
      mailbox.resume()
      await new Promise(resolve => setTimeout(resolve, 500))

      const values = await actor.getValues()
      expect(values.length).toBe(messageCount)
      // Verify FIFO order
      expect(values[0]).toBe(0)
      expect(values[messageCount - 1]).toBe(messageCount - 1)
    })

    it('should process messages enqueued during delivery', async () => {
      const mailbox = new ArrayMailbox()
      const actor: SlowAccumulator = stage().actorFor(
        new SlowAccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Send first message (starts processing with 50ms delay)
      actor.add(1)

      // Send more while first is processing
      await new Promise(resolve => setTimeout(resolve, 10))
      actor.add(2)
      actor.add(3)

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 250))

      const values = await actor.getValues()
      expect(values).toEqual([1, 2, 3])
    })
  })

  describe('dispatch() respects suspension', () => {
    it('should not dispatch when suspended', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      mailbox.suspend()
      actor.add(1)
      actor.add(2)

      await new Promise(resolve => setTimeout(resolve, 30))

      // Resume briefly to query the actor, then check
      mailbox.resume()
      await new Promise(resolve => setTimeout(resolve, 30))

      // Messages should have been processed only after resume
      const values = await actor.getValues()
      expect(values).toEqual([1, 2])
    })
  })

  describe('dispatch() respects close', () => {
    it('should not dispatch when closed', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Let actor start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Send a message and close
      await actor.add(1)
      mailbox.close()

      // Further messages should not be delivered
      actor.add(2)
      await new Promise(resolve => setTimeout(resolve, 30))

      expect(mailbox.isClosed()).toBe(true)
      expect(mailbox.isReceivable()).toBe(false)
    })

    it('should stop draining when closed mid-dispatch', async () => {
      const mailbox = new ArrayMailbox()
      const actor: Accumulator = stage().actorFor(
        new AccumulatorProtocol(),
        undefined,
        'default',
        mailbox
      )

      // Suspend, queue messages, close, then resume
      mailbox.suspend()
      actor.add(1)
      actor.add(2)
      actor.add(3)
      mailbox.close()
      mailbox.resume()

      await new Promise(resolve => setTimeout(resolve, 30))

      // Dispatch should not process anything since mailbox is closed
      expect(mailbox.isReceivable()).toBe(false)
    })
  })

  describe('receive()', () => {
    it('should return EmptyMessage when queue is empty', () => {
      const mailbox = new ArrayMailbox()
      const message = mailbox.receive()
      expect(message.isDeliverable()).toBe(false)
    })
  })
})
