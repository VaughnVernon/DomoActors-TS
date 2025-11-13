// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { Actor, Scheduled } from 'domo-actors'
import { PendingTransfer, TransferStatus } from '../types.js'
import { Account, TransferCoordinator } from './BankTypes.js'

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000  // Base delay for exponential backoff

/**
 * Transfer coordinator actor implementation.
 *
 * Demonstrates sophisticated self-messaging patterns for state machine coordination.
 * All state changes go through self-sends to maintain actor model semantics.
 */
export class TransferCoordinatorActor extends Actor implements TransferCoordinator {
  private accounts = new Map<string, Account>()
  private pendingTransfers = new Map<string, PendingTransfer>()
  private self!: TransferCoordinator

  async beforeStart(): Promise<void> {
    // Get self-proxy for async self-messaging
    this.self = this.selfAs<TransferCoordinator>()
  }

  async registerAccount(accountNumber: string, account: Account): Promise<void> {
    this.accounts.set(accountNumber, account)
  }

  async initiateTransfer(
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: number
  ): Promise<string> {

    if (Number.isNaN(amount) || amount < 0) {
      const value = amount ? amount.toString() : 'unknown'
      throw new Error(`Transfer amount must be a positive monetary value: ${value}`)
    }

    if (!this.accounts.has(fromAccountNumber)) {
      const id = fromAccountNumber ? fromAccountNumber : '(missing account number)'
      throw new Error(`Transfer from account does not exist: ${id}`)
    }

    if (!this.accounts.has(toAccountNumber)) {
      const id = toAccountNumber ? toAccountNumber : '(missing account number)'
      throw new Error(`Transfer to account does not exist: ${id}`)
    }

    if (fromAccountNumber === toAccountNumber) {
      throw new Error(`Transfer from account and to account must be different accounts: ${fromAccountNumber} => ${toAccountNumber}`)
    }

    const transactionId = this.generateTransactionId()

    this.logger().log(
      `Initiating transfer ${transactionId}: $${amount.toFixed(2)} ` +
      `from ${fromAccountNumber} to ${toAccountNumber}`
    )

    // Step 1: Withdraw from source account
    const fromAccount = this.accounts.get(fromAccountNumber)
    if (!fromAccount) {
      throw new Error(`Source account not found: ${fromAccountNumber}`)
    }

    try {
      await fromAccount.withdraw(amount)
    } catch (error) {
      this.logger().error(`Transfer ${transactionId} failed: ${(error as Error).message}`)
      throw error
    }

    // Step 2: Self-send to record pending state (async message via mailbox)
    this.self.recordPendingTransfer({
      transactionId,
      fromAccountNumber,
      toAccountNumber,
      amount,
      status: 'withdrawn',
      withdrawnAt: new Date(),
      attempts: 0
    })

    // Step 3: Self-send to attempt deposit (async message via mailbox)
    this.self.attemptDeposit(transactionId)

    return transactionId
  }

  async recordPendingTransfer(transfer: PendingTransfer): Promise<void> {
    // Message handler - executes asynchronously when message processed
    this.pendingTransfers.set(transfer.transactionId, transfer)
    this.logger().log(
      `Transfer ${transfer.transactionId}: Funds withdrawn ($${transfer.amount.toFixed(2)}), pending deposit`
    )
  }

  async attemptDeposit(transactionId: string): Promise<void> {
    // Message handler - executes asynchronously
    const transfer = this.pendingTransfers.get(transactionId)
    if (!transfer) {
      this.logger().error(`Transfer not found: ${transactionId}`)
      return
    }

    const toAccount = this.accounts.get(transfer.toAccountNumber)
    if (!toAccount) {
      // Self-send to handle failure (async)
      this.self.handleDepositFailure(
        transactionId,
        `Destination account not found: ${transfer.toAccountNumber}`
      )
      return
    }

    try {
      await toAccount.deposit(transfer.amount)

      this.logger().log(
        `Transfer ${transactionId}: Deposit successful ($${transfer.amount.toFixed(2)})`
      )

      // Self-send to mark complete (async)
      this.self.completeTransfer(transactionId)

    } catch (error) {
      // Self-send to handle failure (async)
      this.self.handleDepositFailure(transactionId, (error as Error).message)
    }
  }

  async handleDepositFailure(transactionId: string, reason: string): Promise<void> {
    // Message handler - executes asynchronously
    const transfer = this.pendingTransfers.get(transactionId)
    if (!transfer) return

    const attempts = (transfer.attempts || 0) + 1
    transfer.attempts = attempts

    if (attempts < MAX_RETRY_ATTEMPTS) {
      // Retry: self-send to attempt deposit again (async) with exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, attempts - 1)
      this.logger().log(
        `Transfer ${transactionId}: Retry ${attempts}/${MAX_RETRY_ATTEMPTS} after ${delay}ms - ${reason}`
      )

      // Schedule retry with backoff using Scheduled interface
      const retryTask: Scheduled<string> = {
        intervalSignal: (_scheduled, txId) => {
          this.self.attemptDeposit(txId)
        }
      }
      this.scheduler().scheduleOnce(retryTask, transactionId, delay, 0)

    } else {
      // Max retries exceeded: self-send to process refund (async)
      this.logger().error(
        `Transfer ${transactionId}: Failed after ${MAX_RETRY_ATTEMPTS} attempts - ${reason}`
      )
      transfer.status = 'failed-deposit'
      this.self.processRefund(transactionId, reason)
    }
  }

  async processRefund(transactionId: string, reason: string): Promise<void> {
    // Message handler - executes asynchronously
    const transfer = this.pendingTransfers.get(transactionId)
    if (!transfer) return

    const fromAccount = this.accounts.get(transfer.fromAccountNumber)
    if (!fromAccount) {
      this.logger().error(
        `Cannot refund: Source account not found ${transfer.fromAccountNumber}`
      )
      return
    }

    const refundReason = `Transfer to ${transfer.toAccountNumber} failed: ${reason}. ` +
                         `Attempted ${MAX_RETRY_ATTEMPTS} times.`

    await fromAccount.refund(transfer.amount, transactionId, refundReason)

    this.logger().log(
      `Transfer ${transactionId}: Refunded $${transfer.amount.toFixed(2)} to ${transfer.fromAccountNumber}`
    )

    transfer.status = 'refunded'

    // Self-send to complete (removes from pending)
    this.self.completeTransfer(transactionId)
  }

  async completeTransfer(transactionId: string): Promise<void> {
    // Message handler - executes asynchronously
    const transfer = this.pendingTransfers.get(transactionId)
    if (transfer) {
      if (transfer.status === 'withdrawn') {
        transfer.status = 'completed'
      }
      this.pendingTransfers.delete(transactionId)
      this.logger().log(`Transfer ${transactionId}: Completed (status: ${transfer.status})`)
    }
  }

  async getTransferStatus(transactionId: string): Promise<TransferStatus | undefined> {
    const transfer = this.pendingTransfers.get(transactionId)
    return transfer?.status
  }

  async getPendingTransfers(): Promise<PendingTransfer[]> {
    return Array.from(this.pendingTransfers.values())
  }

  private generateTransactionId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }
}
