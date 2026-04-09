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
 * Supervisor for Account and TransactionHistory actors.
 *
 * Handles account-specific failures with appropriate recovery strategies.
 * - Resume for business errors (insufficient funds, invalid amounts)
 * - Restart for state corruption or unexpected errors
 */
export class AccountSupervisor extends DefaultSupervisor {
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
    this.logger().log(`${highlight} Account Supervisor on behalf of ${supervised.actor().type()}`)
    this.logger().log(explained)
    this.logger().log(`${highlight}`)
    this.logger().log('**********************************************************************')

    // Call parent to apply the directive
    await super.inform(error, supervised)
  }

  protected decideDirective(
    error: Error,
    _supervised: Supervised,
    _strategy: SupervisionStrategy
  ): SupervisionDirective {
    // Always Resume
    return SupervisionDirective.Resume
  }
}
