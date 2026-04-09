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
