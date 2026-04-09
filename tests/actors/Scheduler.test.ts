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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DefaultScheduler, Scheduled, Cancellable } from '@/actors/Scheduler'
import { Actor } from '@/actors/Actor'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'

// ============================================================================
// Test Helpers
// ============================================================================

class CounterHolder {
  private _count: number = 0
  private _target: number
  private _resolve?: () => void

  constructor(target: number) {
    this._target = target
  }

  increment(): void {
    this._count++
    if (this._count >= this._target && this._resolve) {
      this._resolve()
    }
  }

  getCount(): number {
    return this._count
  }

  waitForTarget(): Promise<void> {
    return new Promise((resolve) => {
      if (this._count >= this._target) {
        resolve()
      } else {
        this._resolve = resolve
      }
    })
  }
}

// ============================================================================
// Test Actors
// ============================================================================

interface FinalCountQuery extends ActorProtocol {
  queryCount(): Promise<number>
}

class OnceScheduledActor extends Actor implements FinalCountQuery, Scheduled<number> {
  private _count: number = 0
  private _maximum: number
  private _targetReached: boolean = false

  constructor(maximum: number) {
    super()
    this._maximum = maximum
  }

  async start(): Promise<void> {
    await super.start()
    this.scheduleNext()
  }

  async queryCount(): Promise<number> {
    // Wait until target is reached
    while (!this._targetReached) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    return this._count
  }

  intervalSignal(_scheduled: Scheduled<number>, _data: number): void {
    if (this._count < this._maximum) {
      this.scheduleNext()
    } else {
      this._targetReached = true
    }
  }

  private scheduleNext(): void {
    this._count++
    this.scheduler().scheduleOnce(this, this._count, 0, 10)
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

class OnceScheduledInstantiator implements ProtocolInstantiator {
  private _maximum: number

  constructor(maximum: number) {
    this._maximum = maximum
  }

  instantiate(_definition: Definition): Actor {
    return new OnceScheduledActor(this._maximum)
  }
}

class OnceScheduledProtocol implements Protocol {
  private _maximum: number

  constructor(maximum: number) {
    this._maximum = maximum
  }

  instantiator(): ProtocolInstantiator {
    return new OnceScheduledInstantiator(this._maximum)
  }

  type(): string {
    return 'OnceScheduled'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Scheduler (Phase 6.3)', () => {
  let scheduler: DefaultScheduler

  beforeEach(() => {
    scheduler = new DefaultScheduler()
  })

  afterEach(() => {
    scheduler.close()
  })

  describe('scheduleOnce - one-time execution', () => {
    it('should execute once after delay', async () => {
      const holder = new CounterHolder(1)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      scheduler.scheduleOnce(scheduled, holder, 10, 0)

      await holder.waitForTarget()
      expect(holder.getCount()).toBe(1)
    })

    it('should execute immediately with zero delay', async () => {
      const holder = new CounterHolder(1)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      scheduler.scheduleOnce(scheduled, holder, 0, 0)

      await holder.waitForTarget()
      expect(holder.getCount()).toBe(1)
    })

    it('should not execute if cancelled before delay', async () => {
      const holder = new CounterHolder(1)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      const cancellable = scheduler.scheduleOnce(scheduled, holder, 50, 0)
      cancellable.cancel()

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(holder.getCount()).toBe(0)
    })

    it('should return cancellable that can be cancelled', () => {
      const scheduled: Scheduled<number> = {
        intervalSignal: () => {}
      }

      const cancellable = scheduler.scheduleOnce(scheduled, 1, 100, 0)

      expect(cancellable.cancel()).toBe(true)
      expect(cancellable.cancel()).toBe(false) // Already cancelled
    })
  })

  describe('schedule - repeating execution', () => {
    it('should execute multiple times at intervals', async () => {
      const holder = new CounterHolder(5)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      scheduler.schedule(scheduled, holder, 0, 10)

      await holder.waitForTarget()
      expect(holder.getCount()).toBeGreaterThanOrEqual(5)
    })

    it('should wait for initial delay before starting interval', async () => {
      const holder = new CounterHolder(3)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      const startTime = Date.now()
      scheduler.schedule(scheduled, holder, 50, 10)

      await holder.waitForTarget()
      const elapsed = Date.now() - startTime

      // Should have waited at least 50ms for initial delay
      expect(elapsed).toBeGreaterThanOrEqual(50)
    })

    it('should stop executing when cancelled', async () => {
      const holder = new CounterHolder(3)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      const cancellable = scheduler.schedule(scheduled, holder, 0, 10)

      await holder.waitForTarget()
      const countAtCancel = holder.getCount()

      cancellable.cancel()

      await new Promise(resolve => setTimeout(resolve, 50))

      // Count should not have increased significantly after cancellation
      expect(holder.getCount()).toBeLessThanOrEqual(countAtCancel + 2)
    })
  })

  describe('close - cleanup', () => {
    it('should cancel all pending tasks when closed', async () => {
      const holder = new CounterHolder(10)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      scheduler.schedule(scheduled, holder, 0, 10)

      await new Promise(resolve => setTimeout(resolve, 25))

      const countBeforeClose = holder.getCount()
      scheduler.close()

      await new Promise(resolve => setTimeout(resolve, 50))

      // Count should not increase after close
      expect(holder.getCount()).toBe(countBeforeClose)
    })

    it('should throw error when scheduling after close', () => {
      scheduler.close()

      const scheduled: Scheduled<number> = {
        intervalSignal: () => {}
      }

      expect(() => {
        scheduler.scheduleOnce(scheduled, 1, 0, 0)
      }).toThrow('Scheduler is closed')

      expect(() => {
        scheduler.schedule(scheduled, 1, 0, 10)
      }).toThrow('Scheduler is closed')
    })

    it('should be idempotent (safe to call multiple times)', () => {
      scheduler.close()
      expect(() => scheduler.close()).not.toThrow()
      expect(scheduler.isClosed()).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should catch and log errors in scheduled callbacks', async () => {
      const holder = new CounterHolder(2)
      let errorCount = 0

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          errorCount++
          if (errorCount === 1) {
            throw new Error('Test error')
          }
          data.increment()
        }
      }

      // Mock console.error to prevent test output pollution
      const originalError = console.error
      console.error = () => {}

      scheduler.schedule(scheduled, holder, 0, 10)

      await holder.waitForTarget()

      console.error = originalError

      // Should have recovered from error and continued
      expect(holder.getCount()).toBe(2)
      expect(errorCount).toBeGreaterThanOrEqual(3) // 1 error + 2 successes
    })
  })

  describe('integration with actors', () => {
    it('should allow actors to schedule tasks via scheduler()', async () => {
      const query: FinalCountQuery = stage().actorFor(new OnceScheduledProtocol(10))

      await new Promise(resolve => setTimeout(resolve, 20))

      const count = await query.queryCount()
      expect(count).toBe(10)
    }, 10000)

    it('should work with actor lifecycle', async () => {
      const query: FinalCountQuery = stage().actorFor(new OnceScheduledProtocol(5))

      await new Promise(resolve => setTimeout(resolve, 20))

      const count = await query.queryCount()
      expect(count).toBe(5)

      // Stop the actor after we've verified the count
      await query.stop()
      expect(query.isStopped()).toBe(true)
    }, 10000)
  })

  describe('data passing', () => {
    it('should pass correct data to callback', async () => {
      const receivedData: number[] = []

      const scheduled: Scheduled<number> = {
        intervalSignal: (_scheduled, data) => {
          receivedData.push(data)
        }
      }

      scheduler.scheduleOnce(scheduled, 42, 10, 0)

      await new Promise(resolve => setTimeout(resolve, 30))

      expect(receivedData).toEqual([42])
    })

    it('should maintain data across multiple invocations', async () => {
      const holder = new CounterHolder(3)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      scheduler.schedule(scheduled, holder, 0, 10)

      await holder.waitForTarget()

      // Same holder instance should have been incremented multiple times
      expect(holder.getCount()).toBeGreaterThanOrEqual(3)
    })
  })

  describe('timing accuracy', () => {
    it('should respect delay timing (within tolerance)', async () => {
      const holder = new CounterHolder(1)
      const targetDelay = 100

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          data.increment()
        }
      }

      const startTime = Date.now()
      scheduler.scheduleOnce(scheduled, holder, targetDelay, 0)

      await holder.waitForTarget()
      const actualDelay = Date.now() - startTime

      // Should be within 50ms of target (accounting for JS timer imprecision)
      expect(actualDelay).toBeGreaterThanOrEqual(targetDelay - 10)
      expect(actualDelay).toBeLessThanOrEqual(targetDelay + 50)
    })

    it('should maintain interval timing for repeating tasks', async () => {
      const timestamps: number[] = []
      const holder = new CounterHolder(3)

      const scheduled: Scheduled<CounterHolder> = {
        intervalSignal: (_scheduled, data) => {
          timestamps.push(Date.now())
          data.increment()
        }
      }

      scheduler.schedule(scheduled, holder, 0, 50)

      await holder.waitForTarget()

      // Check intervals between executions
      for (let i = 1; i < timestamps.length; i++) {
        const interval = timestamps[i] - timestamps[i - 1]
        expect(interval).toBeGreaterThanOrEqual(40) // Allow some variance
        expect(interval).toBeLessThanOrEqual(70)
      }
    })
  })
})
