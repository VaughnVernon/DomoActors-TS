// Copyright © 2012-2025 Vaughn Vernon. All rights reserved.
// Copyright © 2012-2025 Kalele, Inc. All rights reserved.
//
// Licensed under the Reciprocal Public License 1.5
//
// See: LICENSE.md in repository root directory
// See: https://opensource.org/license/rpl-1-5

import { describe, it, expect } from 'vitest'
import { stage } from '@/actors/Stage'
import { Actor } from '@/actors/Actor'
import { Definition } from '@/actors/Definition'
import { Protocol, ProtocolInstantiator } from '@/actors/Protocol'

// ============================================================================
// Test Types and Interfaces
// ============================================================================

interface Database {
  connectionString: string
  query(sql: string): Promise<any[]>
}

class MockDatabase implements Database {
  constructor(public connectionString: string) {}

  async query(sql: string): Promise<any[]> {
    return [{ result: sql }]
  }
}

interface Config {
  apiKey: string
  maxRetries: number
  timeout: number
}

// ============================================================================
// Test Actor that uses registered values
// ============================================================================

interface ValueConsumer {
  getRegisteredDatabase(): Promise<Database>
  getRegisteredConfig(): Promise<Config>
}

class ValueConsumerActor extends Actor implements ValueConsumer {
  async getRegisteredDatabase(): Promise<Database> {
    return this.stage().registeredValue<Database>('test:database:actor')
  }

  async getRegisteredConfig(): Promise<Config> {
    return this.stage().registeredValue<Config>('test:config:actor')
  }
}

const ValueConsumerProtocol: Protocol = {
  instantiator(): ProtocolInstantiator {
    return class {
      static instantiate(_definition: Definition): Actor {
        return new ValueConsumerActor()
      }

      constructor(definition: Definition) {
        return ValueConsumerProtocol.instantiator().instantiate(definition) as any
      }
    }
  },

  type(): string {
    return 'ValueConsumer'
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage Value Registry', () => {
  describe('Basic registration and retrieval', () => {
    it('should register and retrieve a simple object', () => {
      const config: Config = {
        apiKey: 'test-key-123',
        maxRetries: 3,
        timeout: 5000
      }

      stage().registerValue<Config>('test:config:simple', config)
      const retrieved = stage().registeredValue<Config>('test:config:simple')

      expect(retrieved).toBe(config)
      expect(retrieved.apiKey).toBe('test-key-123')
      expect(retrieved.maxRetries).toBe(3)
      expect(retrieved.timeout).toBe(5000)
    })

    it('should register and retrieve a class instance', () => {
      const db = new MockDatabase('postgresql://localhost:5432/testdb')

      stage().registerValue<Database>('test:database:class', db)
      const retrieved = stage().registeredValue<Database>('test:database:class')

      expect(retrieved).toBe(db)
      expect(retrieved.connectionString).toBe('postgresql://localhost:5432/testdb')
    })

    it('should register and retrieve primitive values', () => {
      stage().registerValue<string>('test:name:prim', 'MyApplication')
      stage().registerValue<number>('test:version:prim', 1.5)
      stage().registerValue<boolean>('test:debug:prim', true)

      expect(stage().registeredValue<string>('test:name:prim')).toBe('MyApplication')
      expect(stage().registeredValue<number>('test:version:prim')).toBe(1.5)
      expect(stage().registeredValue<boolean>('test:debug:prim')).toBe(true)
    })

    it('should register and retrieve arrays', () => {
      const allowedHosts = ['localhost', 'example.com', 'api.example.com']

      stage().registerValue<string[]>('test:hosts:array', allowedHosts)
      const retrieved = stage().registeredValue<string[]>('test:hosts:array')

      expect(retrieved).toBe(allowedHosts)
      expect(retrieved).toHaveLength(3)
      expect(retrieved[1]).toBe('example.com')
    })

    it('should register and retrieve functions', () => {
      const logger = (message: string) => `[LOG] ${message}`

      stage().registerValue<(msg: string) => string>('test:logger:func', logger)
      const retrieved = stage().registeredValue<(msg: string) => string>('test:logger:func')

      expect(retrieved).toBe(logger)
      expect(retrieved('test')).toBe('[LOG] test')
    })
  })

  describe('Multiple values', () => {
    it('should handle multiple registered values independently', () => {
      const db = new MockDatabase('postgresql://localhost:5432/db')
      const config: Config = { apiKey: 'key1', maxRetries: 5, timeout: 3000 }
      const appName = 'TestApp'

      stage().registerValue<Database>('test:database:multi', db)
      stage().registerValue<Config>('test:config:multi', config)
      stage().registerValue<string>('test:name:multi', appName)

      expect(stage().registeredValue<Database>('test:database:multi')).toBe(db)
      expect(stage().registeredValue<Config>('test:config:multi')).toBe(config)
      expect(stage().registeredValue<string>('test:name:multi')).toBe(appName)
    })

    it('should support namespaced keys', () => {
      const db1 = new MockDatabase('db1')
      const db2 = new MockDatabase('db2')

      stage().registerValue<Database>('test:app1:database', db1)
      stage().registerValue<Database>('test:app2:database', db2)

      expect(stage().registeredValue<Database>('test:app1:database').connectionString).toBe('db1')
      expect(stage().registeredValue<Database>('test:app2:database').connectionString).toBe('db2')
    })
  })

  describe('Overwriting values', () => {
    it('should allow overwriting a previously registered value', () => {
      const config1: Config = { apiKey: 'key1', maxRetries: 3, timeout: 1000 }
      const config2: Config = { apiKey: 'key2', maxRetries: 5, timeout: 2000 }

      stage().registerValue<Config>('test:config:overwrite', config1)
      expect(stage().registeredValue<Config>('test:config:overwrite')).toBe(config1)

      stage().registerValue<Config>('test:config:overwrite', config2)
      expect(stage().registeredValue<Config>('test:config:overwrite')).toBe(config2)
      expect(stage().registeredValue<Config>('test:config:overwrite').apiKey).toBe('key2')
    })

    it('should allow replacing value with different type', () => {
      stage().registerValue<string>('test:value:replace', 'string-value')
      expect(stage().registeredValue<string>('test:value:replace')).toBe('string-value')

      stage().registerValue<number>('test:value:replace', 42)
      expect(stage().registeredValue<number>('test:value:replace')).toBe(42)
    })
  })

  describe('Error handling', () => {
    it('should throw error when retrieving non-existent value', () => {
      expect(() => {
        stage().registeredValue<string>('test:nonexistent:key1')
      }).toThrow('No value registered with name: test:nonexistent:key1')
    })

    it('should throw error with correct message for different keys', () => {
      expect(() => {
        stage().registeredValue<Database>('test:error:database')
      }).toThrow('No value registered with name: test:error:database')

      expect(() => {
        stage().registeredValue<Config>('test:error:config')
      }).toThrow('No value registered with name: test:error:config')
    })

    it('should not throw when value exists', () => {
      stage().registerValue<string>('test:exists:name', 'TestApp')

      expect(() => {
        stage().registeredValue<string>('test:exists:name')
      }).not.toThrow()
    })
  })

  describe('Actor integration', () => {
    it('should allow actors to access registered values via stage()', async () => {
      const db = new MockDatabase('postgresql://localhost:5432/testdb')
      const config: Config = { apiKey: 'secret-key', maxRetries: 3, timeout: 5000 }

      stage().registerValue<Database>('test:database:actor', db)
      stage().registerValue<Config>('test:config:actor', config)

      const consumer: ValueConsumer = stage().actorFor(ValueConsumerProtocol)

      const retrievedDb = await consumer.getRegisteredDatabase()
      const retrievedConfig = await consumer.getRegisteredConfig()

      expect(retrievedDb).toBe(db)
      expect(retrievedDb.connectionString).toBe('postgresql://localhost:5432/testdb')
      expect(retrievedConfig).toBe(config)
      expect(retrievedConfig.apiKey).toBe('secret-key')
    })

    it('should share registered values across multiple actors', async () => {
      const db = new MockDatabase('shared-db')
      stage().registerValue<Database>('test:database:shared', db)

      const config: Config = { apiKey: 'shared-key', maxRetries: 1, timeout: 1000 }
      stage().registerValue<Config>('test:config:shared', config)

      // Update actor to use shared keys
      class SharedConsumer extends Actor {
        async getDb() { return this.stage().registeredValue<Database>('test:database:shared') }
        async getConfig() { return this.stage().registeredValue<Config>('test:config:shared') }
      }

      const SharedProtocol: Protocol = {
        instantiator: () => ({ instantiate: () => new SharedConsumer() }),
        type: () => 'SharedConsumer'
      }

      const consumer1 = stage().actorFor<any>(SharedProtocol)
      const consumer2 = stage().actorFor<any>(SharedProtocol)

      const db1 = await consumer1.getDb()
      const db2 = await consumer2.getDb()
      const config1 = await consumer1.getConfig()
      const config2 = await consumer2.getConfig()

      expect(db1).toBe(db2)
      expect(db1).toBe(db)
      expect(config1).toBe(config2)
      expect(config1).toBe(config)
    })
  })

  describe('Complex scenarios', () => {
    it('should handle nested objects', () => {
      const complexConfig = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'secret'
          }
        },
        cache: {
          ttl: 300,
          maxSize: 1000
        }
      }

      stage().registerValue('test:complex:config', complexConfig)
      const retrieved = stage().registeredValue<typeof complexConfig>('test:complex:config')

      expect(retrieved).toBe(complexConfig)
      expect(retrieved.database.credentials.username).toBe('admin')
      expect(retrieved.cache.ttl).toBe(300)
    })

    it('should handle Map instances', () => {
      const serviceMap = new Map<string, string>()
      serviceMap.set('auth', 'http://auth-service:8080')
      serviceMap.set('users', 'http://user-service:8081')
      serviceMap.set('orders', 'http://order-service:8082')

      stage().registerValue<Map<string, string>>('test:services:map', serviceMap)
      const retrieved = stage().registeredValue<Map<string, string>>('test:services:map')

      expect(retrieved).toBe(serviceMap)
      expect(retrieved.get('auth')).toBe('http://auth-service:8080')
      expect(retrieved.size).toBe(3)
    })

    it('should handle Set instances', () => {
      const allowedRoles = new Set(['admin', 'user', 'guest'])

      stage().registerValue<Set<string>>('test:roles:set', allowedRoles)
      const retrieved = stage().registeredValue<Set<string>>('test:roles:set')

      expect(retrieved).toBe(allowedRoles)
      expect(retrieved.has('admin')).toBe(true)
      expect(retrieved.has('superuser')).toBe(false)
      expect(retrieved.size).toBe(3)
    })

    it('should handle async functions', async () => {
      const asyncFetcher = async (url: string) => {
        return { data: `fetched from ${url}` }
      }

      stage().registerValue<typeof asyncFetcher>('test:fetcher:async', asyncFetcher)
      const retrieved = stage().registeredValue<typeof asyncFetcher>('test:fetcher:async')

      const result = await retrieved('http://example.com')
      expect(result.data).toBe('fetched from http://example.com')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty string as key', () => {
      stage().registerValue<string>('test:edge:empty', 'empty-key-value')
      expect(stage().registeredValue<string>('test:edge:empty')).toBe('empty-key-value')
    })

    it('should handle null values', () => {
      stage().registerValue<null>('test:edge:null', null)
      expect(stage().registeredValue<null>('test:edge:null')).toBeNull()
    })

    it('should handle undefined values', () => {
      stage().registerValue<undefined>('test:edge:undefined', undefined)
      expect(stage().registeredValue<undefined>('test:edge:undefined')).toBeUndefined()
    })

    it('should handle special characters in keys', () => {
      const keys = [
        'test:config/prod',
        'test.config.dev',
        'test_config_test',
        'test-config-staging',
        'test::config::nested'
      ]

      keys.forEach((key, index) => {
        stage().registerValue<number>(key, index)
        expect(stage().registeredValue<number>(key)).toBe(index)
      })
    })

    it('should distinguish between similar keys', () => {
      stage().registerValue<string>('test:similar:config', 'value1')
      stage().registerValue<string>('test:similar:configs', 'value2')
      stage().registerValue<string>('test:similar:config2', 'value3')
      stage().registerValue<string>('test:similar2:config', 'value4')

      expect(stage().registeredValue<string>('test:similar:config')).toBe('value1')
      expect(stage().registeredValue<string>('test:similar:configs')).toBe('value2')
      expect(stage().registeredValue<string>('test:similar:config2')).toBe('value3')
      expect(stage().registeredValue<string>('test:similar2:config')).toBe('value4')
    })
  })

  describe('Type safety', () => {
    it('should maintain type information through generics', () => {
      const config: Config = { apiKey: 'key', maxRetries: 3, timeout: 1000 }
      stage().registerValue<Config>('test:type:config', config)

      const retrieved = stage().registeredValue<Config>('test:type:config')
      expect(retrieved.apiKey).toBeDefined()
      expect(retrieved.maxRetries).toBeDefined()
      expect(retrieved.timeout).toBeDefined()
    })

    it('should handle union types', () => {
      type StringOrNumber = string | number

      stage().registerValue<StringOrNumber>('test:union:value1', 'string')
      stage().registerValue<StringOrNumber>('test:union:value2', 42)

      expect(stage().registeredValue<StringOrNumber>('test:union:value1')).toBe('string')
      expect(stage().registeredValue<StringOrNumber>('test:union:value2')).toBe(42)
    })
  })

  describe('Practical use cases', () => {
    it('should support database connection pool pattern', () => {
      class ConnectionPool {
        constructor(
          public readonly maxConnections: number,
          public readonly connectionString: string
        ) {}

        async getConnection() {
          return new MockDatabase(this.connectionString)
        }
      }

      const pool = new ConnectionPool(10, 'postgresql://localhost:5432/db')
      stage().registerValue<ConnectionPool>('test:pool:db', pool)

      const retrieved = stage().registeredValue<ConnectionPool>('test:pool:db')
      expect(retrieved).toBe(pool)
      expect(retrieved.maxConnections).toBe(10)
    })

    it('should support configuration object pattern', () => {
      interface AppConfig {
        env: 'development' | 'staging' | 'production'
        database: {
          host: string
          port: number
        }
        api: {
          baseUrl: string
          timeout: number
        }
      }

      const config: AppConfig = {
        env: 'production',
        database: {
          host: 'db.example.com',
          port: 5432
        },
        api: {
          baseUrl: 'https://api.example.com',
          timeout: 5000
        }
      }

      stage().registerValue<AppConfig>('test:appconfig:full', config)
      const retrieved = stage().registeredValue<AppConfig>('test:appconfig:full')

      expect(retrieved.env).toBe('production')
      expect(retrieved.database.host).toBe('db.example.com')
      expect(retrieved.api.baseUrl).toBe('https://api.example.com')
    })

    it('should support service registry pattern', () => {
      interface UserService {
        findById(id: string): Promise<any>
      }

      interface OrderService {
        findByUserId(userId: string): Promise<any[]>
      }

      const userService: UserService = {
        async findById(id: string) {
          return { id, name: 'Test User' }
        }
      }

      const orderService: OrderService = {
        async findByUserId(userId: string) {
          return [{ id: '1', userId }]
        }
      }

      stage().registerValue<UserService>('test:services:user', userService)
      stage().registerValue<OrderService>('test:services:order', orderService)

      const retrievedUserService = stage().registeredValue<UserService>('test:services:user')
      const retrievedOrderService = stage().registeredValue<OrderService>('test:services:order')

      expect(retrievedUserService).toBe(userService)
      expect(retrievedOrderService).toBe(orderService)
    })
  })

  describe('Deregistration', () => {
    it('should deregister a value and return it', () => {
      const config: Config = { apiKey: 'key', maxRetries: 3, timeout: 1000 }
      stage().registerValue<Config>('test:dereg:config1', config)

      const removed = stage().deregisterValue<Config>('test:dereg:config1')

      expect(removed).toBe(config)
      expect(removed?.apiKey).toBe('key')
    })

    it('should return undefined when deregistering non-existent value', () => {
      const removed = stage().deregisterValue<string>('test:dereg:nonexistent')

      expect(removed).toBeUndefined()
    })

    it('should throw error when accessing deregistered value', () => {
      stage().registerValue<string>('test:dereg:value', 'test')

      const removed = stage().deregisterValue<string>('test:dereg:value')
      expect(removed).toBe('test')

      expect(() => {
        stage().registeredValue<string>('test:dereg:value')
      }).toThrow('No value registered with name: test:dereg:value')
    })

    it('should allow re-registering after deregistration', () => {
      const value1 = 'first value'
      const value2 = 'second value'

      stage().registerValue<string>('test:dereg:reregister', value1)
      const removed = stage().deregisterValue<string>('test:dereg:reregister')
      expect(removed).toBe(value1)

      stage().registerValue<string>('test:dereg:reregister', value2)
      const retrieved = stage().registeredValue<string>('test:dereg:reregister')
      expect(retrieved).toBe(value2)
    })

    it('should return undefined when deregistering same value twice', () => {
      stage().registerValue<string>('test:dereg:twice', 'value')

      const removed1 = stage().deregisterValue<string>('test:dereg:twice')
      expect(removed1).toBe('value')

      const removed2 = stage().deregisterValue<string>('test:dereg:twice')
      expect(removed2).toBeUndefined()
    })

    it('should deregister complex objects', () => {
      const db = new MockDatabase('postgresql://localhost:5432/db')
      stage().registerValue<Database>('test:dereg:database', db)

      const removed = stage().deregisterValue<Database>('test:dereg:database')

      expect(removed).toBe(db)
      expect(removed?.connectionString).toBe('postgresql://localhost:5432/db')
    })

    it('should support cleanup pattern with deregister', () => {
      // Simulate a resource with cleanup
      let cleanupCalled = false
      const resource = {
        value: 'test',
        close: () => { cleanupCalled = true }
      }

      stage().registerValue('test:dereg:cleanup', resource)

      // Deregister and cleanup
      const removed = stage().deregisterValue<typeof resource>('test:dereg:cleanup')
      if (removed) {
        removed.close()
      }

      expect(cleanupCalled).toBe(true)
    })

    it('should not affect other registered values', () => {
      stage().registerValue<string>('test:dereg:keep1', 'keep1')
      stage().registerValue<string>('test:dereg:remove', 'remove')
      stage().registerValue<string>('test:dereg:keep2', 'keep2')

      stage().deregisterValue<string>('test:dereg:remove')

      expect(stage().registeredValue<string>('test:dereg:keep1')).toBe('keep1')
      expect(stage().registeredValue<string>('test:dereg:keep2')).toBe('keep2')
      expect(() => {
        stage().registeredValue<string>('test:dereg:remove')
      }).toThrow()
    })

    it('should handle deregistering null values', () => {
      stage().registerValue<null>('test:dereg:null', null)

      const removed = stage().deregisterValue<null>('test:dereg:null')

      expect(removed).toBeNull()
    })

    it('should handle deregistering undefined values', () => {
      stage().registerValue<undefined>('test:dereg:undefined', undefined)

      const removed = stage().deregisterValue<undefined>('test:dereg:undefined')

      expect(removed).toBeUndefined()
    })

    it('should work with type inference', () => {
      interface CustomType {
        id: number
        name: string
      }

      const obj: CustomType = { id: 1, name: 'test' }
      stage().registerValue<CustomType>('test:dereg:typed', obj)

      const removed = stage().deregisterValue<CustomType>('test:dereg:typed')

      // TypeScript should infer the type
      expect(removed?.id).toBe(1)
      expect(removed?.name).toBe('test')
    })
  })
})
