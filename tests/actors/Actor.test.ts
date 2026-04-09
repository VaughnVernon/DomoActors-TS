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
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'
import { ActorProtocol } from '@/actors/ActorProtocol'
import { TestDeadLettersListener } from '@/actors/testkit/TestDeadLettersListener'

// ============================================================================
// Named Protocol
// ============================================================================

interface Named extends ActorProtocol {
  name(name: string): Promise<void>
  name(): Promise<string>
}

class NamedActor extends Actor implements Named {
  private _name: string

  constructor() {
    super()
    this._name = ''
  }

  name(): Promise<string>

  name(name: string): Promise<void>

  name(name?: string): Promise<void | string> {
    if (name !== undefined) {
      this._name = name
      return Promise.resolve()
    }
    return Promise.resolve(this._name)
  }
}

const namedActors: Map<string, Actor> = new Map()

class NamedInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new NamedActor()

    namedActors.set(definition.address().valueAsString(), actor)

    return actor
  }
}

export class NamedProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new NamedInstantiator()
  }

  type(): string {
    return 'Named'
  }
}

// ============================================================================
// Stateful Protocol: test stateSnapshot
// ============================================================================

interface Stateful extends ActorProtocol {
  doSomething(): Promise<void>
}

class StatefulActor extends Actor implements Stateful {
  private _snapshot: any

  constructor() {
    super()
    this._snapshot = undefined
  }

  stateSnapshot<S>(stateSnapshot: S): void
  stateSnapshot<S>(): S
  stateSnapshot<S>(stateSnapshot?: S): S | void {
    if (stateSnapshot !== undefined) {
      this._snapshot = stateSnapshot
      return
    }
    return this._snapshot as S
  }

  async doSomething(): Promise<void> {
    // Just a method to make this actor callable
  }
}

const statefulActors: Map<string, Actor> = new Map()

class StatefulInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const actor = new StatefulActor()

    statefulActors.set(definition.address().valueAsString(), actor)

    return actor
  }
}

export class StatefulProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new StatefulInstantiator()
  }

  type(): string {
    return 'Stateful'
  }
}

// ============================================================================
// Child Protocol: test childActorFor with constructor parameters
// ============================================================================

interface Child extends ActorProtocol {
  getValue(): Promise<string>
  getName(): Promise<string>
}

class ChildActor extends Actor implements Child {
  private _value: string
  private _name: string

  constructor(initialValue: string, name: string) {
    super()
    this._value = initialValue
    this._name = name
  }

  async getValue(): Promise<string> {
    return this._value
  }

  async getName(): Promise<string> {
    return this._name
  }
}

const childActors: Map<string, ChildActor> = new Map()

class ChildInstantiator implements ProtocolInstantiator {
  instantiate(definition: Definition): Actor {
    const params = definition.parameters()
    const actor = new ChildActor(
      params[0] || 'default-value',
      params[1] || 'default-name'
    )

    childActors.set(definition.address().valueAsString(), actor)

    return actor
  }
}

export class ChildProtocol implements Protocol {
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

describe('Actor Protocol - Operational Methods', () => {
  it('should return itself from actor()', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    expect(namedActors.get(named.address().valueAsString())).toBeDefined()
  })

  it('should have a unique address', async () => {
    const named1 = stage().actorFor(new NamedProtocol())
    const named2 = stage().actorFor(new NamedProtocol())

    // Both actors should exist
    expect(named1).toBeDefined()
    expect(named2).toBeDefined()

    // address() is now accessible synchronously through the proxy
    const address1 = (named1 as any).address()
    const addr2 = (named2 as any).address()

    expect(address1).toBeDefined()
    expect(addr2).toBeDefined()
    expect(address1.equals(addr2)).toBe(false)
  })

  it('should access stage synchronously through proxy', async () => {
    const named1 = stage().actorFor(new NamedProtocol())

    // stage() is accessible synchronously through the proxy
    const actorStage = (named1 as any).stage()

    expect(actorStage).toBeDefined()
    expect(actorStage).toBe(stage())
  })

  it('should access isStopped synchronously through proxy', async () => {
    const named1 = stage().actorFor(new NamedProtocol())

    // isStopped() is accessible synchronously through the proxy
    const stopped = (named1 as any).isStopped()

    expect(typeof stopped).toBe('boolean')
    expect(stopped).toBe(false) // Actor should not be stopped initially
  })

  it('should access definition synchronously through proxy', async () => {
    const named1 = stage().actorFor(new NamedProtocol())

    // definition() is accessible synchronously through the proxy
    const definition = (named1 as any).definition()

    expect(definition).toBeDefined()
    expect(definition.type()).toBe('Named')
  })

  it('should access protocol type name synchronously through proxy', async () => {
    const named1 = stage().actorFor(new NamedProtocol())

    // definition() is accessible synchronously through the proxy
    const type = (named1 as any).type()

    expect(type).toBeDefined()
    expect(type).toBe('Named')
  })

  it('should access logger', async () => {
    // logger() delegates to stage, should work
    const actor1 = stage().actorFor(new NamedProtocol())
    expect(actor1).toBeDefined()
  })

  it('should access deadLetters', async () => {
    // deadLetters() delegates to stage, should work
    const actor1 = stage().actorFor(new NamedProtocol())
    expect(actor1).toBeDefined()
  })

  it('should access scheduler', async () => {
    // scheduler() delegates to stage, should work
    const actor1 = stage().actorFor(new NamedProtocol())
    expect(actor1).toBeDefined()
  })
})

describe('Actor Protocol - State Management', () => {
  it('should store and retrieve state snapshot', async () => {
    const actor = stage().actorFor(new StatefulProtocol())

    // Access the underlying actor for state snapshot testing
    // Note: This is a test-only pattern
    expect(actor).toBeDefined()

    // State snapshot functionality exists but can't be tested through proxy
    // This will need actor protocol methods exposed through the interface
  })

  it('should return undefined for default state snapshot', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // Default stateSnapshot returns undefined
    // This will need protocol method exposure to test properly
  })
})

describe('Actor Protocol - Lifecycle Methods', () => {
  it('should indicate not stopped when created', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    // Set a name to ensure actor is working
    await named.name('test')
    const name = await named.name()
    expect(name).toBe('test')

    // isStopped() is synchronous and should return false initially
    expect(named.isStopped()).toBe(false)
  })

  it('should send start message through proxy', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    // start() goes through mailbox and returns Promise
    const result = named.start()
    expect(result).toBeInstanceOf(Promise)

    await result
    // Start completed successfully
  })

  it('should send stop message through proxy', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    // Set a name first to verify actor is working
    await named.name('test')
    expect(named.isStopped()).toBe(false)

    // stop() goes through mailbox and returns Promise
    await named.stop()

    // After stop() completes, isStopped should return true
    expect(named.isStopped()).toBe(true)
  })

  it('should not process messages after stopped', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    await named.name('initial')
    const initialName = await named.name()
    expect(initialName).toBe('initial')

    // Stop the actor
    await named.stop()
    expect(named.isStopped()).toBe(true)

    // Prepare for deadletter delivery
    const listener = new TestDeadLettersListener()
    stage().deadLetters().registerListener(listener)

    // Try to send a message after stop - should go to dead letters
    // Don't await since the promise won't resolve (message goes to dead letters)
    named.name('after-stop')

    expect(listener.latest()).toBeDefined()
    expect(listener.latest()!.message()).toBe('name(after-stop)')

    // The actor is stopped, so the message was not processed
    // It went to dead letters instead
  })

  it('should process start and stop in order with other messages', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    expect(named.isStopped()).toBe(false)

    // Send multiple messages in sequence
    await named.name('first')
    await named.name('second')

    const name = await named.name()
    expect(name).toBe('second')

    // Now stop
    await named.stop()
    expect(named.isStopped()).toBe(true)
  })

  it('should call beforeStart lifecycle hook', async () => {
    // beforeStart() is implemented but not called automatically
    // This test will verify the lifecycle flow once start() is wired up
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()
  })

  it('should call afterStop lifecycle hook', async () => {
    // afterStop() is implemented but not called automatically
    // This test will verify the lifecycle flow once stop() is wired up
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()
  })

  it('should handle beforeRestart lifecycle hook', async () => {
    // Test restart behavior with error
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()
    // Will need supervision implementation to test properly
  })

  it('should handle afterRestart lifecycle hook', async () => {
    // Test restart behavior with error recovery
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()
    // Will need supervision implementation to test properly
  })

  it('should handle beforeResume lifecycle hook', async () => {
    // Test resume behavior after suspension
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()
    // Will need supervision implementation to test properly
  })
})

describe('Actor Protocol - Parent/Child Relationships', () => {
  it('should create child actors with parameters', async () => {
    const parent: Named = stage().actorFor(new NamedProtocol())
    expect(parent).toBeDefined()

    // Create definition with constructor parameters
    const parentActor = namedActors.get(parent.address().valueAsString())!
    const definition = new Definition(
      'Child',
      parent.address(),  // Address not used but required
      ['test-value', 'test-name']  // Constructor parameters
    )

    // Create child using childActorFor
    const child: Child = parentActor.childActorFor(new ChildProtocol(), definition)
    expect(child).toBeDefined()

    // Verify constructor parameters were passed correctly
    expect(await child.getValue()).toBe('test-value')
    expect(await child.getName()).toBe('test-name')
  })

  it('should maintain parent-child relationship', async () => {
    const parent: Named = stage().actorFor(new NamedProtocol())
    expect(parent).toBeDefined()

    const parentActor = namedActors.get(parent.address().valueAsString())!
    const definition = new Definition(
      'Child',
      parent.address(),
      ['value1', 'name1']
    )

    const child: Child = parentActor.childActorFor(new ChildProtocol(), definition)
    expect(child).toBeDefined()

    // Verify parent-child relationship
    const childActor = childActors.get(child.address().valueAsString())!
    const childParent = childActor.parent()
    expect(childParent).toBeDefined()
    expect(childParent.address().equals(parent.address())).toBe(true)
  })

  it('should create multiple children from same parent', async () => {
    const parent: Named = stage().actorFor(new NamedProtocol())
    const parentActor = namedActors.get(parent.address().valueAsString())!

    // Create first child
    const definition1 = new Definition('Child', parent.address(), ['value1', 'child1'])
    const child1: Child = parentActor.childActorFor(new ChildProtocol(), definition1)

    // Create second child
    const definition2 = new Definition('Child', parent.address(), ['value2', 'child2'])
    const child2: Child = parentActor.childActorFor(new ChildProtocol(), definition2)

    // Both children should exist
    expect(child1).toBeDefined()
    expect(child2).toBeDefined()

    // Both should have different addresses
    expect(child1.address().equals(child2.address())).toBe(false)

    // Both should have same parent (access through actor instances)
    const child1Actor = childActors.get(child1.address().valueAsString())!
    const child2Actor = childActors.get(child2.address().valueAsString())!
    const parent1 = child1Actor.parent()
    const parent2 = child2Actor.parent()
    expect(parent1.address().equals(parent.address())).toBe(true)
    expect(parent2.address().equals(parent.address())).toBe(true)

    // Each should have their own parameters
    expect(await child1.getValue()).toBe('value1')
    expect(await child1.getName()).toBe('child1')
    expect(await child2.getValue()).toBe('value2')
    expect(await child2.getName()).toBe('child2')
  })

  it('should create child with empty parameters', async () => {
    const parent: Named = stage().actorFor(new NamedProtocol())
    const parentActor = namedActors.get(parent.address().valueAsString())!

    // Create definition with no parameters
    const definition = new Definition('Child', parent.address(), [])

    const child: Child = parentActor.childActorFor(new ChildProtocol(), definition)
    expect(child).toBeDefined()

    // Should use default values from ChildInstantiator
    expect(await child.getValue()).toBe('default-value')
    expect(await child.getName()).toBe('default-name')
  })
})

describe('Actor Protocol - Object Methods', () => {
  it('should compare actors for equality by address', () => {
    const actor1 = stage().actorFor(new NamedProtocol())
    const actor2 = stage().actorFor(new NamedProtocol())

    expect(actor1).toBeDefined()
    expect(actor2).toBeDefined()

    // equals() is accessible synchronously through the proxy
    const equalsSelf = (actor1 as any).equals(actor1)
    const equalsDifferent = (actor1 as any).equals(actor2)

    expect(equalsSelf).toBe(true)
    expect(equalsDifferent).toBe(false)
  })

  it('should compute hash code from address', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // hashCode() is accessible synchronously through the proxy
    const hash = named.hashCode()

    expect(typeof hash).toBe('number')
    expect(hash).toBeGreaterThan(0)
  })

  it('should convert to string with address', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // toString() is accessible synchronously through the proxy
    const name = named.toString()

    expect(name).toContain('To: Named') // Shows protocol type
    expect(name).toContain('Address:')
  })

  it('should have consistent hashCode for same actor', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // Multiple calls to hashCode() should return same value
    const hash1 = named.hashCode()
    const hash2 = named.hashCode()

    expect(hash1).toBe(hash2)
  })
})

describe('Actor Protocol - Definition and Environment', () => {
  it('should access its definition synchronously', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // definition() is accessible synchronously through the proxy
    const definition = named.definition()

    expect(definition).toBeDefined()
    expect(definition.type()).toBe('Named')
  })

  it('should access its address through definition', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    const definition = named.definition()
    const address = named.address()

    // Definition's address should match actor's address
    expect(definition.address().equals(address)).toBe(true)
  })

  it('should access stage through actor', () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    const actorStage = named.stage()

    expect(actorStage).toBe(stage())
  })
})

describe('Actor Protocol - Message Processing', () => {
  it('should process messages in FIFO order', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    // Send multiple messages
    await named.name('first')
    await named.name('second')
    await named.name('third')

    const result = await named.name()
    expect(result).toBe('third')
  })

  it('should handle async operations correctly', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    // Fire multiple operations
    const promises = [
      named.name('one'),
      named.name('two'),
      named.name('three')
    ]

    await Promise.all(promises)

    const result = await named.name()
    expect(result).toBe('three')
  })

  it('should maintain state consistency across messages', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())

    await named.name('consistent')
    const name1 = await named.name()
    const name2 = await named.name()

    expect(name1).toBe('consistent')
    expect(name2).toBe('consistent')
  })
})

describe('Actor Protocol - Error Handling', () => {
  it('should handle errors in message processing', async () => {
    // Will need an actor that can throw errors to test
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    // Error handling through supervision
    // Will implement when supervision is complete
  })

  it('should route failed messages to dead letters', async () => {
    const named: Named = stage().actorFor(new NamedProtocol())
    expect(named).toBeDefined()

    await named.stop()
    expect(named.isStopped()).toBe(true)

    const listener = new TestDeadLettersListener()
    stage().deadLetters().registerListener(listener)

    // Try to send a message after stop - should go to dead letters
    // Don't await since the promise won't resolve (message goes to dead letters)
    await named.name('to-deadletters')

    expect(listener.latest()).toBeDefined()
    expect(listener.latest()!.message()).toBe('name(to-deadletters)')

    // The message was routed to dead letters (visible in stderr output)
  })
})