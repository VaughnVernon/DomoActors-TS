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
import { ActorProtocol } from '@/actors/ActorProtocol'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'
import { stage } from '@/actors/Stage'

// ============================================================================
// Test Actors
// ============================================================================

interface SimpleActor extends ActorProtocol {
  getValue(): Promise<string>
  setValue(value: string): Promise<void>
}

class SimpleActorImpl extends Actor implements SimpleActor {
  private _value: string = 'initial'

  constructor() {
    super()
  }

  async getValue(): Promise<string> {
    return this._value
  }

  async setValue(value: string): Promise<void> {
    this._value = value
  }
}

// ============================================================================
// Protocol Definitions
// ============================================================================

class SimpleActorInstantiator implements ProtocolInstantiator {
  instantiate(_definition: Definition): Actor {
    return new SimpleActorImpl()
  }
}

class SimpleActorProtocol implements Protocol {
  instantiator(): ProtocolInstantiator {
    return new SimpleActorInstantiator()
  }
  type(): string {
    return 'SimpleActor'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Actor Selection (Phase 6.1)', () => {
  describe('actorOf - basic lookup', () => {
    it('should find an actor by its address', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up the actor by address
      const foundActor = await stage().actorOf(address)

      expect(foundActor).toBeDefined()
      expect(foundActor?.address().equals(address)).toBe(true)
    })

    it('should return undefined for non-existent address', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Create a different address (won't exist in directory)
      const { Uuid7Address } = await import('@/actors/Uuid7Address')
      const nonExistentAddress = Uuid7Address.unique()

      const foundActor = await stage().actorOf(nonExistentAddress)

      expect(foundActor).toBeUndefined()
    })

    it('should find multiple actors by their addresses', async () => {
      const actor1: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const actor2: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const actor3: SimpleActor = stage().actorFor(new SimpleActorProtocol())

      const address1 = actor1.address()
      const address2 = actor2.address()
      const address3 = actor3.address()

      // Wait for actors to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up all actors
      const found1 = await stage().actorOf(address1)
      const found2 = await stage().actorOf(address2)
      const found3 = await stage().actorOf(address3)

      expect(found1).toBeDefined()
      expect(found2).toBeDefined()
      expect(found3).toBeDefined()

      expect(found1?.address().equals(address1)).toBe(true)
      expect(found2?.address().equals(address2)).toBe(true)
      expect(found3?.address().equals(address3)).toBe(true)
    })

    it('should return the same proxy instance for the same address', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up the actor twice
      const found1 = await stage().actorOf(address)
      const found2 = await stage().actorOf(address)

      // Should be the exact same object reference
      expect(found1).toBe(found2)
    })
  })

  describe('actorOf - functional proxy', () => {
    it('should return a functional proxy that can receive messages', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Set a value through the original reference
      await actor.setValue('test-value')

      // Wait for message to be processed
      await new Promise(resolve => setTimeout(resolve, 20))

      // Look up the actor and read the value
      const foundActor = await stage().actorOf(address) as SimpleActor
      expect(foundActor).toBeDefined()

      const value = await foundActor!.getValue()
      expect(value).toBe('test-value')
    })

    it('should allow sending messages through the looked-up proxy', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up the actor and send a message
      const foundActor = await stage().actorOf(address) as SimpleActor
      expect(foundActor).toBeDefined()

      await foundActor!.setValue('new-value')
      await new Promise(resolve => setTimeout(resolve, 20))

      // Verify through original reference
      const value = await actor.getValue()
      expect(value).toBe('new-value')
    })
  })

  describe('actorOf - lifecycle integration', () => {
    it('should not find stopped actors', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify actor can be found
      const found1 = await stage().actorOf(address)
      expect(found1).toBeDefined()

      // Stop the actor
      await actor.stop()
      expect(actor.isStopped()).toBe(true)

      // Wait for stop to complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should no longer be in directory
      const found2 = await stage().actorOf(address)
      expect(found2).toBeUndefined()
    })

    it('should remove child actors from directory when parent stops', async () => {
      const parent: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const child: SimpleActor = stage().actorFor(new SimpleActorProtocol(), parent)

      const parentAddress = parent.address()
      const childAddress = child.address()

      // Wait for actors to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Both should be in directory
      const foundParent = await stage().actorOf(parentAddress)
      const foundChild = await stage().actorOf(childAddress)
      expect(foundParent).toBeDefined()
      expect(foundChild).toBeDefined()

      // Stop parent (should cascade to child)
      await parent.stop()

      // Wait for stop to complete
      await new Promise(resolve => setTimeout(resolve, 20))

      // Neither should be in directory
      const foundParent2 = await stage().actorOf(parentAddress)
      const foundChild2 = await stage().actorOf(childAddress)
      expect(foundParent2).toBeUndefined()
      expect(foundChild2).toBeUndefined()
    })

    it('should handle lookup of actor that is stopping', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Start stopping the actor (don't await)
      const stopPromise = actor.stop()

      // Try to look up during stop (may or may not be found depending on timing)
      const found = await stage().actorOf(address)
      // No assertion - timing dependent

      // Wait for stop to complete
      await stopPromise
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should definitely not be found after stop completes
      const found2 = await stage().actorOf(address)
      expect(found2).toBeUndefined()
    })
  })

  describe('actorOf - address equality', () => {
    it('should find actor using address from proxy', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up using the address we got from the proxy
      const found = await stage().actorOf(address)
      expect(found).toBeDefined()
      expect(found?.address().equals(address)).toBe(true)
    })

    it('should use address.valueAsString() for lookup', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()
      const addressString = address.valueAsString()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up the actor
      const found = await stage().actorOf(address)
      expect(found).toBeDefined()

      // Verify the address string matches
      expect(found?.address().valueAsString()).toBe(addressString)
    })
  })

  describe('actorOf - concurrent access', () => {
    it('should handle concurrent lookups of same actor', async () => {
      const actor: SimpleActor = stage().actorFor(new SimpleActorProtocol())
      const address = actor.address()

      // Wait for actor to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Perform multiple concurrent lookups
      const lookups = await Promise.all([
        stage().actorOf(address),
        stage().actorOf(address),
        stage().actorOf(address),
        stage().actorOf(address),
        stage().actorOf(address)
      ])

      // All should find the actor
      lookups.forEach(found => {
        expect(found).toBeDefined()
        expect(found?.address().equals(address)).toBe(true)
      })

      // All should be the same instance
      const first = lookups[0]
      lookups.forEach(found => {
        expect(found).toBe(first)
      })
    })

    it('should handle concurrent creation and lookup', async () => {
      // Create multiple actors concurrently
      const actors = await Promise.all([
        Promise.resolve(stage().actorFor(new SimpleActorProtocol())),
        Promise.resolve(stage().actorFor(new SimpleActorProtocol())),
        Promise.resolve(stage().actorFor(new SimpleActorProtocol()))
      ]) as SimpleActor[]

      const addresses = actors.map(a => a.address())

      // Wait for actors to start
      await new Promise(resolve => setTimeout(resolve, 10))

      // Look up all actors concurrently
      const found = await Promise.all(
        addresses.map(addr => stage().actorOf(addr))
      )

      // All should be found
      found.forEach((f, i) => {
        expect(f).toBeDefined()
        expect(f?.address().equals(addresses[i])).toBe(true)
      })
    })
  })
})
