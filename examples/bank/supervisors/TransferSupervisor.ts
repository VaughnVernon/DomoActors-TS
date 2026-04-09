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
 * Supervisor for TransferCoordinator actor.
 *
 * Handles transfer coordination failures with appropriate recovery strategies.
 * - Resume for account lookup failures, validation errors, deposit failures
 * - Restart for state corruption or unexpected errors
 */
export class TransferSupervisor extends DefaultSupervisor {
  constructor() {
    super()
  }

  async inform(error: Error, supervised: Supervised): Promise<void> {
    // Access the ExecutionContext from the supervised actor's environment
    const executionContext = supervised.actor().lifeCycle().environment().getCurrentMessageExecutionContext()
    const command = executionContext.getValue<string>('command') || 'unknown'
    const request = executionContext.getValue<any>('request') || undefined
    let additionalDetails = 'None'
    const message = error.message.toLowerCase()

    if (message.includes('account not found') || message.includes('not registered')) {
      additionalDetails = 'Non-existing account.'
    } else if (message.includes('must be different accounts')) {
      additionalDetails = 'The from-account and to-account are the same but must be different.'
    } else if (message.includes('max retries') || message.includes('deposit failed')) {
      additionalDetails = 'The transfer to the to-account failed and the bank will now reconcile the from account by issuing a refune.'
    } else {
      additionalDetails = 'An undetected error occurred, which requires special action.'
    }

    const highlight = '***'
    const explained = failureExplanation(error, command, request, additionalDetails, highlight)

    this.logger().log('**********************************************************************')
    this.logger().log(`${highlight} Transfer Supervisor on behalf of ${supervised.actor().type()}`)
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