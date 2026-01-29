// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor } from "../Actor.js"
import { ActorProtocol } from "../ActorProtocol.js"
import { Address } from "../Address.js"
import { ArrayMailbox } from "../ArrayMailbox.js"
import { DeadLetters } from "../DeadLetters.js"
import { Definition } from "../Definition.js"
import { Environment } from "../Environment.js"
import { EmptyExecutionContext, ExecutionContext } from "../ExecutionContext.js"
import { LifeCycle } from "../LifeCycle.js"
import { DefaultLogger, Logger } from "../Logger.js"
import { Protocol } from "../Protocol.js"
import { Scheduler } from "../Scheduler.js"
import { stage } from "../Stage.js"
import { StageInternal } from "../StageInternal.js"

/**
 * No-op test implementation of Address.
 * Returns fixed values for all methods, suitable for testing scenarios
 * where the actual address value doesn't matter.
 */
class TestAddress implements Address {
  private _value = "test-address-123"

  /**
   * Returns the address as a string.
   * @returns Fixed test address string
   */
  valueAsString(): string {
    return this._value
  }

  /**
   * Returns the address value with generic type.
   * @returns Fixed test address
   */
  value<T>(): T {
    return this._value as T
  }

  /**
   * Compares this address with another by string value.
   * @param other The address to compare with
   * @returns true if addresses are equal, false otherwise
   */
  equals(other: Address): boolean {
    return this.valueAsString() === other.valueAsString()
  }

  /**
   * Returns a fixed hash code for this test address.
   * @returns Fixed hash code value 123
   */
  hashCode(): number {
    return 123
  }

  /**
   * Returns a string representation of this test address.
   * @returns Formatted string with address value
   */
  toString(): string {
    return "TestAddress: " + this._value
  }
}

/**
 * No-op test implementation of Definition.
 * Creates a minimal definition with type "TestActor" and no parameters.
 */
class TestDefinition extends Definition {
  /**
   * Creates a test definition with fixed values.
   */
  constructor() {
    super("TestActor", new TestAddress(), [])
  }
}

/**
 * No-op test implementation of Environment.
 * Creates a minimal environment with test implementations of all dependencies.
 */
class TestEnvironment extends Environment {
  /**
   * Creates a test environment with fixed test dependencies.
   */
  constructor() {
    super(stage() as StageInternal, new TestAddress(), new TestDefinition(), new TestActorProtocol(), new ArrayMailbox(), DefaultLogger)
  }
}

/**
 * No-op test implementation of ActorProtocol.
 * Useful for testing when you need a simple actor that doesn't do anything.
 * All methods return safe default values or no-op implementations.
 */
export class TestActorProtocol extends LifeCycle implements ActorProtocol {
  private testAddress: Address
  private testDefinition: Definition

  /**
   * Creates a new test actor protocol with test environment and dependencies.
   */
  constructor() {
    const testEnvironment = new TestEnvironment()
    super(testEnvironment)
    this.testAddress = new TestAddress()
    this.testDefinition = new TestDefinition()
  }

  /**
   * Returns undefined as no actual actor instance exists.
   * @returns undefined
   */
  actor(): Actor {
    return undefined as any
  }

  /**
   * Returns the test address for this actor.
   * @returns Test address instance
   */
  address(): Address {
    return this.testAddress
  }

  /**
   * Creates a child actor (returns another TestActorProtocol).
   * @returns New test actor protocol instance
   */
  childActorFor<T>(_protocol: Protocol, _definition: Definition, _supervisorName?: string): T {
    return new TestActorProtocol() as any
  }

  /**
   * Returns a no-op dead letters implementation.
   * @returns Mock dead letters instance
   */
  deadLetters(): DeadLetters {
    return {
      failedDelivery: () => {}
    } as any
  }

  /**
   * Returns the test definition.
   * @returns Test definition instance
   */
  definition(): Definition {
    return this.testDefinition
  }

  executionContext(): ExecutionContext {
    return EmptyExecutionContext
  }

  /**
   * Returns this instance as the lifecycle.
   * @returns This test actor protocol
   */
  lifeCycle(): LifeCycle {
    return this
  }

  /**
   * Returns the default logger.
   * @returns Default logger instance
   */
  logger(): Logger {
    return DefaultLogger
  }

  /**
   * Returns a new test actor protocol as the parent.
   * @returns New test actor protocol instance
   */
  parent(): ActorProtocol {
    return new TestActorProtocol() as any as ActorProtocol
  }

  /**
   * Returns an empty scheduler mock.
   * @returns Mock scheduler instance
   */
  scheduler(): Scheduler {
    return {} as Scheduler
  }

  /**
   * Returns an empty stage mock.
   * @returns Mock stage instance
   */
  stage(): StageInternal {
    return {} as StageInternal
  }

  /**
   * No-op state snapshot implementation.
   * @param stateSnapshot Optional state to store (ignored)
   * @returns undefined when getting state
   */
  stateSnapshot<S>(stateSnapshot: S): void
  stateSnapshot<S>(): S
  stateSnapshot<S>(stateSnapshot?: S): void | S {
    if (stateSnapshot !== undefined) {
      return
    }
    return undefined as S
  }

  /**
   * Returns the actor type from definition.
   * @returns Actor type string ("TestActor")
   */
  type(): string {
    return this.definition().type()
  }

  /**
   * Always returns false for test implementation.
   * @param other Other actor to compare with
   * @returns false
   */
  equals(other: ActorProtocol): boolean {
    other as unknown
    return false
  }

  /**
   * Returns hash code from test address.
   * @returns Fixed hash code (123)
   */
  hashCode(): number {
    return this.address().hashCode()
  }

  /**
   * Returns string representation of this test actor.
   * @returns Formatted string with address
   */
  toString(): string {
    return "TestActorProtocol: [" + this.address().toString() + "]"
  }
}
