/**
 * Error used when a pending score request is replaced by a newer request for the same target.
 */
export class WorkerScoreRequestSupersededError extends Error {
  /**
   * Creates a superseded request error.
   */
  constructor() {
    super('WORKER_SCORE_REQUEST_SUPERSEDED')
    this.name = 'WorkerScoreRequestSupersededError'
  }
}

let isScoreExecuting = false
const pendingScoreQueue = []
const pendingScoreByGroup = new Map()
const scoreResultCache = new Map()
const scoreInFlightByCacheKey = new Map()

/**
 * Resets the worker-local queue and memoized score results.
 */
export const resetWorkerScoreRequestQueue = () => {
  isScoreExecuting = false
  pendingScoreQueue.splice(0, pendingScoreQueue.length)
  pendingScoreByGroup.clear()
  scoreResultCache.clear()
  scoreInFlightByCacheKey.clear()
}

/**
 * Builds one stable cache key for a score request payload.
 *
 * @param {{ text: string, locale: string, question: string, criteria: unknown, requestConfig: unknown }} payload
 *   Normalized score input forwarded to the plugin worker.
 * @returns {string}
 */
export const createWorkerScoreCacheKey = ({
  text,
  locale,
  question,
  criteria,
  requestConfig
}) =>
  JSON.stringify({
    text,
    locale,
    question,
    criteria,
    requestConfig
  })

/**
 * Identifies queue replacement errors so the worker can avoid reporting stale requests as failures.
 *
 * @param {unknown} error Candidate error.
 * @returns {boolean}
 */
export const isWorkerScoreRequestSupersededError = error =>
  error instanceof WorkerScoreRequestSupersededError

/**
 * Advances the single scorer execution lane.
 */
const runNextScoreRequest = () => {
  if (isScoreExecuting) {
    return
  }

  const next = pendingScoreQueue.shift()
  if (!next) {
    return
  }

  if (next.groupKey && pendingScoreByGroup.get(next.groupKey) === next) {
    pendingScoreByGroup.delete(next.groupKey)
  }

  isScoreExecuting = true

  void Promise.resolve()
    .then(async () => await next.run())
    .then(result => {
      next.resolve(result)
    })
    .catch(error => {
      next.reject(error)
    })
    .finally(() => {
      isScoreExecuting = false
      runNextScoreRequest()
    })
}

/**
 * Queues one worker score request and reuses the same promise for identical inputs.
 *
 * @template T
 * @param {string} cacheKey Stable request fingerprint for memoization.
 * @param {() => Promise<T>} run Async scorer execution for this request.
 * @param {{ groupKey?: string }} [options] Queue controls for dropping stale pending requests.
 * @returns {Promise<T>}
 */
export const queueWorkerScoreRequest = (cacheKey, run, options = {}) => {
  const cached = scoreResultCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const existing = scoreInFlightByCacheKey.get(cacheKey)
  if (existing) {
    return existing
  }

  let resolveTask
  let rejectTask
  const task = new Promise((resolve, reject) => {
    resolveTask = resolve
    rejectTask = reject
  })

  const groupKey = typeof options.groupKey === 'string' && options.groupKey.length > 0
    ? options.groupKey
    : ''
  const queueItem = {
    cacheKey,
    groupKey,
    run,
    resolve: resolveTask,
    reject: rejectTask
  }

  if (groupKey) {
    const previous = pendingScoreByGroup.get(groupKey)
    if (previous) {
      const previousIndex = pendingScoreQueue.indexOf(previous)
      if (previousIndex >= 0) {
        pendingScoreQueue.splice(previousIndex, 1)
      }
      scoreResultCache.delete(previous.cacheKey)
      scoreInFlightByCacheKey.delete(previous.cacheKey)
      previous.reject(new WorkerScoreRequestSupersededError())
    }

    pendingScoreByGroup.set(groupKey, queueItem)
  }

  pendingScoreQueue.push(queueItem)

  scoreResultCache.set(cacheKey, task)
  scoreInFlightByCacheKey.set(cacheKey, task)
  task.catch(() => {
    if (scoreResultCache.get(cacheKey) === task) {
      scoreResultCache.delete(cacheKey)
    }
  }).finally(() => {
    if (scoreInFlightByCacheKey.get(cacheKey) === task) {
      scoreInFlightByCacheKey.delete(cacheKey)
    }
  })

  runNextScoreRequest()

  return task
}
