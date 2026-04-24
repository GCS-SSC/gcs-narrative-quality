import { env as transformersEnv } from '@huggingface/transformers'
import {
  DEFAULT_ADAPTIVE_REFINEMENT_CONFIG,
  createTransformersQualityScorer,
  decideQualityRefinement
} from './core.ts'
import {
  createQualityMeterPendingResult,
  createQualityMeterRefiningResult,
  createQualityMeterRuntimeResult,
  resolveQualityMeterAssetUrl,
  resolveQualityMeterInput,
  resolveQualityMeterLocale
} from './runtime.js'
import {
  createWorkerScoreCacheKey,
  isWorkerScoreRequestSupersededError,
  queueWorkerScoreRequest
} from './worker-request-queue.js'

const MODEL_BASE_PATH = resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/models/')
const WASM_BASE_PATH = resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/client/')
const MODEL_BASE_URL = new URL(MODEL_BASE_PATH)
const MODEL_REMOTE_HOST = MODEL_BASE_URL.origin
const MODEL_REMOTE_PATH_TEMPLATE = `${MODEL_BASE_URL.pathname}{model}/`
const MIN_REFINING_DISPLAY_MS = 450

let scorerPromise = null

const sleep = (durationMs) =>
  new Promise(resolve => setTimeout(resolve, durationMs))

/**
 * Resolves worker-side fetch inputs against the same-origin plugin asset host.
 *
 * @param {RequestInfo | URL} input Fetch input emitted by the scorer/runtime stack.
 * @returns {URL}
 */
const resolveWorkerFetchUrl = input => {
  if (input instanceof URL) {
    return new URL(input.toString(), MODEL_BASE_PATH)
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new URL(input.url, MODEL_BASE_PATH)
  }

  return new URL(String(input), MODEL_BASE_PATH)
}

/**
 * Creates and loads the in-worker scorer once for the lifetime of this plugin worker.
 *
 * @returns {Promise<ReturnType<typeof createTransformersQualityScorer>>}
 */
const getScorer = async () => {
  if (!scorerPromise) {
    const pendingScorer = (async () => {
      transformersEnv.backends.onnx.wasm.wasmPaths = {
        mjs: `${WASM_BASE_PATH}ort-wasm-simd-threaded.asyncify.mjs`,
        wasm: `${WASM_BASE_PATH}ort-wasm-simd-threaded.asyncify.wasm`
      }
      transformersEnv.useWasmCache = false
      transformersEnv.backends.onnx.wasm.proxy = false

      /**
       * Normalizes scorer model fetches against the same-origin plugin asset host.
       *
       * @param {RequestInfo | URL} input Fetch input emitted by transformers.js.
       * @param {RequestInit | undefined} init Optional fetch init.
       * @returns {Promise<Response>}
       */
      transformersEnv.fetch = async (input, init) => {
        const resolvedUrl = resolveWorkerFetchUrl(input)

        if (typeof Request !== 'undefined' && input instanceof Request) {
          return await fetch(new Request(resolvedUrl.toString(), input), init)
        }

        return await fetch(resolvedUrl.toString(), init)
      }

      const scorer = createTransformersQualityScorer({
        modelSource: {
          mode: 'url',
          remoteHost: MODEL_REMOTE_HOST,
          remotePathTemplate: MODEL_REMOTE_PATH_TEMPLATE,
          useBrowserCache: 'auto'
        }
      })

      await scorer.loadModel()
      return scorer
    })()

    pendingScorer.catch(() => {
      if (scorerPromise === pendingScorer) {
        scorerPromise = null
      }
    })

    scorerPromise = pendingScorer
  }

  return await scorerPromise
}

/**
 * Scores one plugin payload using the library fast pass plus adaptive refinement.
 *
 * @param {Record<string, unknown>} payload Structured payload received from the host worker bridge.
 * @param {number} requestId Host-issued score request id.
 * @returns {Promise<Record<string, unknown>>}
 */
const scorePayload = async (payload, requestId) => {
  const text = String(payload.text ?? '').trim()
  const locale = resolveQualityMeterLocale(String(payload.locale ?? 'en'))
  const groupKey = typeof payload.groupKey === 'string' ? payload.groupKey : ''
  const settings = typeof payload.settings === 'object' && payload.settings !== null
    ? payload.settings
    : {}
  const { question, criteria, requestConfig } = resolveQualityMeterInput(settings, locale)

  if (!text || !question || criteria.length === 0) {
    return {}
  }

  const cacheKey = createWorkerScoreCacheKey({
    text,
    locale,
    question,
    criteria,
    requestConfig
  })

  return await queueWorkerScoreRequest(cacheKey, async () => {
    self.postMessage({
      kind: 'status',
      phase: 'scoring',
      requestId,
      result: createQualityMeterPendingResult()
    })

    const scorer = await getScorer()
    const input = {
      question,
      response: text,
      criteria,
      config: requestConfig
    }

    const fastResult = await scorer.score(input, { mode: 'fast' })
    const refinement = decideQualityRefinement({
      fastResult,
      question,
      response: text,
      criteria,
      requestConfig,
      policy: 'adaptive',
      config: DEFAULT_ADAPTIVE_REFINEMENT_CONFIG
    })

    if (!refinement || !refinement.shouldRunFullPass) {
      return createQualityMeterRuntimeResult(fastResult, 'fast', refinement)
    }

    const refiningStartedAt = Date.now()
    self.postMessage({
      kind: 'status',
      phase: 'refining',
      requestId,
      result: createQualityMeterRefiningResult(fastResult, refinement)
    })

    const fullResult = await scorer.score(input, { mode: 'full' })
    const refiningElapsedMs = Date.now() - refiningStartedAt

    if (refiningElapsedMs < MIN_REFINING_DISPLAY_MS) {
      await sleep(MIN_REFINING_DISPLAY_MS - refiningElapsedMs)
    }

    return createQualityMeterRuntimeResult(fullResult, 'full', refinement)
  }, {
    groupKey
  })
}

if (typeof self !== 'undefined') {
  self.addEventListener('message', event => {
    if (event.data?.type !== 'score') {
      return
    }

    const requestId = typeof event.data?.requestId === 'number'
      ? event.data.requestId
      : 0

    void scorePayload(event.data.payload ?? {}, requestId).then(result => {
      self.postMessage({
        kind: 'result',
        phase: 'complete',
        requestId,
        ok: true,
        result
      })
    }).catch(error => {
      if (isWorkerScoreRequestSupersededError(error)) {
        return
      }

      self.postMessage({
        kind: 'error',
        phase: 'error',
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : 'QUALITY_METER_WORKER_ERROR'
      })
    })
  })
}
