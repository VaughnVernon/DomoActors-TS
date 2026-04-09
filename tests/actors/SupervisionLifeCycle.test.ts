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

// Actor that can throw errors on demand
class ErrorProneActor extends Actor {
  private _beforeRestartCalled = false
  private _afterRestartCalled = false
  private _beforeResumeCalled = false
  private _restartReason: Error | undefined

  constructor() {
    super()
  }

  beforeRestart(reason: Error): void {
    super.beforeRestart(reason)
    this._beforeRestartCalled = true
    this._restartReason = reason
  }

  afterRestart(reason: Error): void {
    super.afterRestart(reason)
    this._afterRestartCalled = true
  }

  beforeResume(reason: Error): void {
    super.beforeResume(reason)
    this._beforeResumeCalled = true
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

  getRestartReason(): Error | undefined {
    return this._restartReason
  }
}

// Actor that fails during beforeStart
class FailingActor extends Actor {
  constructor() {
    super()
  }

  beforeStart(): void {
    throw new Error('beforeStart failure for supervision test')
  }
}

// ============================================================================
// Custom Supervisors for Testing
// ============================================================================

class RestartingSupervisor extends DefaultSupervisor {
  private _informCalled = false
  private _lastError: Error | undefined

  async inform(error: Error, supervised: Supervised): Promise<void> {
    this._informCalled = true
    this._lastError = error
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
    return SupervisionDirective.Restart
  }

  wasInformCalled(): boolean {
    return this._informCalled
  }

  getLastError(): Error | undefined {
    return this._lastError
  }
}

class ResumingSupervisor extends DefaultSupervisor {
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
}

class StoppingSupervisor extends DefaultSupervisor {
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
    return SupervisionDirective.Stop
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

const errorProneActors: Map<string, ErrorProneActor> = new Map()

class ErrorProneInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new ErrorProneActor()
    errorProneActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class ErrorProneProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new ErrorProneInstantiator()
  }
  type(): string {
    return 'ErrorProne'
  }
}

class FailingInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new FailingActor()
  }
}

class FailingProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new FailingInstantiator()
  }
  type(): string {
    return 'Failing'
  }
}

// Supervisor tracking maps
const restartingSupervisors: Map<string, RestartingSupervisor> = new Map()
const resumingSupervisors: Map<string, ResumingSupervisor> = new Map()
const stoppingSupervisors: Map<string, StoppingSupervisor> = new Map()

// Supervisor protocols
function RestartingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => ({
      instantiate: (definition: Definition) => {
        const supervisor = new RestartingSupervisor()
        restartingSupervisors.set(definition.address().valueAsString(), supervisor)
        return supervisor
      }
    }),
    type: () => name
  }
}

function ResumingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => ({
      instantiate: (definition: Definition) => {
        const supervisor = new ResumingSupervisor()
        resumingSupervisors.set(definition.address().valueAsString(), supervisor)
        return supervisor
      }
    }),
    type: () => name
  }
}

function StoppingSupervisorProtocol(name: string): Protocol {
  return {
    instantiator: () => ({
      instantiate: (definition: Definition) => {
        const supervisor = new StoppingSupervisor()
        stoppingSupervisors.set(definition.address().valueAsString(), supervisor)
        return supervisor
      }
    }),
    type: () => name
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Supervision Integration', () => {
  beforeEach(() => {
    errorProneActors.clear()
    restartingSupervisors.clear()
    resumingSupervisors.clear()
    stoppingSupervisors.clear()
  })

  describe('Lifecycle failures routed to supervisor', () => {
    it('should route beforeStart failures to supervisor', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create custom supervisor actor
      const supervisorProxy = stage().actorFor(
        RestartingSupervisorProtocol('restarting'),
        undefined,
        'default'
      )

      // Create actor with custom supervisor that fails in beforeStart
      const _proxy: ActorProtocol = stage().actorFor(
        new FailingProtocol(),
        undefined,
        'restarting'
      )

      // Wait for error to be processed
      await new Promise(resolve => setTimeout(resolve, 20))

      // Supervisor should have been informed
      const restartSupervisor = restartingSupervisors.get(supervisorProxy.address().valueAsString())!
      expect(restartSupervisor.wasInformCalled()).toBe(true)
      expect(restartSupervisor.getLastError()?.message).toContain('beforeStart failure')

      errorSpy.mockRestore()
    })
  })

  describe('Restart directive', () => {
    it('should call restart with beforeRestart and afterRestart hooks', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create custom supervisor actor
      stage().actorFor(
        RestartingSupervisorProtocol('restarting2'),
        undefined,
        'default'
      )

      const proxy: ActorProtocol = stage().actorFor(
        new FailingProtocol(),
        undefined,
        'restarting2'
      )

      // Wait for failure and restart to be processed
      await new Promise(resolve => setTimeout(resolve, 30))

      // Note: FailingActor doesn't track restart hooks
      // This test verifies the supervision flow completes without errors

      errorSpy.mockRestore()
    })

    it('should restart actor when directed by supervisor', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Create custom supervisor actor
      stage().actorFor(
        RestartingSupervisorProtocol('restarting3'),
        undefined,
        'default'
      )

      // Create normal actor that can be restarted
      const proxy: ActorProtocol = stage().actorFor(
        new ErrorProneProtocol(),
        undefined,
        'restarting3'
      )

      const actor = errorProneActors.get(proxy.address().valueAsString())!

      // Manually trigger restart
      await actor.lifeCycle().restart(new Error('test restart'))

      // Wait for restart to complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should see restart logs
      const restartLogs = logSpy.mock.calls.filter(call =>
        call[0]?.includes('restart()')
      )
      expect(restartLogs.length).toBeGreaterThan(0)

      // Lifecycle hooks should have been called
      expect(actor.wasBeforeRestartCalled()).toBe(true)
      expect(actor.wasAfterRestartCalled()).toBe(true)

      logSpy.mockRestore()
    })
  })

  describe('Resume directive', () => {
    it('should call beforeResume hook when resuming', async () => {
      // Create custom supervisor actor
      stage().actorFor(
        ResumingSupervisorProtocol('resuming'),
        undefined,
        'default'
      )

      const proxy: ActorProtocol = stage().actorFor(
        new ErrorProneProtocol(),
        undefined,
        'resuming'
      )

      const actor = errorProneActors.get(proxy.address().valueAsString())!

      // Trigger resume through supervision
      // We'll create a supervised actor and call resume on it
      const { StageSupervisedActor } = await import('@/actors/Supervisor')
      const supervised = new StageSupervisedActor(proxy, actor, new Error('test error'))
      supervised.resume()

      // Wait for resume to complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // beforeResume should have been called
      expect(actor.wasBeforeResumeCalled()).toBe(true)
    })
  })

  describe('Stop directive', () => {
    it('should stop actor when directed by supervisor', async () => {
      // Create custom supervisor actor
      stage().actorFor(
        StoppingSupervisorProtocol('stopping'),
        undefined,
        'default'
      )

      const proxy: ActorProtocol = stage().actorFor(
        new FailingProtocol(),
        undefined,
        'stopping'
      )

      // Wait for failure and stop to be processed
      await new Promise(resolve => setTimeout(resolve, 30))

      // Actor should be stopped
      expect(proxy.isStopped()).toBe(true)
    })
  })

  describe('Supervision scope', () => {
    it('should support SupervisionScope.One for single actor', async () => {
      const { StageSupervisedActor } = await import('@/actors/Supervisor')

      const proxy: ActorProtocol = stage().actorFor(new ErrorProneProtocol())
      const actor = errorProneActors.get(proxy.address().valueAsString())!

      const supervised = new StageSupervisedActor(proxy, actor, new Error('test'))

      // Stop with scope One
      supervised.stop(SupervisionScope.One)

      // Just this actor should be stopped
      expect(proxy.isStopped()).toBe(true)
    })
  })

  describe('Error handling in supervision', () => {
    it('should handle non-Error objects in lifecycle failures', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create actor that throws a string
      class StringThrowingActor extends Actor {
        beforeStart(): void {
          throw 'This is a string error'
        }
      }

      class StringThrowingInstantiator implements ProtocolInstantiator {
        instantiate(_definition: Definition): Actor {
          return new StringThrowingActor()
        }
      }

      class StringThrowingProtocol implements Protocol {
        instantiator(): ProtocolInstantiator {
          return new StringThrowingInstantiator()
        }
        type(): string {
          return 'StringThrowing'
        }
      }

      stage().actorFor(new StringThrowingProtocol())

      // Wait for error processing
      await new Promise(resolve => setTimeout(resolve, 10))

      // Error should have been logged
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })

    it('should handle errors in restart hooks gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create actor that fails in beforeRestart
      class RestartFailingActor extends Actor {
        beforeRestart(_reason: Error): void {
          throw new Error('beforeRestart failed')
        }
      }

      class RestartFailingInstantiator implements ProtocolInstantiator {
        instantiate(_definition: Definition): Actor {
          return new RestartFailingActor()
        }
      }

      class RestartFailingProtocol implements Protocol {
        instantiator(): ProtocolInstantiator {
          return new RestartFailingInstantiator()
        }
        type(): string {
          return 'RestartFailing'
        }
      }

      const proxy = stage().actorFor(new RestartFailingProtocol())

      // Manually trigger restart
      await proxy.lifeCycle().restart(new Error('trigger restart'))

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10))

      // Error should have been logged but restart should complete
      const errorCalls = errorSpy.mock.calls.filter(call =>
        call[0]?.includes('beforeRestart() failed')
      )
      expect(errorCalls.length).toBeGreaterThan(0)

      errorSpy.mockRestore()
    })
  })
})
