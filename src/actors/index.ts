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

/**
 * DomoActors - Production-ready Actor Model toolkit for TypeScript
 *
 * @packageDocumentation
 */

// Core Actor Model
export { Actor } from './Actor.js'
export { ActorProtocol } from './ActorProtocol.js'
export { Address } from './Address.js'
export { Stage, stage } from './Stage.js'
export { LocalStage } from './LocalStage.js'
export { Protocol, ProtocolInstantiator } from './Protocol.js'
export { Definition } from './Definition.js'

// Mailboxes
export { Mailbox } from './Mailbox.js'
export { ArrayMailbox } from './ArrayMailbox.js'
export { BoundedMailbox } from './BoundedMailbox.js'
export { OverflowPolicy } from './OverflowPolicy.js'

// Supervision
export {
  Supervisor,
  Supervised,
  SupervisionStrategy,
  SupervisionScope,
  SupervisionDirective,
  DefaultSupervisionStrategy
} from './Supervisor.js'
export { DefaultSupervisor } from './DefaultSupervisor.js'

// Lifecycle
export { LifeCycle } from './LifeCycle.js'

// Messaging
export { Message } from './Message.js'
export { DeadLetters, DeadLetter } from './DeadLetters.js'

// Addressing
export { Uuid7Address } from './Uuid7Address.js'

// Scheduling
export { Scheduler, Scheduled, Cancellable } from './Scheduler.js'

// Logging
export { Logger } from './Logger.js'

// Environment (primarily for advanced usage)
export { Environment } from './Environment.js'
export { ExecutionContext } from './ExecutionContext.js'

// State Management
export { ObservableState, ObservableStateProvider } from './ObservableState.js'

// TestKit - Testing utilities
export { TestDeadLettersListener } from './testkit/TestDeadLettersListener.js'
export { awaitObservableState, awaitStateValue, awaitAssert, AwaitOptions } from './testkit/TestAwaitAssist.js'
export { TestActorProtocol } from './testkit/TestTypes.js'

// Directory (advanced usage)
export { Directory, DirectoryConfig, DirectoryConfigs } from './Directory.js'
