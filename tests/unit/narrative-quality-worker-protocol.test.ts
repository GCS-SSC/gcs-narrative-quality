import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeNarrativeQualityConfig,
  resolveNarrativeQualityTargetConfig,
  resolveNarrativeQualityTargets
} from '../../components/narrative-quality'
import { resolveQualityMeterInput } from '../../client/runtime.js'

const { loadModel, score, createScorer } = vi.hoisted(() => ({
  loadModel: vi.fn(), score: vi.fn(), createScorer: vi.fn()
}))

vi.mock('@huggingface/transformers', () => ({ env: { backends: { onnx: { wasm: {} } } } }))
vi.mock('../../client/core.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../client/core.ts')>(),
  createTransformersQualityScorer: createScorer
}))

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const scoreResult = {
  overallPercent: 10, answerSupport: 0.1, taskType: 'other',
  band: 'off_track', tone: 'error', breakdown: [{ percent: 10 }, { percent: 10 }]
}

const config = normalizeNarrativeQualityConfig({
  assessments: {
    '1': {
      questionComments: {
        'section::sub::blocker': { enabled: true },
        'section::sub::one': { enabled: true },
        'section::sub::two': { enabled: true },
        'section::sub::three': { enabled: true }
      }
    }
  }
})

// AssessmentQuestionCard supplies this same per-question textarea context.
const payloadFor = (questionName: string, text = 'This is the same justified comment.') => {
  const target = resolveNarrativeQualityTargets({
    textarea: {
      kind: 'assessment.questionComment', locale: 'en', text, assessmentSchemaId: '1',
      sectionName: 'section', subSectionName: 'sub', questionName
    }
  }, 'en')[0]
  if (!target) throw new Error('Missing assessment target')
  return {
    groupKey: target.key, text: target.text, locale: target.locale,
    settings: resolveNarrativeQualityTargetConfig(config, target.configKey)
  }
}

type WorkerMessage = { kind: string; requestId: number; error?: string }
type ScoreEvent = { data: { type: string; requestId: number; payload: ReturnType<typeof payloadFor> } }

describe('actual narrative quality queue and worker protocol', () => {
  const messages: WorkerMessage[] = []
  let send: (event: ScoreEvent) => void = () => {}

  beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    messages.length = 0
    loadModel.mockResolvedValue(undefined)
    score.mockResolvedValue(scoreResult)
    createScorer.mockReturnValue({ loadModel, score })
    vi.stubGlobal('__GCS_PLUGIN_HOST_ORIGIN__', 'https://assets.example.test')
    vi.stubGlobal('self', {
      postMessage: (message: WorkerMessage) => messages.push(message),
      addEventListener: (_type: string, listener: typeof send) => { send = listener }
    })
    await import('../../client/worker-source.js')
  })

  afterEach(async () => {
    const { resetWorkerScoreRequestQueue } = await import('../../client/worker-request-queue.js')
    resetWorkerScoreRequestQueue()
    await Promise.resolve()
    vi.unstubAllGlobals()
  })

  const request = (requestId: number, payload: ReturnType<typeof payloadFor>) =>
    send({ data: { type: 'score', requestId, payload } })
  const terminal = () => messages.filter(message => message.kind === 'result' || message.kind === 'error')

  it.each([false, true])('delivers unchanged question subscribers after one question changes (running=%s)', async running => {
    const one = payloadFor('one')
    const two = payloadFor('two')
    const three = payloadFor('three')
    const { createWorkerScoreCacheKey } = await import('../../client/worker-request-queue.js')
    const cacheKeyFor = (payload: typeof one) => createWorkerScoreCacheKey({
      text: payload.text, locale: payload.locale, ...resolveQualityMeterInput(payload.settings, payload.locale)
    })
    expect(one.groupKey).toBe('question-comment-1-section::sub::one')
    expect(two.groupKey).toBe('question-comment-1-section::sub::two')
    expect(one.settings.enabled && two.settings.enabled).toBe(true)
    expect(cacheKeyFor(one)).toBe(cacheKeyFor(two))

    const blockedScore = deferred<typeof scoreResult>()
    score.mockImplementationOnce(() => blockedScore.promise)
    if (!running) {
      request(0, payloadFor('blocker', 'Another model score.'))
      await vi.waitFor(() => expect(score).toHaveBeenCalledTimes(1))
    }
    request(1, one)
    request(2, two)
    request(3, three)
    if (running) await vi.waitFor(() => expect(score).toHaveBeenCalledTimes(1))
    request(4, payloadFor('one', 'This is the updated justification.'))
    expect(score).toHaveBeenCalledTimes(1)
    blockedScore.resolve(scoreResult)
    await vi.waitFor(() => expect(terminal()).toHaveLength(running ? 3 : 4))
    expect(terminal().map(message => [message.requestId, message.kind])).toEqual([
      ...(running ? [] : [[0, 'result']]), [2, 'result'], [3, 'result'], [4, 'result']
    ])
    expect(score.mock.calls.map(([input]) => input.response)).toEqual([
      ...(running ? [] : ['Another model score.']), one.text, 'This is the updated justification.'
    ])
    expect(createScorer).toHaveBeenCalledTimes(1)
    expect(loadModel).toHaveBeenCalledTimes(1)

    request(5, two)
    await vi.waitFor(() => expect(terminal()).toHaveLength(running ? 4 : 5))
    expect(terminal().at(-1)).toMatchObject({ requestId: 5, kind: 'result' })
    expect(score).toHaveBeenCalledTimes(running ? 2 : 3)
  })

  it('drops shared queued scoring only when all question subscribers change', async () => {
    const blockedScore = deferred<typeof scoreResult>()
    score.mockImplementationOnce(() => blockedScore.promise)
    request(0, payloadFor('blocker', 'Another model score.'))
    await vi.waitFor(() => expect(score).toHaveBeenCalledTimes(1))
    request(1, payloadFor('one'))
    request(2, payloadFor('two'))
    request(3, payloadFor('one', 'New first comment.'))
    request(4, payloadFor('two', 'New second comment.'))
    blockedScore.resolve(scoreResult)
    await vi.waitFor(() => expect(terminal()).toHaveLength(3))
    expect(terminal().map(message => message.requestId)).toEqual([0, 3, 4])
    expect(score.mock.calls.map(([input]) => input.response)).toEqual([
      'Another model score.', 'New first comment.', 'New second comment.'
    ])
  })

  it('reports model initialization failure to every subscriber and retries the same inputs once', async () => {
    const loading = deferred<void>()
    loadModel.mockImplementationOnce(() => loading.promise)
    request(1, payloadFor('one'))
    request(2, payloadFor('two'))
    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))
    loading.reject(new Error('model unavailable'))
    await vi.waitFor(() => expect(terminal()).toHaveLength(2))
    expect(terminal()).toEqual([
      expect.objectContaining({ kind: 'error', requestId: 1, error: 'model unavailable' }),
      expect.objectContaining({ kind: 'error', requestId: 2, error: 'model unavailable' })
    ])
    request(3, payloadFor('one'))
    request(4, payloadFor('two'))
    await vi.waitFor(() => expect(terminal()).toHaveLength(4))
    expect(terminal().slice(2).map(message => [message.requestId, message.kind])).toEqual([[3, 'result'], [4, 'result']])
    expect(createScorer).toHaveBeenCalledTimes(2)
    expect(score).toHaveBeenCalledTimes(1)
  })

  it('reports inference failure to both questions and retries without loading another model', async () => {
    const scoring = deferred<typeof scoreResult>()
    score.mockImplementationOnce(() => scoring.promise)
    request(1, payloadFor('one'))
    request(2, payloadFor('two'))
    await vi.waitFor(() => expect(score).toHaveBeenCalledTimes(1))
    scoring.reject(new Error('inference failed'))
    await vi.waitFor(() => expect(terminal()).toHaveLength(2))
    expect(terminal()).toEqual([
      expect.objectContaining({ kind: 'error', requestId: 1, error: 'inference failed' }),
      expect.objectContaining({ kind: 'error', requestId: 2, error: 'inference failed' })
    ])
    request(3, payloadFor('one'))
    request(4, payloadFor('two'))
    await vi.waitFor(() => expect(terminal()).toHaveLength(4))
    expect(terminal().slice(2).map(message => [message.requestId, message.kind])).toEqual([[3, 'result'], [4, 'result']])
    expect(createScorer).toHaveBeenCalledTimes(1)
    expect(loadModel).toHaveBeenCalledTimes(1)
    expect(score).toHaveBeenCalledTimes(2)
  })
})
