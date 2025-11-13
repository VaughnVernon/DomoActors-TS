// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { ActorProtocol } from 'domo-actors'
import { AccountInfo, AccountType, PendingTransfer, Transaction, TransferResult, TransferStatus } from '../types.js'

/**
 * Request types offered by the Bank via the Teller.
 */
export enum RequestType {
  OpenAccount = 'Open Account',
  Deposit = 'Deposit',
  Withdraw = 'Withdraw',
  Transfer = 'Transfer',
  AccountSummary = 'Account Summary',
  TransactionHistory = 'Transaction History',
  AllAccounts = 'All Accounts',
  PendingTransfers = 'Pending Transfers'
}

/**
 * User input for open account command.
 */
export interface OpenAccountRequest {
  owner: string
  accountType: string
  initialBalance: string
}

/**
 * User input for deposit command.
 */
export interface DepositRequest {
  accountNumber: string
  amount: string
}

/**
 * User input for withdrawal command.
 */
export interface WithdrawalRequest {
  accountNumber: string
  amount: string
}

/**
 * User input for transfer command.
 */
export interface TransferRequest {
  fromAccountNumber: string
  toAccountNumber: string
  amount: string
}

/**
 * User input for account summary command.
 */
export interface AccountSummaryRequest {
  accountNumber: string
}

/**
 * User input for transaction history command.
 */
export interface TransactionHistoryRequest {
  accountNumber: string
  limit?: string
}

/**
 * Protocol for bank account operations.
 */
export interface Account extends ActorProtocol {
  /**
   * Deposits money into the account.
   * @param amount Amount to deposit
   * @returns New balance
   */
  deposit(amount: number): Promise<number>

  /**
   * Withdraws money from the account.
   * @param amount Amount to withdraw
   * @returns New balance
   * @throws Error if insufficient funds
   */
  withdraw(amount: number): Promise<number>

  /**
   * Gets current account balance.
   * @returns Current balance
   */
  getBalance(): Promise<number>

  /**
   * Gets account information.
   * @returns Account info
   */
  getInfo(): Promise<AccountInfo>

  /**
   * Refunds money to the account (e.g., from failed transfer).
   * @param amount Amount to refund
   * @param transactionId Original transaction ID
   * @param reason Reason for refund
   * @returns New balance
   */
  refund(amount: number, transactionId: string, reason: string): Promise<number>

  /**
   * Gets transaction history.
   * @param limit Maximum number of transactions to return
   * @returns Transaction history
   */
  getHistory(limit?: number): Promise<Transaction[]>
}

/**
 * Protocol for bank operations.
 *
 * Top-level coordinator for the banking system.
 */
export interface Bank extends ActorProtocol {
  /**
   * Opens a new bank account.
   * @param owner Account owner name
   * @param accountType Type of account
   * @param initialBalance Initial balance
   * @returns Account Number
   */
  openAccount(
    owner: string,
    accountType: AccountType,
    initialBalance: number
  ): Promise<string>

  /**
   * Deposits money into the account.
   * @param accountNumber Account Number
   * @param amount Amount to deposit
   * @returns New balance
   * @throws Error if wrong input
   */
  deposit(accountNumber: string, amount: number): Promise<number>

  /**
   * Withdraws money from the account.
   * @param accountNumber Account Number
   * @param amount Amount to withdraw
   * @returns New balance
   * @throws Error if wrong input or insufficient funds
   */
  withdraw(accountNumber: string, amount: number): Promise<number>

  /**
   * Gets an account actor reference (for teller operations).
   * @param accountNumber Account Number
   * @returns Account actor or undefined
   */
  account(accountNumber: string): Promise<Account | undefined>

  /**
   * Gets account summary information.
   * @param accountNumber Account Number
   * @returns Account info or undefined
   */
  accountSummary(accountNumber: string): Promise<AccountInfo | undefined>

  /**
   * Gets current account balance.
   * @param accountNumber Account Number
   * @returns Account balance or undefined if account not found
   */
  accountBalance(accountNumber: string): Promise<number | undefined>

  /**
   * Lists all accounts.
   * @returns Array of account info
   */
  allAccounts(): Promise<AccountInfo[]>

  /**
   * Transfers money between accounts.
   * @param fromAccountNumber Source account Number
   * @param toAccountNumber Destination account Number
   * @param amount Amount to transfer
   * @returns Transfer result with transaction Number
   */
  transfer(
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: number
  ): Promise<TransferResult>

  /**
   * Gets transaction history for an account.
   * @param accountNumber Account Number
   * @param limit Maximum number of transactions
   * @returns Transaction history
   */
  transactionHistory(accountNumber: string, limit?: number): Promise<Transaction[]>

  /**
   * Gets pending transfers.
   * @returns Array of pending transfers
   */
  pendingTransfers(): Promise<PendingTransfer[]>
}

/**
 * Protocol for Teller operations.
 *
 * Handles CLI commands with validation and error handling through supervision.
 * All parsing errors and invalid inputs will crash the teller,
 * allowing the supervisor to handle error reporting.
 */
export interface Teller extends ActorProtocol {
  /**
   * Open a new account (command 1).
   * @param request User input
   * @returns Account Number
   */
  openAccount(request: OpenAccountRequest): Promise<string>

  /**
   * Deposit money (command 2).
   * @param request User input
   * @returns New balance
   */
  deposit(request: DepositRequest): Promise<number>

  /**
   * Withdraw money (command 3).
   * @param request User input
   * @returns New balance
   */
  withdraw(request: WithdrawalRequest): Promise<number>

  /**
   * Transfer money (command 4).
   * @param request User input
   * @returns Transaction Number or error message
   */
  transfer(request: TransferRequest): Promise<{ success: boolean; transactionId?: string; error?: string }>

  /**
   * View account summary (command 5).
   * @param request User input
   * @returns Account info formatted for display
   */
  accountSummary(request: AccountSummaryRequest): Promise<string>

  /**
   * View transaction history (command 6).
   * @param request User input
   * @returns Transaction history formatted for display
   */
  transactionHistory(request: TransactionHistoryRequest): Promise<string>

  /**
   * List all accounts (command 7).
   * @returns All accounts formatted for display
   */
  allAccounts(): Promise<string>

  /**
   * View pending transfers (command 8).
   * @returns Pending transfers formatted for display
   */
  pendingTransfers(): Promise<string>
}

/**
 * Protocol for transaction history management.
 *
 * Maintains an immutable transaction log for an account.
 * All state changes go through self-messaging to ensure proper
 * actor model semantics.
 */
export interface TransactionHistory extends ActorProtocol {
  /**
   * Records a new transaction.
   * @param transaction The transaction to record
   */
  recordTransaction(transaction: Transaction): Promise<void>

  /**
   * Gets transaction history.
   * @param limit Maximum number of transactions to return (defaults to all)
   * @returns Array of transactions, newest first
   */
  getHistory(limit?: number): Promise<Transaction[]>

  /**
   * Gets the current balance from transaction history.
   * @returns Current balance
   */
  getBalance(): Promise<number>

  /**
   * Internal: appends transaction to history (self-send).
   * @param transaction The transaction to append
   */
  appendTransaction(transaction: Transaction): Promise<void>
}

/**
 * Protocol for coordinating transfers between accounts.
 *
 * Implements realistic banking transfer flow:
 * 1. Withdraw from source account (separate transaction)
 * 2. Record pending state (self-send)
 * 3. Attempt deposit to destination (self-send)
 * 4. Retry on failure with exponential backoff (self-send)
 * 5. Refund to source if max retries exceeded (self-send)
 */
export interface TransferCoordinator extends ActorProtocol {
  /**
   * Registers an account with the coordinator.
   * @param accountNumber Account Number
   * @param account Account actor reference
   */
  registerAccount(accountNumber: string, account: Account): Promise<void>

  /**
   * Initiates a transfer between accounts.
   * @param fromAccountNumber Source account Number
   * @param toAccountNumber Destination account Number
   * @param amount Amount to transfer
   * @returns Transaction ID
   */
  initiateTransfer(fromAccountNumber: string, toAccountNumber: string, amount: number): Promise<string>

  /**
   * Gets the status of a transfer.
   * @param transactionId Transaction ID
   * @returns Transfer status or undefined if not found
   */
  getTransferStatus(transactionId: string): Promise<TransferStatus | undefined>

  /**
   * Gets all pending transfers.
   * @returns Array of pending transfers
   */
  getPendingTransfers(): Promise<PendingTransfer[]>

  /**
   * Internal: Records a pending transfer (self-send).
   * @param transfer Pending transfer info
   */
  recordPendingTransfer(transfer: PendingTransfer): Promise<void>

  /**
   * Internal: Attempts to deposit to destination account (self-send).
   * @param transactionId Transaction ID
   */
  attemptDeposit(transactionId: string): Promise<void>

  /**
   * Internal: Handles deposit failure with retry logic (self-send).
   * @param transactionId Transaction ID
   * @param reason Failure reason
   */
  handleDepositFailure(transactionId: string, reason: string): Promise<void>

  /**
   * Internal: Processes refund to source account (self-send).
   * @param transactionId Transaction ID
   * @param reason Refund reason
   */
  processRefund(transactionId: string, reason: string): Promise<void>

  /**
   * Internal: Completes a transfer (self-send).
   * @param transactionId Transaction ID
   */
  completeTransfer(transactionId: string): Promise<void>
}
