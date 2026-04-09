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

// ============================================================================
// Counter Protocol Interface
// ============================================================================

interface Counter {
  increment(): Promise<void>
  decrement(): Promise<void>
  getValue(): Promise<number>
  add(amount: number): Promise<number>
  reset(value?: number): Promise<void>
}

// ============================================================================
// Counter Actor Implementation
// ============================================================================

class CounterActor extends Actor implements Counter {
  private count: number

  constructor(initialValue: number = 0) {
    super()  // Retrieves Environment from Stage storage
    this.count = initialValue
  }

  async increment(): Promise<void> {
    this.count++
  }

  async decrement(): Promise<void> {
    this.count--
  }

  async getValue(): Promise<number> {
    return this.count
  }

  async add(amount: number): Promise<number> {
    this.count += amount
    return this.count
  }

  async reset(value: number = 0): Promise<void> {
    this.count = value
  }
}

// ============================================================================
// Counter Protocol Definition
// ============================================================================

export const CounterProtocol: Protocol = {
  instantiator(): ProtocolInstantiator {
    return class {
      static instantiate(definition: Definition): Actor {
        const params = definition.parameters()

        // Instantiate actor (retrieves environment from storage)
        const actor = new CounterActor(...params)

        return actor
      }

      constructor(definition: Definition) {
        return CounterProtocol.instantiator().instantiate(definition) as any
      }
    }
  },

  type(): string {
    return 'Counter'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Counter Actor', () => {
  it('should create a counter with default initial value', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol)

    const value = await counter.getValue()
    expect(value).toBe(0)
  })

  it('should create a counter with custom initial value', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol, undefined, undefined, 42)

    const value = await counter.getValue()
    expect(value).toBe(42)
  })

  it('should increment the counter', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol)

    await counter.increment()
    await counter.increment()
    await counter.increment()

    const value = await counter.getValue()
    expect(value).toBe(3)
  })

  it('should decrement the counter', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol, undefined, undefined, 10)

    await counter.decrement()
    await counter.decrement()

    const value = await counter.getValue()
    expect(value).toBe(8)
  })

  it('should add amount and return new value', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol, undefined, undefined, 5)

    const result1 = await counter.add(10)
    expect(result1).toBe(15)

    const result2 = await counter.add(3)
    expect(result2).toBe(18)

    const finalValue = await counter.getValue()
    expect(finalValue).toBe(18)
  })

  it('should reset to default value (0)', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol, undefined, undefined, 100)

    await counter.reset()

    const value = await counter.getValue()
    expect(value).toBe(0)
  })

  it('should reset to specific value', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol, undefined, undefined, 100)

    await counter.reset(50)

    const value = await counter.getValue()
    expect(value).toBe(50)
  })

  it('should handle multiple operations in sequence', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol)

    await counter.increment()        // 1
    await counter.increment()        // 2
    await counter.add(5)             // 7
    await counter.decrement()        // 6
    await counter.add(4)             // 10

    const value = await counter.getValue()
    expect(value).toBe(10)
  })

  it('should maintain state across async operations', async () => {
    const counter: Counter = stage().actorFor(CounterProtocol)

    // Fire off multiple operations
    const promises = [
      counter.increment(),
      counter.increment(),
      counter.increment(),
      counter.increment(),
      counter.increment(),
    ]

    await Promise.all(promises)

    const value = await counter.getValue()
    expect(value).toBe(5)
  })
})
