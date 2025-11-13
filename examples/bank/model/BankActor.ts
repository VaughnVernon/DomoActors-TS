// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor, ActorProtocol, Definition, Protocol } from 'domo-actors'
import { AccountType, AccountInfo, TransferResult, Transaction, PendingTransfer } from '../types.js'
import { Account, Bank, TransferCoordinator } from './BankTypes.js'
import { AccountActor } from './AccountActor.js'
import { TransferCoordinatorActor } from './TransferCoordinatorActor.js'

/**
 * Bank actor implementation.
 *
 * Root coordinator that:
 * - Creates and manages account actors
 * - Maintains a transfer coordinator for all transfers
 * - Routes operations to appropriate child actors
 */
export class BankActor extends Actor implements Bank {
  private accounts = new Map<string, Account>()
  private transferCoordinator!: TransferCoordinator
  private nextAccountNumber = 1

  constructor() {
    super()
  }

  async openAccount(
    owner: string,
    accountType: AccountType,
    initialBalance: number
  ): Promise<string> {
    if (Number.isNaN(initialBalance) || initialBalance < 0) {
      const value = initialBalance ? initialBalance.toString() : 'unknown'
      throw new Error(`Initial balance must be a positive monetary value: ${value}`)
    }

    const accountNumber = this.generateAccountNumber()

    // Create account actor as child
    const accountProtocol: Protocol = {
      type: () => 'Account',
      instantiator: () => ({
        instantiate: (definition: Definition) => {
          const params = definition.parameters()
          return new AccountActor(
            params[0],  // accountNumber
            params[1],  // owner
            params[2],  // accountType
            params[3]   // initialBalance
          )
        }
      })
    }

    const accountDefinition = new Definition(
      'Account',
      this.address(),  // Not used, stage generates new address
      [accountNumber, owner, accountType, initialBalance]
    )

    const account = this.childActorFor<Account>(accountProtocol, accountDefinition, 'account-supervisor')

    // Register with bank and transfer coordinator
    this.accounts.set(accountNumber, account)
    this.executionContext().collaborators([account as ActorProtocol])
    await this.transferCoordinator.registerAccount(accountNumber, account)

    this.logger().log(
      `Account opened: ${accountNumber} (${owner}, ${accountType}, $${initialBalance.toFixed(2)})`
    )

    return accountNumber
  }

  async account(accountNumber: string): Promise<Account | undefined> {
    return this.accounts.get(accountNumber)
  }

  async deposit(accountNumber: string, amount: number): Promise<number> {
    if (isNaN(amount)) {
      const value = amount ? amount.toString() : 'unknown'
      throw new Error(`Deposit amount must be a positive monetary value: ${value}`)
    }

    if (!accountNumber || accountNumber.trim() === '') {
      throw new Error('Account Number is required')
    }

    const account = await this.account(accountNumber.trim())
    if (!account) {
      throw new Error(`Account does not exist: ${accountNumber}`)
    }

    return account.deposit(amount)
  }

  async withdraw(accountNumber: string, amount: number): Promise<number> {
    if (isNaN(amount)) {
      const value = amount ? amount.toString() : 'unknown'
      throw new Error(`Withdraw amount must be a positive monetary value: ${value}`)
    }

    if (!accountNumber || accountNumber.trim() === '') {
      throw new Error('Account Number is required')
    }

    const account = await this.account(accountNumber.trim())
    if (!account) {
      throw new Error(`Account does not exist: ${accountNumber}`)
    }

    return account.withdraw(amount)
  }

  async accountSummary(accountNumber: string): Promise<AccountInfo | undefined> {
    const account = this.accounts.get(accountNumber)
    if (!account) {
      return undefined
    }
    return account.getInfo()
  }

  async accountBalance(accountNumber: string): Promise<number | undefined> {
    const account = this.accounts.get(accountNumber)
    if (!account) {
      return undefined
    }
    return account.getBalance()
  }

  async allAccounts(): Promise<AccountInfo[]> {
    const infos: AccountInfo[] = []
    for (const account of this.accounts.values()) {
      infos.push(await account.getInfo())
    }
    return infos
  }

  async transfer(
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: number
  ): Promise<TransferResult> {
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: "${amount}" is not a number`)
    }

    fromAccountNumber = fromAccountNumber ? fromAccountNumber.trim() : ''
    if (fromAccountNumber === '') {
      throw new Error('Source account number is required')
    }

    toAccountNumber = toAccountNumber ? toAccountNumber.trim() : ''
    if (toAccountNumber === '') {
      throw new Error('Destination account number is required')
    }

    try {
      const transactionId = await this.transferCoordinator.initiateTransfer(
        fromAccountNumber,
        toAccountNumber,
        amount
      )

      return {
        success: true,
        transactionId
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }

  async transactionHistory(accountNumber: string, limit?: number): Promise<Transaction[]> {
    const account = this.accounts.get(accountNumber)
    if (!account) {
      throw new Error(`Account not found: ${accountNumber}`)
    }
    return account.getHistory(limit)
  }

  async pendingTransfers(): Promise<PendingTransfer[]> {
    return this.transferCoordinator.getPendingTransfers()
  }

  async beforeStart(): Promise<void> {
    // Create long-lived transfer coordinator as child actor
    const transferCoordinatorProtocol: Protocol = {
      type: () => 'TransferCoordinator',
      instantiator: () => ({
        instantiate: () => new TransferCoordinatorActor()
      })
    }

    const transferCoordinatorDefinition = new Definition(
      'TransferCoordinator',
      this.address(),  // Not used, stage generates new address
      []
    )

    this.transferCoordinator = this.childActorFor<TransferCoordinator>(
      transferCoordinatorProtocol,
      transferCoordinatorDefinition,
      'transfer-supervisor'
    )

    this.executionContext().collaborators([this.transferCoordinator as ActorProtocol])

    this.logger().log('Bank initialized with TransferCoordinator')
  }

  private generateAccountNumber(): string {
    const accountNumber = this.nextAccountNumber++
    return `ACC${accountNumber.toString().padStart(6, '0')}`
  }
}
