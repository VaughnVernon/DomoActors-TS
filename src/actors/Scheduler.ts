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
 * Callback interface for scheduled notifications.
 * Implementations handle one-time or repeating interval notifications.
 *
 * @template T The type of data associated with each notification
 */
export interface Scheduled<T> {
  /**
   * Sent when a one-time or repeating interval is reached.
   *
   * @param scheduled The Scheduled instance generating the notification
   * @param data The data associated with this notification
   */
  intervalSignal(scheduled: Scheduled<T>, data: T): void
}

/**
 * Interface for operations that may be cancelled.
 */
export interface Cancellable {
  /**
   * Attempts to cancel the operation.
   *
   * @returns true if cancelled successfully, false otherwise
   */
  cancel(): boolean
}

/**
 * Scheduler for one-time and repeating tasks.
 * Uses JavaScript timers (setTimeout/setInterval) for scheduling.
 */
export interface Scheduler {
  /**
   * Schedules a repeating task with an initial delay.
   *
   * @param scheduled The callback to invoke on each interval
   * @param data The data to pass to the callback
   * @param delayBefore Initial delay in milliseconds before first execution
   * @param interval Interval in milliseconds between subsequent executions
   * @returns A Cancellable that can be used to stop the scheduled task
   */
  schedule<T>(scheduled: Scheduled<T>, data: T, delayBefore: number, interval: number): Cancellable

  /**
   * Schedules a one-time task with a delay.
   *
   * @param scheduled The callback to invoke
   * @param data The data to pass to the callback
   * @param delayBefore Delay in milliseconds before execution
   * @param interval Not used for one-time tasks (included for API compatibility)
   * @returns A Cancellable that can be used to stop the scheduled task
   */
  scheduleOnce<T>(scheduled: Scheduled<T>, data: T, delayBefore: number, interval: number): Cancellable

  /**
   * Closes the scheduler and cancels all pending tasks.
   */
  close(): void
}

/**
 * Internal implementation of Cancellable for scheduled tasks.
 * Wraps JavaScript timeout/interval IDs and provides cancellation.
 */
class ScheduledTask implements Cancellable {
  private _timeoutId?: ReturnType<typeof setTimeout>
  private _intervalId?: ReturnType<typeof setInterval>
  private _cancelled: boolean = false

  /**
   * Creates a new scheduled task wrapper.
   * @param timeoutId Optional timeout ID from setTimeout
   * @param intervalId Optional interval ID from setInterval
   */
  constructor(timeoutId?: ReturnType<typeof setTimeout>, intervalId?: ReturnType<typeof setInterval>) {
    this._timeoutId = timeoutId
    this._intervalId = intervalId
  }

  /**
   * Cancels the scheduled task by clearing timeout/interval.
   * Idempotent - subsequent calls return false.
   * @returns true if cancelled successfully, false if already cancelled
   */
  cancel(): boolean {
    if (this._cancelled) {
      return false
    }

    this._cancelled = true

    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId)
      this._timeoutId = undefined
    }

    if (this._intervalId !== undefined) {
      clearInterval(this._intervalId)
      this._intervalId = undefined
    }

    return true
  }

  /**
   * Returns whether this task has been cancelled.
   * @returns true if cancelled, false otherwise
   */
  isCancelled(): boolean {
    return this._cancelled
  }
}

/**
 * Default implementation of Scheduler using JavaScript timers.
 * Tracks all scheduled tasks and supports graceful shutdown.
 */
export class DefaultScheduler implements Scheduler {
  private _tasks: Set<ScheduledTask> = new Set()
  private _closed: boolean = false

  /**
   * Schedules a repeating task with an initial delay.
   *
   * @param scheduled The callback to invoke on each interval
   * @param data The data to pass to the callback
   * @param delayBefore Initial delay in milliseconds before first execution
   * @param interval Interval in milliseconds between subsequent executions
   * @returns A Cancellable that can be used to stop the scheduled task
   * @throws Error if scheduler is closed
   */
  schedule<T>(scheduled: Scheduled<T>, data: T, delayBefore: number, interval: number): Cancellable {
    if (this._closed) {
      throw new Error('Scheduler is closed')
    }

    const task = new ScheduledTask()
    this._tasks.add(task)

    const execute = () => {
      if (!task.isCancelled() && !this._closed) {
        try {
          scheduled.intervalSignal(scheduled, data)
        } catch (error) {
          console.error('Error in scheduled task:', error)
        }
      }
    }

    if (delayBefore > 0) {
      // Initial delay before starting the interval
      const timeoutId = setTimeout(() => {
        if (!task.isCancelled() && !this._closed) {
          execute()
          // Start the interval after initial execution
          const intervalId = setInterval(execute, interval);

          (task as any)._intervalId = intervalId
        }
      }, delayBefore);

      (task as any)._timeoutId = timeoutId
    } else {
      // No initial delay, start interval immediately
      const intervalId = setInterval(execute, interval);
      (task as any)._intervalId = intervalId
    }

    return task
  }

  /**
   * Schedules a one-time task with a delay.
   *
   * @param scheduled The callback to invoke
   * @param data The data to pass to the callback
   * @param delayBefore Delay in milliseconds before execution
   * @param _interval Not used for one-time tasks (included for API compatibility)
   * @returns A Cancellable that can be used to stop the scheduled task
   * @throws Error if scheduler is closed
   */
  scheduleOnce<T>(scheduled: Scheduled<T>, data: T, delayBefore: number, _interval: number): Cancellable {
    if (this._closed) {
      throw new Error('Scheduler is closed')
    }

    const task = new ScheduledTask()
    this._tasks.add(task)

    const timeoutId = setTimeout(() => {
      if (!task.isCancelled() && !this._closed) {
        try {
          scheduled.intervalSignal(scheduled, data)
        } catch (error) {
          console.error('Error in scheduled task:', error)
        }
        this._tasks.delete(task)
      }
    }, delayBefore);

    (task as any)._timeoutId = timeoutId

    return task
  }

  /**
   * Closes the scheduler and cancels all pending tasks.
   * Idempotent - subsequent calls are no-ops.
   */
  close(): void {
    if (this._closed) {
      return
    }

    this._closed = true

    // Cancel all pending tasks
    for (const task of this._tasks) {
      task.cancel()
    }

    this._tasks.clear()
  }

  /**
   * Returns whether this scheduler is closed.
   * @returns true if closed, false otherwise
   */
  isClosed(): boolean {
    return this._closed
  }
}
