import { vi } from 'vitest'

interface QueryChainOptions {
  executeResult?: unknown
  executeResults?: unknown[]
  executeTakeFirstResult?: unknown
  executeTakeFirstResults?: unknown[]
}

type QueryChain = Record<string, unknown> & {
  execute: ReturnType<typeof vi.fn>
  executeTakeFirst: ReturnType<typeof vi.fn>
}

/**
 * Builds a lightweight fluent query mock for extension-local route tests.
 *
 * @param options - Queued results returned by terminal query methods.
 * @returns Fluent query chain stub.
 */
export const createQueryChain = (options: QueryChainOptions = {}): QueryChain => {
  const chain: QueryChain = {} as QueryChain
  const expressionBuilder = (...args: unknown[]) => ({ args })
  expressionBuilder.or = (items: unknown[]) => items

  const fluentMethods = [
    'innerJoin',
    'where',
    'select',
    'orderBy'
  ]

  for (const method of fluentMethods) {
    chain[method] = vi.fn((...args: unknown[]) => {
      if (args.length > 0 && typeof args[0] === 'function') {
        try {
          ;(args[0] as (value: typeof expressionBuilder) => unknown)(expressionBuilder)
        } catch {
          // No-op in fluent test helpers.
        }
      }

      return chain
    })
  }

  const executeQueue = [...(options.executeResults ?? [])]
  const executeTakeFirstQueue = [...(options.executeTakeFirstResults ?? [])]

  chain.execute = vi.fn(async () => {
    if (executeQueue.length > 0) {
      return executeQueue.shift()
    }

    return options.executeResult ?? []
  })

  chain.executeTakeFirst = vi.fn(async () => {
    if (executeTakeFirstQueue.length > 0) {
      return executeTakeFirstQueue.shift()
    }

    return options.executeTakeFirstResult
  })

  return chain
}
