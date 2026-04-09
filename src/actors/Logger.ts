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
 * Logger interface for actor system logging.
 *
 * Provides fluent API for logging at different levels.
 * All methods return the logger instance for method chaining.
 *
 * Actors access the logger via `this.logger()` in their methods.
 */
export interface Logger {
  /**
   * Logs a debug message.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  debug(... args: any): Logger

  /**
   * Logs an error message.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  error(... args: any): Logger

  /**
   * Logs an info message.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  info(... args: any): Logger

  /**
   * Logs a general message.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  log(... args: any): Logger
}

/**
 * Console-based logger implementation.
 *
 * Delegates to standard console methods (console.debug, console.error, etc.).
 * Provides fluent API by returning this from all methods.
 */
class ConsoleLogger implements Logger {
  /**
   * Logs a debug message to console.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  debug(...args: any): Logger {
    console.debug(...args)
    return this
  }

  /**
   * Logs an error message to console.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  error(...args: any): Logger {
    console.error(...args)
    return this
  }

  /**
   * Logs an info message to console.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  info(...args: any): Logger {
    console.info(...args)
    return this
  }

  /**
   * Logs a general message to console.
   * @param args Arguments to log
   * @returns This logger for chaining
   */
  log(...args: any): Logger {
    console.log(...args)
    return this
  }
}

/**
 * Default logger instance used by the actor system.
 * Uses ConsoleLogger implementation.
 */
export const DefaultLogger = new ConsoleLogger()