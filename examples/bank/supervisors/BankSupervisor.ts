// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

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
