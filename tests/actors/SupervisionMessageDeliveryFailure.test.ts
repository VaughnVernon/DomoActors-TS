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
import {
  Supervisor,
  Supervised,
  SupervisionStrategy,
  SupervisionScope,
  SupervisionDirective
} from '@/actors/Supervisor'
import { DefaultSupervisor } from '@/actors/DefaultSupervisor'

// ============================================================================
// Test Actors
// ============================================================================

interface CounterProtocol extends ActorProtocol {
  increment(): Promise<void>
  getValue(): Promise<number>
  causeError(): Promise<void>
  reset(): Promise<void>
}

/**
 * Stateful counter actor that can fail on demand.
 * Tracks lifecycle hooks for verification.
 */
class CounterActor extends Actor implements CounterProtocol {
  private _count: number = 0
  private _beforeRestartCalled: boolean = false
  private _afterRestartCalled: boolean = false
  private _beforeResumeCalled: boolean = false
  private _restartCount: number = 0

  constructor() {
    super()
  }

  async increment(): Promise<void> {
    this._count++
  }

  async getValue(): Promise<number> {
    return this._count
  }

  async causeError(): Promise<void> {
    throw new Error('Intentional message processing error')
  }

  async reset(): Promise<void> {
    this._count = 0
  }

  beforeRestart(reason: Error): void {
    super.beforeRestart(reason)
    this._beforeRestartCalled = true
    this._restartCount++
  }

  afterRestart(reason: Error): void {
    super.afterRestart(reason)
    this._afterRestartCalled = true
    // Reset state on restart
    this._count = 0
  }

  beforeResume(reason: Error): void {
    super.beforeResume(reason)
    this._beforeResumeCalled = true
  }

  // Test helper methods
  getRestartCount(): number {
    return this._restartCount
  }

  wasBeforeRestartCalled(): boolean {
    return this._beforeRestartCalled
  }

  wasAfterRestartCalled(): boolean {
    return this._afterRestartCalled
  }

  wasBeforeResumeCalled(): boolean {
    return this._beforeResumeCalled
  }
}

/**
 * Actor that fails after N successful operations.
 * Used to test supervision under load.
 */
class FailAfterNActor extends Actor implements CounterProtocol {
  private _count: number = 0
  private _operationCount: number = 0
  private _failAfter: number

  constructor(failAfter: number = 3) {
    super()
    this._failAfter = failAfter
  }

  async increment(): Promise<void> {
    this._operationCount++
    if (this._operationCount >= this._failAfter) {
      throw new Error(`Failed after ${this._failAfter} operations`)
    }
    this._count++
  }

  async getValue(): Promise<number> {
    return this._count
  }

  async causeError(): Promise<void> {
    throw new Error('Explicit error')
  }

  async reset(): Promise<void> {
    this._count = 0
    this._operationCount = 0
  }

  afterRestart(reason: Error): void {
    super.afterRestart(reason)
    // Reset counters on restart
    this._count = 0
    this._operationCount = 0
  }
}

// ============================================================================
// Custom Supervisors
// ============================================================================

/**
 * Supervisor that always restarts failed actors.
 * Tracks inform calls and last error for test verification.
 */
class RestartingSupervisor extends DefaultSupervisor {
  private _informCount: number = 0
  private _lastError: Error | undefined

  async inform(error: Error, supervised: Supervised): Promise<void> {
    this._informCount++
    this._lastError = error
    await super.inform(error, supervised)
  }

  async supervisionStrategy(): Promise<SupervisionStrategy> {
    return new class extends SupervisionStrategy {
      intensity(): number { return 5 }
      period(): number { return 5000 }
      scope(): SupervisionScope { return SupervisionScope.One }
    }
  }

  protected decideDirective(
    _error: Error,
    _supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {
    return SupervisionDirective.Restart
  }

  getInformCount(): number {
    return this._informCount
  }

  getLastError(): Error | undefined {
    return this._lastError
  }

  reset(): void {
    this._informCount = 0
    this._lastError = undefined
  }
}

/**
 * Supervisor that always resumes failed actors.
 * Tracks resume count for test verification.
 */
class ResumingSupervisor extends DefaultSupervisor {
  private _resumeCount: number = 0

  async inform(error: Error, supervised: Supervised): Promise<void> {
    this._resumeCount++
    await super.inform(error, supervised)
  }

  async supervisionStrategy(): Promise<SupervisionStrategy> {
    return new class extends SupervisionStrategy {
      intensity(): number { return 1 }
      period(): number { return 5000 }
      scope(): SupervisionScope { return SupervisionScope.One }
    }
  }

  protected decideDirective(
    _error: Error,
    _supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {
    return SupervisionDirective.Resume
  }

  getResumeCount(): number {
    return this._resumeCount
  }

  reset(): void {
    this._resumeCount = 0
  }
}

/**
 * Supervisor that always stops failed actors.
 */
class StoppingSupervisor extends DefaultSupervisor {
  async supervisionStrategy(): Promise<SupervisionStrategy> {
    return new class extends SupervisionStrategy {
      intensity(): number { return 0 }
      period(): number { return 0 }
      scope(): SupervisionScope { return SupervisionScope.One }
    }
  }

  protected decideDirective(
    _error: Error,
    _supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {
    return SupervisionDirective.Stop
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

const counterActors: Map<string, CounterActor> = new Map()
const failAfterNActors: Map<string, FailAfterNActor> = new Map()
const restartingSupervisors: Map<string, RestartingSupervisor> = new Map()
const resumingSupervisors: Map<string, ResumingSupervisor> = new Map()
const stoppingSupervisors: Map<string, StoppingSupervisor> = new Map()

class CounterInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new CounterActor()
    counterActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class FailAfterNInstantiator implements ProtocolInstantiator {
  private _failAfter: number

  constructor(failAfter: number = 3) {
    this._failAfter = failAfter
  }

  instantiate(definition: Definition): Actor {
    const actor = new FailAfterNActor(this._failAfter)
    failAfterNActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class RestartingSupervisorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const supervisor = new RestartingSupervisor()
    restartingSupervisors.set(definition.address().valueAsString(), supervisor)
    return supervisor
  }
}

class ResumingSupervisorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const supervisor = new ResumingSupervisor()
    resumingSupervisors.set(definition.address().valueAsString(), supervisor)
    return supervisor
  }
}

class StoppingSupervisorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const supervisor = new StoppingSupervisor()
    stoppingSupervisors.set(definition.address().valueAsString(), supervisor)
    return supervisor
  }
}

const CounterProtocolDef: Protocol = {
  instantiator: () => new CounterInstantiator(),
  type: () => 'Counter'
}

function FailAfterNProtocol(n: number): Protocol {
  return {
    instantiator: () => new FailAfterNInstantiator(n),
    type: () => 'FailAfterN'
  }
}

function RestartingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => new RestartingSupervisorInstantiator(),
    type: () => name
  }
}

function ResumingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => new ResumingSupervisorInstantiator(),
    type: () => name
  }
}

function StoppingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => new StoppingSupervisorInstantiator(),
    type: () => name
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Supervision - Message Delivery Failures', () => {
  beforeEach(() => {
    counterActors.clear()
    failAfterNActors.clear()
    restartingSupervisors.clear()
    resumingSupervisors.clear()
    stoppingSupervisors.clear()
  })

  describe('Message processing error triggers supervision', () => {
    it('should supervise actor when message processing throws error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('restarting-msg'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'restarting-msg'
      )

      // Normal operation works
      await proxy.increment()
      expect(await proxy.getValue()).toBe(1)

      // Message that throws error
      try {
        await proxy.causeError()
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).toContain('Intentional message processing error')
      }

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 30))

      // Supervisor should have been informed
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBe(1)
      expect(restartSupervisor.getLastError()?.message).toContain('Intentional message processing error')

      errorSpy.mockRestore()
    })

    it('should reject promise when message processing fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create supervisor actor
      stage().actorFor(
        RestartingSupervisorProtocol('restarting-reject'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'restarting-reject'
      )

      // Caller should receive rejected promise
      await expect(proxy.causeError()).rejects.toThrow('Intentional message processing error')

      errorSpy.mockRestore()
    })

    it('should suspend mailbox when message processing fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Custom supervisor that suspends but doesn't resume (so we can verify suspension)
      class SuspendingSupervisor extends DefaultSupervisor {
        async supervisionStrategy(): Promise<SupervisionStrategy> {
          return new class extends SupervisionStrategy {
            intensity(): number { return 1 }
            period(): number { return 5000 }
            scope(): SupervisionScope { return SupervisionScope.One }
          }
        }

        protected decideDirective(
          _error: Error,
          _supervised: Supervised,
          _strategy: SupervisionStrategy
        ): SupervisionDirective {
          // Return a directive that would normally be handled, but we'll override inform
          return SupervisionDirective.Resume
        }

        async inform(_error: Error, supervised: Supervised): Promise<void> {
          supervised.suspend()  // Just suspend, don't resume
          // Don't call super.inform() to avoid applying the directive
        }
      }

      const suspendingSupervisorProtocol: Protocol = {
        instantiator: () => ({
          instantiate: (_def: Definition) => new SuspendingSupervisor()
        }),
        type: () => 'suspending'
      }

      // Create supervisor actor
      stage().actorFor(suspendingSupervisorProtocol, undefined, 'default')

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'suspending'
      )

      // Trigger error
      proxy.causeError().catch(() => {})

      // Give error time to propagate and supervision to complete
      await new Promise(resolve => setTimeout(resolve, 30))

      // Mailbox should be suspended (and stay suspended since supervisor doesn't resume)
      const actor = counterActors.get(proxy.address().valueAsString())!
      const mailbox = actor.lifeCycle().environment().mailbox()
      expect(mailbox.isSuspended()).toBe(true)

      errorSpy.mockRestore()
    })
  })

  describe('Restart directive', () => {
    it('should restart actor and reset state after message failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      stage().actorFor(
        RestartingSupervisorProtocol('restarting-state'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'restarting-state'
      )

      // Build up some state
      await proxy.increment()
      await proxy.increment()
      await proxy.increment()
      expect(await proxy.getValue()).toBe(3)

      // Trigger error (should restart and reset state)
      await proxy.causeError().catch(() => {})

      // Wait for supervision and restart
      await new Promise(resolve => setTimeout(resolve, 50))

      // State should be reset after restart
      expect(await proxy.getValue()).toBe(0)

      // Verify lifecycle hooks were called
      const actor = counterActors.get(proxy.address().valueAsString())!
      expect(actor.wasBeforeRestartCalled()).toBe(true)
      expect(actor.wasAfterRestartCalled()).toBe(true)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })

    it('should resume mailbox after restart completes', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      stage().actorFor(
        RestartingSupervisorProtocol('restarting-resume'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'restarting-resume'
      )

      // Trigger error
      await proxy.causeError().catch(() => {})

      // Wait for supervision and restart
      await new Promise(resolve => setTimeout(resolve, 50))

      // Mailbox should be resumed
      const actor = counterActors.get(proxy.address().valueAsString())!
      const mailbox = actor.lifeCycle().environment().mailbox()
      expect(mailbox.isSuspended()).toBe(false)

      // Actor should process new messages
      await proxy.increment()
      expect(await proxy.getValue()).toBe(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })

    it('should handle multiple message failures with restarts', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('restarting-multiple'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'restarting-multiple'
      )

      // First failure
      await proxy.increment()
      await proxy.causeError().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 30))

      // Second failure
      await proxy.increment()
      await proxy.causeError().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 30))

      // Third failure
      await proxy.increment()
      await proxy.causeError().catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 30))

      // Should have been supervised 3 times
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBe(3)

      // Actor should still be processing
      await proxy.increment()
      expect(await proxy.getValue()).toBe(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  describe('Resume directive', () => {
    it('should call beforeResume hook and continue processing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        ResumingSupervisorProtocol('resuming-msg'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'resuming-msg'
      )

      // Build some state
      await proxy.increment()
      await proxy.increment()
      expect(await proxy.getValue()).toBe(2)

      // Trigger error (should resume, not restart)
      await proxy.causeError().catch(() => {})

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 30))

      // State should be preserved (not reset like restart)
      expect(await proxy.getValue()).toBe(2)

      // beforeResume should have been called
      const actor = counterActors.get(proxy.address().valueAsString())!
      expect(actor.wasBeforeResumeCalled()).toBe(true)

      // Actor should continue processing
      await proxy.increment()
      expect(await proxy.getValue()).toBe(3)

      const resumingSupervisor = resumingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(resumingSupervisor.getResumeCount()).toBe(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })

    it('should resume mailbox after resume directive', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      stage().actorFor(
        ResumingSupervisorProtocol('resuming-mailbox'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'resuming-mailbox'
      )

      // Trigger error
      await proxy.causeError().catch(() => {})

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 30))

      // Mailbox should be resumed
      const actor = counterActors.get(proxy.address().valueAsString())!
      const mailbox = actor.lifeCycle().environment().mailbox()
      expect(mailbox.isSuspended()).toBe(false)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  describe('Stop directive', () => {
    it('should stop actor when message processing fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      stage().actorFor(
        StoppingSupervisorProtocol('stopping-msg'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'stopping-msg'
      )

      // Normal operation
      await proxy.increment()
      expect(await proxy.getValue()).toBe(1)

      // Trigger error (should stop)
      await proxy.causeError().catch(() => {})

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 30))

      // Actor should be stopped
      expect(proxy.isStopped()).toBe(true)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  describe('Supervision under load', () => {
    it('should handle actor that fails periodically', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('periodic-failure'),
        undefined,
        'default'
      )

      // Actor fails after 3 operations
      const proxy: CounterProtocol = stage().actorFor(
        FailAfterNProtocol(3),
        undefined,
        'periodic-failure'
      )

      // First 2 operations succeed
      await proxy.increment()
      await proxy.increment()
      expect(await proxy.getValue()).toBe(2)

      // Third operation fails
      await expect(proxy.increment()).rejects.toThrow('Failed after 3 operations')

      // Wait for supervision and restart
      await new Promise(resolve => setTimeout(resolve, 50))

      // State reset after restart
      expect(await proxy.getValue()).toBe(0)

      // Actor should work again
      await proxy.increment()
      expect(await proxy.getValue()).toBe(1)

      // Supervisor was called once
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBe(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })

    it('should handle rapid sequential message failures', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('rapid-failure'),
        undefined,
        'default'
      )

      const proxy: CounterProtocol = stage().actorFor(
        CounterProtocolDef,
        undefined,
        'rapid-failure'
      )

      // Fire multiple errors rapidly (don't await)
      const promises = [
        proxy.causeError().catch(() => {}),
        proxy.causeError().catch(() => {}),
        proxy.causeError().catch(() => {})
      ]

      await Promise.all(promises)

      // Wait for all supervisions to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should have supervised multiple times
      // Note: May be less than 3 if mailbox was suspended before all messages were queued
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBeGreaterThanOrEqual(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  describe('Error edge cases', () => {
    it('should handle non-Error objects thrown in messages', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      class StringThrowingActor extends Actor {
        async throwString(): Promise<void> {
          throw 'This is a string error'
        }
      }

      const stringProtocol: Protocol = {
        instantiator: () => ({
          instantiate: (_def: Definition) => new StringThrowingActor()
        }),
        type: () => 'StringThrowing'
      }

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('string-error'),
        undefined,
        'default'
      )

      const proxy = stage().actorFor<any>(stringProtocol, undefined, 'string-error')

      await proxy.throwString().catch(() => {})

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 30))

      // Should have been supervised (converted to Error)
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBe(1)

      errorSpy.mockRestore()
      logSpy.mockRestore()
    })

    it('should handle async errors in message processing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      class AsyncFailingActor extends Actor {
        async delayedError(): Promise<void> {
          await new Promise(resolve => setTimeout(resolve, 10))
          throw new Error('Delayed error')
        }
      }

      const asyncProtocol: Protocol = {
        instantiator: () => ({
          instantiate: (_def: Definition) => new AsyncFailingActor()
        }),
        type: () => 'AsyncFailing'
      }

      // Create supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('async-error'),
        undefined,
        'default'
      )

      const proxy = stage().actorFor<any>(asyncProtocol, undefined, 'async-error')

      await expect(proxy.delayedError()).rejects.toThrow('Delayed error')

      // Wait for supervision
      await new Promise(resolve => setTimeout(resolve, 50))

      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.getInformCount()).toBe(1)

      errorSpy.mockRestore()
    })
  })
})
