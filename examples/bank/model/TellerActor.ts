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

import { Actor, ActorProtocol } from 'domo-actors'
import { AccountType } from '../types.js'
import {
  Bank,
  Teller,
  OpenAccountRequest,
  DepositRequest,
  WithdrawalRequest,
  TransferRequest,
  AccountSummaryRequest,
  TransactionHistoryRequest
} from './BankTypes.js'

/**
 * Teller actor implementation.
 *
 * Demonstrates "let it crash" philosophy:
 * - Throws errors for invalid input (NaN, undefined, null, etc.)
 * - Supervisor catches errors and displays appropriate messages
 * - Actor continues processing after supervisor resumes it
 */
export class TellerActor extends Actor implements Teller {
  constructor(private bank: Bank) {
    super()
  }

  async openAccount(request: OpenAccountRequest): Promise<string> {
    const initialBalance = parseFloat(request.initialBalance)

    const accountType = request.accountType.toLowerCase()

    const type = accountType === 'savings' ? AccountType.Savings : AccountType.Checking

    const accountNumber = await this.bank.openAccount(request.owner.trim(), type, initialBalance)

    return `✅ Account opened successfully with account id: ${accountNumber}`
  }

  async deposit(request: DepositRequest): Promise<number> {
    const amount = parseFloat(request.amount)

    const balance = await this.bank.deposit(request.accountNumber, amount)

    return balance
  }

  async withdraw(request: WithdrawalRequest): Promise<number> {
    const amount = parseFloat(request.amount)

    const balance = await this.bank.withdraw(request.accountNumber, amount)

    return balance
  }

  async transfer(request: TransferRequest): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const amount = parseFloat(request.amount)

    return await this.bank.transfer(request.fromAccountNumber, request.toAccountNumber, amount)
  }

  async accountSummary(request: AccountSummaryRequest): Promise<string> {
    if (!request.accountNumber || request.accountNumber.trim() === '') {
      throw new Error('Account ID cannot be empty')
    }

    const info = await this.bank.accountSummary(request.accountNumber.trim())
    if (!info) {
      throw new Error(`Account not found: ${request.accountNumber}`)
    }

    return `
┌─────────────────────────────────────────────────────────
│ Account: ${info.accountNumber.padEnd(24)}
├─────────────────────────────────────────────────────────
│ Owner:   ${info.owner.padEnd(24)}
│ Type:    ${info.type.padEnd(24)}
│ Balance: $${info.balance.toFixed(2).padEnd(23)}
│ Created: ${info.createdAt.toISOString().substring(0, 19).padEnd(23)}
└─────────────────────────────────────────────────────────`
  }

  async transactionHistory(request: TransactionHistoryRequest): Promise<string> {
    if (!request.accountNumber || request.accountNumber.trim() === '') {
      throw new Error('Account ID cannot be empty')
    }

    const limit = request.limit ? parseInt(request.limit) : undefined
    if (request.limit && isNaN(limit!)) {
      throw new Error(`Invalid limit: "${request.limit}" is not a number`)
    }

    const history = await this.bank.transactionHistory(request.accountNumber.trim(), limit)

    if (history.length === 0) {
      return 'No transactions found'
    }

    let result = `\nShowing ${history.length} transaction(s):\n\n`

    for (const tx of history) {
      result += `┌─────────────────────────────────────────────────────────\n`
      result += `│ ID:          ${tx.id.padEnd(42)}\n`
      result += `│ Type:        ${tx.type.padEnd(42)}\n`
      result += `│ Amount:      $${tx.amount.toFixed(2).padEnd(41)}\n`
      result += `│ Balance:     $${tx.balance.toFixed(2).padEnd(41)}\n`
      result += `│ Timestamp:   ${tx.timestamp.toISOString().substring(0, 19).padEnd(42)}\n`
      result += `│ Description: ${tx.description.padEnd(42)}\n`
      if (tx.refundReason) {
        result += `│ Refund:      ${tx.refundReason.substring(0, 42).padEnd(42)}\n`
      }
      result += `└─────────────────────────────────────────────────────────\n\n`
    }

    return result
  }

  async allAccounts(): Promise<string> {
    const accounts = await this.bank.allAccounts()

    if (accounts.length === 0) {
      return 'No accounts found'
    }

    let result = `\nFound ${accounts.length} account(s):\n\n`

    for (const info of accounts) {
      result += `┌─────────────────────────────────────────────────────────\n`
      result += `│ ${info.accountNumber.padEnd(35)}\n`
      result += `│ Owner:   ${info.owner.padEnd(25)}\n`
      result += `│ Type:    ${info.type.padEnd(25)}\n`
      result += `│ Balance: $${info.balance.toFixed(2).padEnd(24)}\n`
      result += `└─────────────────────────────────────────────────────────\n\n`
    }

    return result
  }

  async pendingTransfers(): Promise<string> {
    const pending = await this.bank.pendingTransfers()

    if (pending.length === 0) {
      return 'No pending transfers'
    }

    let result = `\nFound ${pending.length} pending transfer(s):\n\n`

    for (const transfer of pending) {
      result += `┌─────────────────────────────────────────────────────────\n`
      result += `│ Transaction: ${transfer.transactionId.padEnd(36)}\n`
      result += `│ From:        ${transfer.fromAccountNumber.padEnd(36)}\n`
      result += `│ To:          ${transfer.toAccountNumber.padEnd(36)}\n`
      result += `│ Amount:      $${transfer.amount.toFixed(2).padEnd(35)}\n`
      result += `│ Status:      ${transfer.status.padEnd(36)}\n`
      result += `│ Withdrawn:   ${transfer.withdrawnAt.toISOString().substring(0, 19).padEnd(36)}\n`
      result += `│ Attempts:    ${(transfer.attempts || 0).toString().padEnd(36)}\n`
      result += `└─────────────────────────────────────────────────────────\n\n`
    }

    return result
  }

  async beforeStart(): Promise<void> {
    console.log(`Teller: Before Start: I am collaborating with: ${this.bank.type()}`)
    this.executionContext().collaborators([this.bank as ActorProtocol])
  }
}
