// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

/**
 * Shared types for the Bank example application.
 */

/**
 * Type of bank account.
 */
export enum AccountType {
  Checking = 'checking',
  Savings = 'savings'
}

/**
 * Information about a bank account.
 */
export interface AccountInfo {
  accountNumber: string
  owner: string
  type: AccountType
  balance: number
  createdAt: Date
}

/**
 * A single transaction record.
 */
export interface Transaction {
  id: string
  type: 'deposit' | 'withdrawal' | 'transfer-in' | 'transfer-out' | 'refund'
  amount: number
  balance: number
  timestamp: Date
  description: string
  refundReason?: string  // Only populated for refund transactions
}

/**
 * Result of a transfer operation.
 */
export interface TransferResult {
  success: boolean
  transactionId?: string
  error?: string
  fromBalance?: number
  toBalance?: number
}

/**
 * Status of a transfer in progress.
 */
export type TransferStatus = 'withdrawn' | 'completed' | 'failed-withdrawal' | 'failed-deposit' | 'refunded'

/**
 * A pending transfer (funds withdrawn, waiting for deposit).
 */
export interface PendingTransfer {
  transactionId: string
  fromAccountNumber: string
  toAccountNumber: string
  amount: number
  status: TransferStatus
  withdrawnAt: Date
  attempts?: number
}
