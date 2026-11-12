/**
 * Error used when a score subscription is replaced by a newer request for the same target.
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

/** @type {{ kind: 'idle' } | { kind: 'running', owner: object }} */
let executionState = { kind: 'idle' }
const pendingScoreQueue = []
const scoreSubscriberByGroup = new Map()
const scoreResultCache = new Map()
const scoreInFlightByCacheKey = new Map()

/**
 * Resets the worker-local queue and memoized score results.
 */
export const resetWorkerScoreRequestQueue = () => {
  for (const execution of scoreInFlightByCacheKey.values()) {
    settleScoreSubscribers(execution, subscriber => subscriber.reject(new WorkerScoreRequestSupersededError()))
  }
  executionState = { kind: 'idle' }
  pendingScoreQueue.splice(0, pendingScoreQueue.length)
  scoreSubscriberByGroup.clear()
  scoreResultCache.clear()
  scoreInFlightByCacheKey.clear()
}

/**
 * Builds one stable cache key for a score request payload.
 *
 * @param {{ text: string, locale: string, question: string, criteria: unknown, requestConfig: unknown }} payload
 *   Normalized score input forwarded to the plugin worker.
 * @returns {string} JSON fingerprint preserving the payload field order used by the queue.
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
 * @returns {boolean} `true` only when the value is a queue replacement error.
 */
export const isWorkerScoreRequestSupersededError = error =>
  error instanceof WorkerScoreRequestSupersededError

/**
 * Settles and releases the live subscriptions belonging to one execution.
 *
 * @param {object} execution Shared scorer execution.
 * @param {Function} settle Resolves or rejects one subscription.
 */
const settleScoreSubscribers = (execution, settle) => {
  for (const subscriber of execution.subscribers) {
    if (scoreSubscriberByGroup.get(subscriber.groupKey) === subscriber) {
      scoreSubscriberByGroup.delete(subscriber.groupKey)
    }
    settle(subscriber)
  }
  execution.subscribers.clear()
}

/**
 * Cancels one target without cancelling another target's shared scoring work.
 *
 * @param {object} subscriber Replaced target subscription.
 */
const supersedeScoreSubscriber = subscriber => {
  const execution = subscriber.execution
  execution.subscribers.delete(subscriber)
  scoreSubscriberByGroup.delete(subscriber.groupKey)
  subscriber.reject(new WorkerScoreRequestSupersededError())

  const pendingIndex = pendingScoreQueue.indexOf(execution)
  if (execution.subscribers.size === 0 && pendingIndex >= 0) {
    pendingScoreQueue.splice(pendingIndex, 1)
    scoreInFlightByCacheKey.delete(execution.cacheKey)
  }
}

/**
 * Advances the single scorer execution lane.
 */
const runNextScoreRequest = () => {
  if (executionState.kind === 'running') {
    return
  }

  const next = pendingScoreQueue.shift()
  if (!next) {
    return
  }

  const execution = { kind: 'running', owner: next }
  executionState = execution

  void Promise.resolve()
    .then(async () => await next.run())
    .then(result => {
      if (scoreInFlightByCacheKey.get(next.cacheKey) === next) {
        scoreResultCache.set(next.cacheKey, Promise.resolve(result))
        scoreInFlightByCacheKey.delete(next.cacheKey)
      }
      settleScoreSubscribers(next, subscriber => subscriber.resolve(result))
    })
    .catch(error => {
      if (scoreInFlightByCacheKey.get(next.cacheKey) === next) {
        scoreInFlightByCacheKey.delete(next.cacheKey)
      }
      settleScoreSubscribers(next, subscriber => subscriber.reject(error))
    })
    .finally(() => {
      if (executionState !== execution) return
      executionState = { kind: 'idle' }
      runNextScoreRequest()
    })
}

/**
 * Subscribes one target to a cached result or shared, serial scorer execution.
 *
 * @template T
 * @param {string} cacheKey Stable request fingerprint for memoization.
 * @param {() => Promise<T>} run Async scorer execution for this request.
 * @param {{ groupKey?: string }} [options] Target identity for replacing an earlier subscription.
 * @returns {Promise<T>} Target-owned subscription, or a completed cached score promise.
 * @throws {WorkerScoreRequestSupersededError} When a newer request replaces the same target subscription.
 */
export const queueWorkerScoreRequest = (cacheKey, run, options = {}) => {
  const groupKey = typeof options.groupKey === 'string' && options.groupKey.length > 0
    ? options.groupKey
    : ''
  const previous = scoreSubscriberByGroup.get(groupKey)
  if (previous) {
    if (previous.execution.cacheKey === cacheKey) return previous.promise
    supersedeScoreSubscriber(previous)
  }

  const cached = scoreResultCache.get(cacheKey)
  if (cached) return cached

  let execution = scoreInFlightByCacheKey.get(cacheKey)
  if (!execution) {
    execution = { cacheKey, run, subscribers: new Set() }
    scoreInFlightByCacheKey.set(cacheKey, execution)
    pendingScoreQueue.push(execution)
  }

  let resolveTask
  let rejectTask
  const promise = new Promise((resolve, reject) => {
    resolveTask = resolve
    rejectTask = reject
  })
  const subscriber = { execution, groupKey, promise, resolve: resolveTask, reject: rejectTask }
  execution.subscribers.add(subscriber)
  if (groupKey) scoreSubscriberByGroup.set(groupKey, subscriber)

  runNextScoreRequest()
  return promise
}
