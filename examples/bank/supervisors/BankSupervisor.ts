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

import {
  DefaultSupervisor,
  SupervisionDirective,
  SupervisionStrategy,
  Supervised
} from 'domo-actors'

import { failureExplanation } from './FailureInformant'

/**
 * Bank Supervisor.
 *
 * Demonstrates "let it crash" philosophy:
 * - All parsing errors and validation failures crash the teller
 * - Supervisor catches errors and accesses ExecutionContext for context
 * - Supervisor prints user-friendly, context-aware error messages
 * - Actor is resumed to continue serving the next command
 *
 * This is the proper actor model approach: let actors fail fast,
 * and let supervisors handle recovery and error reporting.
 */
export class BankSupervisor extends DefaultSupervisor {
  constructor() {
    super()
  }

  async inform(error: Error, supervised: Supervised): Promise<void> {
    // Access the ExecutionContext from the supervised actor's environment
    const executionContext = supervised.actor().lifeCycle().environment().getCurrentMessageExecutionContext()
    const command = executionContext.getValue<string>('command') || 'unknown'
    const request = executionContext.getValue<any>('request') || undefined

    const highlight = '***'
    const explained = failureExplanation(error, command, request, 'None', highlight)

    this.logger().log('**********************************************************************')
    this.logger().log(`${highlight} Bank Supervisor on behalf of ${supervised.actor().type()}`)
    this.logger().log(explained)
    this.logger().log(`${highlight}`)
    this.logger().log('**********************************************************************')

    // Call parent to apply the directive
    await super.inform(error, supervised)
  }

  protected decideDirective(
    error: Error,
    supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {
    // Always Resume
    return SupervisionDirective.Resume
  }
}
