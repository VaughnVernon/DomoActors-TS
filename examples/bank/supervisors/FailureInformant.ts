// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import {
  RequestType,
  OpenAccountRequest,
  DepositRequest,
  WithdrawalRequest,
  TransferRequest,
  AccountSummaryRequest,
  TransactionHistoryRequest
 }
  from '../model/BankTypes'

  /**
   * Answers the explanation for the specific runtime failure.
   * @param cause the root cause Error
   * @param command the command that was executed when the failure occurred
   * @param request the request payload of the command
   * @param moreDetails the string with contextually detailed informration
   * @param highlight the string to prepend to each line of descriptive text
   */
export const failureExplanation = function(
    cause: Error,
    command: string,
    request: any,
    moreDetails: string,
    highlight: string)
: string {

  switch (command.trim()) {
    case RequestType.OpenAccount:
      return openAccountFailure(cause, request as OpenAccountRequest, moreDetails, highlight)

    case RequestType.Deposit:
      return depositFailure(cause, request as DepositRequest, moreDetails, highlight)

    case RequestType.Withdraw:
      return withdrawalFailure(cause, request as WithdrawalRequest, moreDetails, highlight)

    case RequestType.Transfer:
      return transferFailure(cause, request as TransferRequest, moreDetails, highlight)

    case RequestType.AccountSummary:
      return accountSummaryFailure(cause, request as AccountSummaryRequest, moreDetails, highlight)

    case RequestType.TransactionHistory:
      return transactionHistoryFailure(cause, request as TransactionHistoryRequest, moreDetails, highlight)

    case RequestType.AllAccounts:
      return heading(command.trim(), highlight) + `${highlight}   An undetermined failure occurred.`

    case RequestType.PendingTransfers:
      return heading(command.trim(), highlight) + `${highlight}   An undetermined failure occurred.`

    default:
      break
  }

  return heading(`Unknown: ${command.trim()}`, highlight) + `${highlight}   The failure seems to be out of scope.`
}

const heading = function (
  command: string,
  highlight: string
): string {
  return `${highlight} During ${command} the operation failed due to:\n`
}

const openAccountFailure = function (
    cause: Error,
    request: OpenAccountRequest,
    moreDetails: string,
    highlight: string
): string {

  let explained = heading(RequestType.OpenAccount, highlight)

  const causeDetails = cause.message.toLowerCase().includes('monetary') ?
        'Must enter a positive monetary value for initial deposit (e.g. 100.00).' :
        'Must enter a valid owner name and account type.'

  explained =
    explained.concat(`${highlight}           Owner: ${request.owner}\n`)
             .concat(`${highlight}    Account Type: ${request.accountType}\n`)
             .concat(`${highlight} Initial Balance: ${request.initialBalance}\n`)
             .concat(`${highlight}\n`)
             .concat(`${highlight}           Error: ${causeDetails}\n`)
             .concat(`${highlight}            More: ${moreDetails}`)

  return explained
}

const depositFailure = function (
    cause: Error,
    request: DepositRequest,
    moreDetails: string,
    highlight: string
): string {
  let explained = heading(RequestType.Deposit, highlight)

  const causeDetails = cause.message.includes('monetary') ?
        'Must enter a positive monetary value for deposit (e.g. 100.00).' :
        'Must enter a valid account number.'

  explained =
    explained.concat(`${highlight} Account: ${request.accountNumber}\n`)
             .concat(`${highlight}  Amount: ${request.amount}\n`)
             .concat(`${highlight}\n`)
             .concat(`${highlight}   Error: ${causeDetails}\n`)
             .concat(`${highlight}    More: ${moreDetails}`)

  return explained
}

const withdrawalFailure = function (
    cause: Error,
    request: WithdrawalRequest,
    moreDetails: string,
    highlight: string
): string {
  let explained = heading(RequestType.Withdraw, highlight)

  const causeDetails = cause.message.includes('monetary') ?
        'Must enter a positive monetary value for withdraw (e.g. 100.00).' :
        'Must enter a valid account number.'

  explained =
    explained.concat(`${highlight} Account: ${request.accountNumber}\n`)
             .concat(`${highlight}  Amount: ${request.amount}\n`)
             .concat(`${highlight}\n`)
             .concat(`${highlight}   Error: ${causeDetails}\n`)
             .concat(`${highlight}    More: ${moreDetails}`)

  return explained
}

const transferFailure = function (
    cause: Error,
    request: TransferRequest,
    moreDetails: string,
    highlight: string
): string {
  let explained = heading(RequestType.Withdraw, highlight)

  const causeDetails = cause.message.includes('monetary') ?
        'Must enter a positive monetary value for transfer that is less than the account balance (e.g. 10.00).' :
        'Must enter valid from-account and to-account numbers that are different accounts.'

  explained =
        explained.concat(`${highlight} From Account: ${request.fromAccountNumber}\n`)
                 .concat(`${highlight}   To Account: ${request.toAccountNumber}\n`)
                 .concat(`${highlight}       Amount: ${request.amount}\n`)
                 .concat(`${highlight}\n`)
                 .concat(`${highlight}        Error: ${causeDetails}\n`)
                 .concat(`${highlight}         More: ${moreDetails}`)

  return explained
}

const accountSummaryFailure = function(
    cause: Error,
    request: AccountSummaryRequest,
    moreDetails: string,
    highlight: string
): string {
  let explained = heading(RequestType.AccountSummary, highlight)

  const causeDetails = 'Must enter a valid account number.'

  explained =
        explained.concat(`${highlight} Account: ${request.accountNumber}\n`)
                 .concat(`${highlight}\n`)
                 .concat(`${highlight}   Error: ${causeDetails}\n`)
                 .concat(`${highlight}    More: ${moreDetails}`)

  return explained
}

const transactionHistoryFailure = function(
    cause: Error,
    request: TransactionHistoryRequest,
    moreDetails: string,
    highlight: string
): string {
  let explained = heading(RequestType.AccountSummary, highlight)

  const causeDetails = 'Must enter a valid account number and maximum transaction count to retrieve.'

  explained =
        explained.concat(`${highlight}     Account: ${request.accountNumber}\n`)
                 .concat(`${highlight} Limit Count: ${request.limit}\n`)
                 .concat(`${highlight}\n`)
                 .concat(`${highlight}       Cause: ${causeDetails}\n`)
                 .concat(`${highlight}        More: ${moreDetails}`)
  return explained
}
