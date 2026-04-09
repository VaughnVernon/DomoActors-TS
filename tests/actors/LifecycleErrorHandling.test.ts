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

// ============================================================================
// Test Actors with Lifecycle Errors
// ============================================================================

interface ErrorProne extends ActorProtocol {
  doSomething(): Promise<void>
}

// Actor that throws error in beforeStart
class BeforeStartErrorActor extends Actor implements ErrorProne {
  constructor() {
    super()
  }

  beforeStart(): void {
    throw new Error('beforeStart failed intentionally')
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// Actor that throws error in start
class StartErrorActor extends Actor implements ErrorProne {
  constructor() {
    super()
  }

  start(): Promise<void> {
    throw new Error('start failed intentionally')
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// Actor that throws error in afterStop
class AfterStopErrorActor extends Actor implements ErrorProne {
  constructor() {
    super()
  }

  afterStop(): void {
    throw new Error('afterStop failed intentionally')
  }

  async doSomething(): Promise<void> {
    // No-op
  }
}

// Actor that works normally for comparison
class NormalActor extends Actor implements ErrorProne {
  private _beforeStartCalled = false
  private _startCalled = false
  private _afterStopCalled = false

  constructor() {
    super()
  }

  beforeStart(): void {
    super.beforeStart()
    this._beforeStartCalled = true
  }

  async start(): Promise<void> {
    await super.start()
    this._startCalled = true
  }

  afterStop(): void {
    super.afterStop()
    this._afterStopCalled = true
  }

  async doSomething(): Promise<void> {
    // No-op
  }

  wasBeforeStartCalled(): boolean {
    return this._beforeStartCalled
  }

  wasStartCalled(): boolean {
    return this._startCalled
  }

  wasAfterStopCalled(): boolean {
    return this._afterStopCalled
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

const beforeStartErrorActors: Map<string, BeforeStartErrorActor> = new Map()
const startErrorActors: Map<string, StartErrorActor> = new Map()
const afterStopErrorActors: Map<string, AfterStopErrorActor> = new Map()
const normalActors: Map<string, NormalActor> = new Map()

class BeforeStartErrorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new BeforeStartErrorActor()
    beforeStartErrorActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class StartErrorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new StartErrorActor()
    startErrorActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class AfterStopErrorInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new AfterStopErrorActor()
    afterStopErrorActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class NormalInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new NormalActor()
    normalActors.set(definition.address().valueAsString(), actor)
    return actor
  }
}

class BeforeStartErrorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new BeforeStartErrorInstantiator()
  }
  type(): string {
    return 'BeforeStartError'
  }
}

class StartErrorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new StartErrorInstantiator()
  }
  type(): string {
    return 'StartError'
  }
}

class AfterStopErrorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new AfterStopErrorInstantiator()
  }
  type(): string {
    return 'AfterStopError'
  }
}

class NormalProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new NormalInstantiator()
  }
  type(): string {
    return 'Normal'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Lifecycle Error Handling', () => {
  beforeEach(() => {
    beforeStartErrorActors.clear()
    startErrorActors.clear()
    afterStopErrorActors.clear()
    normalActors.clear()
  })

  describe('beforeStart() error handling', () => {
    it('should catch and log errors in beforeStart()', () => {
      // Spy on console.error to verify error is logged
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create actor that throws in beforeStart
      const proxy: ErrorProne = stage().actorFor(new BeforeStartErrorProtocol())

      // Actor should still be created despite error
      expect(proxy).toBeDefined()
      expect(proxy.address()).toBeDefined()

      // Error should have been logged
      expect(errorSpy).toHaveBeenCalled()
      const errorCall = errorSpy.mock.calls.find(call =>
        call[0]?.includes('beforeStart() failed')
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![0]).toContain('beforeStart failed intentionally')

      errorSpy.mockRestore()
    })

    it('should not prevent actor creation if beforeStart fails', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: ErrorProne = stage().actorFor(new BeforeStartErrorProtocol())

      // Actor proxy should exist
      expect(proxy).toBeDefined()
      expect(proxy.isStopped()).toBe(false)

      errorSpy.mockRestore()
    })
  })

  describe('start() error handling', () => {
    it('should catch and log errors in start()', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create actor that throws in start
      const proxy: ErrorProne = stage().actorFor(new StartErrorProtocol())

      // Actor should still be created
      expect(proxy).toBeDefined()

      // Wait for start() message to be processed
      await new Promise(resolve => setTimeout(resolve, 10))

      // Error should have been logged by message delivery
      // Note: start() errors are caught during message processing (LocalMessage.deliver())
      expect(errorSpy).toHaveBeenCalled()
      const errorCall = errorSpy.mock.calls.find(call =>
        call[0]?.includes('start failed intentionally')
      )
      expect(errorCall).toBeDefined()

      errorSpy.mockRestore()
    })
  })

  describe('afterStop() error handling', () => {
    it('should catch and log errors in afterStop()', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: ErrorProne = stage().actorFor(new AfterStopErrorProtocol())
      expect(proxy).toBeDefined()

      // Clear any creation errors
      errorSpy.mockClear()

      // Stop the actor - this should trigger afterStop error
      await proxy.stop()

      // Error should have been logged
      expect(errorSpy).toHaveBeenCalled()
      const errorCall = errorSpy.mock.calls.find(call =>
        call[0]?.includes('afterStop() failed')
      )
      expect(errorCall).toBeDefined()
      expect(errorCall![0]).toContain('afterStop failed intentionally')

      errorSpy.mockRestore()
    })

    it('should complete stop operation even if afterStop fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: ErrorProne = stage().actorFor(new AfterStopErrorProtocol())

      // Stop the actor
      await proxy.stop()

      // Actor should be stopped despite afterStop error
      expect(proxy.isStopped()).toBe(true)

      errorSpy.mockRestore()
    })
  })

  describe('Normal lifecycle execution', () => {
    it('should call all lifecycle hooks in correct order', async () => {
      const proxy: ErrorProne = stage().actorFor(new NormalProtocol())
      const actor = normalActors.get(proxy.address().valueAsString())!

      // beforeStart should have been called during creation
      expect(actor.wasBeforeStartCalled()).toBe(true)

      // Wait for start message to be processed
      await new Promise(resolve => setTimeout(resolve, 10))

      // Actor should be running
      expect(proxy.isStopped()).toBe(false)

      // Stop the actor
      await proxy.stop()

      // afterStop should have been called
      expect(actor.wasAfterStopCalled()).toBe(true)

      // Actor should be stopped
      expect(proxy.isStopped()).toBe(true)
    })

    it('should not log errors for normal lifecycle', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const proxy: ErrorProne = stage().actorFor(new NormalProtocol())

      // Wait a bit for any async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      // Stop the actor
      await proxy.stop()

      // Should not have logged any errors
      expect(errorSpy).not.toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('Error isolation', () => {
    it('should not affect other actors when one actor fails in beforeStart', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create error-prone actor
      const errorActor: ErrorProne = stage().actorFor(new BeforeStartErrorProtocol())

      // Create normal actor
      const normalActor: ErrorProne = stage().actorFor(new NormalProtocol())
      const normal = normalActors.get(normalActor.address().valueAsString())!

      // Normal actor should have started successfully
      expect(normal.wasBeforeStartCalled()).toBe(true)

      // Both actors should exist
      expect(errorActor).toBeDefined()
      expect(normalActor).toBeDefined()

      errorSpy.mockRestore()
    })

    it('should handle errors from multiple actors independently', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create two actors with afterStop errors
      const actor1: ErrorProne = stage().actorFor(new AfterStopErrorProtocol())
      const actor2: ErrorProne = stage().actorFor(new AfterStopErrorProtocol())

      errorSpy.mockClear()

      // Stop both
      await actor1.stop()
      await actor2.stop()

      // Both should be stopped
      expect(actor1.isStopped()).toBe(true)
      expect(actor2.isStopped()).toBe(true)

      // Should have logged errors for both
      const errorCalls = errorSpy.mock.calls.filter(call =>
        call[0]?.includes('afterStop() failed')
      )
      expect(errorCalls.length).toBe(2)

      errorSpy.mockRestore()
    })
  })

  describe('Error object handling', () => {
    it('should convert non-Error objects to Error instances', () => {
      // Create custom actor that throws a string
      class StringErrorActor extends Actor {
        beforeStart(): void {
          throw 'This is a string error'
        }
      }

      class StringErrorInstantiator implements ProtocolInstantiator {
        instantiate(_definition: Definition): Actor {
          return new StringErrorActor()
        }
      }

      class StringErrorProtocol implements Protocol {
        instantiator(): ProtocolInstantiator {
          return new StringErrorInstantiator()
        }
        type(): string {
          return 'StringError'
        }
      }

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      stage().actorFor(new StringErrorProtocol())

      // Error should still be logged with proper message
      expect(errorSpy).toHaveBeenCalled()
      const errorCall = errorSpy.mock.calls.find(call =>
        call[0]?.includes('beforeStart() failed')
      )
      expect(errorCall).toBeDefined()

      errorSpy.mockRestore()
    })
  })
})
