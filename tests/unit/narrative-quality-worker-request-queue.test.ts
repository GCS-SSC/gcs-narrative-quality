import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkerScoreCacheKey,
  queueWorkerScoreRequest,
  resetWorkerScoreRequestQueue,
  WorkerScoreRequestSupersededError
} from '../../client/worker-request-queue.js'

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

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
      groupKey: 'active-target'
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
  it('does not let a reset execution release a newer active lane', async () => {
    let finishOld: () => void = () => {}
    let finishCurrent: () => void = () => {}
    const executions: string[] = []
    const old = queueWorkerScoreRequest('old', async () => {
      await new Promise<void>(resolve => { finishOld = resolve })
    })
    await Promise.resolve()
    const oldCancelled = expect(old).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError)
    resetWorkerScoreRequestQueue()
    await oldCancelled
    const current = queueWorkerScoreRequest('current', async () => {
      executions.push('current')
      await new Promise<void>(resolve => { finishCurrent = resolve })
    })
    const next = queueWorkerScoreRequest('next', async () => { executions.push('next') })
    await Promise.resolve()
    finishOld()
    await Promise.resolve()
    await Promise.resolve()
    expect(executions).toEqual(['current'])
    finishCurrent()
    await Promise.all([current, next])
    expect(executions).toEqual(['current', 'next'])
  })

  it.each([false, true])('keeps other subscribers when one target changes (running=%s)', async running => {
    const blocker = deferred<string>()
    const shared = deferred<string>()
    const run = vi.fn(() => shared.promise)
    const active = running ? Promise.resolve('active') : queueWorkerScoreRequest('blocker', () => blocker.promise)
    const first = queueWorkerScoreRequest('shared', run, { groupKey: 'one' })
    const second = queueWorkerScoreRequest('shared', run, { groupKey: 'two' })
    const third = queueWorkerScoreRequest('shared', run, { groupKey: 'three' })
    expect(second).not.toBe(first)
    expect(queueWorkerScoreRequest('shared', run, { groupKey: 'two' })).toBe(second)
    const cancelled = expect(first).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError)
    const latest = queueWorkerScoreRequest('changed', async () => 'changed', { groupKey: 'one' })
    await cancelled
    blocker.resolve('active')
    shared.resolve('shared')
    await expect(Promise.all([active, second, third, latest])).resolves.toEqual(['active', 'shared', 'shared', 'changed'])
    expect(run).toHaveBeenCalledTimes(1)
    const cachedRun = vi.fn(async () => 'unexpected')
    await expect(queueWorkerScoreRequest('shared', cachedRun, { groupKey: 'four' })).resolves.toBe('shared')
    expect(cachedRun).not.toHaveBeenCalled()
  })

  it('drops a queued execution only after every subscriber is replaced', async () => {
    const blocker = deferred<string>()
    const active = queueWorkerScoreRequest('blocker', () => blocker.promise)
    const run = vi.fn(async () => 'stale')
    const first = queueWorkerScoreRequest('shared', run, { groupKey: 'one' })
    const second = queueWorkerScoreRequest('shared', run, { groupKey: 'two' })
    const cancelled = [first, second].map(promise => expect(promise).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError))
    const latestOne = queueWorkerScoreRequest('latest-one', async () => 'one', { groupKey: 'one' })
    const latestTwo = queueWorkerScoreRequest('latest-two', async () => 'two', { groupKey: 'two' })
    await Promise.all(cancelled)
    blocker.resolve('active')
    await Promise.all([active, latestOne, latestTwo])
    expect(run).not.toHaveBeenCalled()
    await expect(queueWorkerScoreRequest('shared', run, { groupKey: 'three' })).resolves.toBe('stale')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps the serial lane until an orphaned running score finishes and allows resubscription', async () => {
    const running = deferred<string>()
    const first = queueWorkerScoreRequest('shared', () => running.promise, { groupKey: 'one' })
    const second = queueWorkerScoreRequest('shared', () => running.promise, { groupKey: 'two' })
    const cancelled = [first, second].map(promise => expect(promise).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError))
    const latestRun = vi.fn(async () => 'changed')
    const latest = queueWorkerScoreRequest('changed', latestRun, { groupKey: 'one' })
    const latestTwo = queueWorkerScoreRequest('changed', latestRun, { groupKey: 'two' })
    await Promise.all(cancelled)
    expect(latestRun).not.toHaveBeenCalled()
    const duplicateRun = vi.fn(async () => 'duplicate')
    const joined = queueWorkerScoreRequest('shared', duplicateRun, { groupKey: 'three' })
    running.resolve('shared')
    await expect(Promise.all([joined, latest, latestTwo])).resolves.toEqual(['shared', 'changed', 'changed'])
    expect(duplicateRun).not.toHaveBeenCalled()
    expect(latestRun).toHaveBeenCalledTimes(1)
  })

  it('replaces a pending subscription even when its replacement is already cached', async () => {
    await queueWorkerScoreRequest('cached', async () => 'cached')
    const blocker = deferred<string>()
    const active = queueWorkerScoreRequest('blocker', () => blocker.promise)
    const run = vi.fn(async () => 'stale')
    const stale = queueWorkerScoreRequest('stale', run, { groupKey: 'one' })
    const cancelled = expect(stale).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError)
    await expect(queueWorkerScoreRequest('cached', async () => 'unexpected', { groupKey: 'one' })).resolves.toBe('cached')
    await cancelled
    blocker.resolve('active')
    await active
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects all live subscribers on failure and retries identical input', async () => {
    const failing = deferred<string>()
    const first = queueWorkerScoreRequest('shared', () => failing.promise, { groupKey: 'one' })
    const second = queueWorkerScoreRequest('shared', () => failing.promise, { groupKey: 'two' })
    const failures = [first, second].map(promise => expect(promise).rejects.toThrow('score failed'))
    failing.reject(new Error('score failed'))
    await Promise.all(failures)
    await expect(queueWorkerScoreRequest('shared', async () => 'recovered', { groupKey: 'one' })).resolves.toBe('recovered')
  })

  it('settles running and queued subscriptions on reset without caching an old result', async () => {
    const running = deferred<string>()
    const old = queueWorkerScoreRequest('shared', () => running.promise, { groupKey: 'one' })
    const joined = queueWorkerScoreRequest('shared', () => running.promise, { groupKey: 'two' })
    const queuedRun = vi.fn(async () => 'queued')
    const queued = queueWorkerScoreRequest('queued', queuedRun, { groupKey: 'three' })
    const cancelled = [old, joined, queued].map(promise => expect(promise).rejects.toBeInstanceOf(WorkerScoreRequestSupersededError))
    await Promise.resolve()
    resetWorkerScoreRequestQueue()
    await Promise.all(cancelled)
    running.resolve('old')
    await running.promise
    await expect(queueWorkerScoreRequest('shared', async () => 'new', { groupKey: 'one' })).resolves.toBe('new')
    expect(queuedRun).not.toHaveBeenCalled()
  })

})
