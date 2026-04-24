import { afterEach, describe, expect, it } from 'vitest'
import {
  createWorkerScoreCacheKey,
  queueWorkerScoreRequest,
  resetWorkerScoreRequestQueue,
  WorkerScoreRequestSupersededError
} from '../../client/worker-request-queue.js'

describe('narrative quality worker request queue', () => {
  afterEach(() => {
    resetWorkerScoreRequestQueue()
  })

  it('reuses the same in-flight promise for identical requests', async () => {
    let executions = 0
    const cacheKey = createWorkerScoreCacheKey({
      text: 'same text',
      locale: 'en',
      question: 'same question',
      criteria: [{ label: 'same criterion', weight: 1 }],
      requestConfig: { mode: 'adaptive' }
    })

    const [first, second] = await Promise.all([
      queueWorkerScoreRequest(cacheKey, async () => {
        executions += 1
        await new Promise(resolve => setTimeout(resolve, 10))
        return { overallPercent: 42 }
      }),
      queueWorkerScoreRequest(cacheKey, async () => {
        executions += 1
        return { overallPercent: 99 }
      })
    ])

    expect(executions).toBe(1)
    expect(first).toEqual({ overallPercent: 42 })
    expect(second).toEqual({ overallPercent: 42 })
  })

  it('serializes distinct requests through one execution queue', async () => {
    const executionOrder: string[] = []

    const firstPromise = queueWorkerScoreRequest('first', async () => {
      executionOrder.push('first:start')
      await new Promise(resolve => setTimeout(resolve, 10))
      executionOrder.push('first:end')
      return 'first'
    })

    const secondPromise = queueWorkerScoreRequest('second', async () => {
      executionOrder.push('second:start')
      executionOrder.push('second:end')
      return 'second'
    })

    await Promise.all([firstPromise, secondPromise])

    expect(executionOrder).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end'
    ])
  })

  it('drops stale pending requests for the same target group', async () => {
    const executionOrder: string[] = []

    const activePromise = queueWorkerScoreRequest('active', async () => {
      executionOrder.push('active:start')
      await new Promise(resolve => setTimeout(resolve, 10))
      executionOrder.push('active:end')
      return 'active'
    }, {
      groupKey: 'target-a'
    })

    const stalePromise = queueWorkerScoreRequest('stale', async () => {
      executionOrder.push('stale:start')
      return 'stale'
    }, {
      groupKey: 'target-a'
    })

    const latestPromise = queueWorkerScoreRequest('latest', async () => {
      executionOrder.push('latest:start')
      executionOrder.push('latest:end')
      return 'latest'
    }, {
      groupKey: 'target-a'
    })

    await expect(stalePromise).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError)
    await Promise.all([activePromise, latestPromise])

    expect(executionOrder).toEqual([
      'active:start',
      'active:end',
      'latest:start',
      'latest:end'
    ])
  })
})
