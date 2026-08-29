import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadModelMock = vi.fn()
const scoreMock = vi.fn()
const createTransformersQualityScorerMock = vi.fn()
const resolveQualityMeterInputMock = vi.fn()
const queueWorkerScoreRequestMock = vi.fn()
const postMessageMock = vi.fn()
const addEventListenerMock = vi.fn()
const isWorkerScoreRequestSupersededErrorMock = vi.fn()
const transformersEnvMock = {
  backends: { onnx: { wasm: {} as Record<string, unknown> } },
  fetch: undefined as unknown
}

vi.mock('@huggingface/transformers', () => ({
  env: transformersEnvMock
}))

vi.mock('../../client/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../client/core.ts')>()

  return {
    ...actual,
    createTransformersQualityScorer: (...args: unknown[]) => createTransformersQualityScorerMock(...args)
  }
})

vi.mock('../../client/runtime.js', () => ({
  createQualityMeterPendingResult: () => ({ state: 'pending' }),
  createQualityMeterRefiningResult: (result: unknown, refinement: unknown) => ({ state: 'refining', result, refinement }),
  createQualityMeterRuntimeResult: (result: unknown, mode: string, refinement: unknown) => ({ state: 'runtime', result, mode, refinement }),
  resolveQualityMeterAssetUrl: (path: string) => `https://assets.example.test${path}`,
  resolveQualityMeterInput: (...args: unknown[]) => resolveQualityMeterInputMock(...args),
  resolveQualityMeterLocale: (locale: string) => locale.startsWith('fr') ? 'fr' : 'en'
}))

vi.mock('../../client/worker-request-queue.js', () => ({
  createWorkerScoreCacheKey: (input: unknown) => JSON.stringify(input),
  isWorkerScoreRequestSupersededError: (...args: unknown[]) => isWorkerScoreRequestSupersededErrorMock(...args),
  queueWorkerScoreRequest: (...args: unknown[]) => queueWorkerScoreRequestMock(...args)
}))

describe('narrative quality worker source', () => {
  const createScoreResult = (
    overallPercent: number,
    answerSupport: number,
    criterionPercents: number[]
  ) => ({
    overallPercent,
    answerSupport,
    taskType: 'other',
    band: 'mixed_fit',
    tone: 'warning',
    breakdown: criterionPercents.map(percent => ({ percent }))
  })

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('self', {
      postMessage: postMessageMock,
      addEventListener: addEventListenerMock
    })
    isWorkerScoreRequestSupersededErrorMock.mockReturnValue(false)
    loadModelMock.mockResolvedValue(undefined)
    scoreMock.mockResolvedValue(createScoreResult(50, 0.5, [50, 50]))
    createTransformersQualityScorerMock.mockReturnValue({
      loadModel: loadModelMock,
      score: scoreMock
    })
    resolveQualityMeterInputMock.mockReturnValue({
      question: 'Describe the project',
      criteria: ['clear', 'specific'],
      requestConfig: { adaptiveRefinementPolicy: 'never' }
    })
    queueWorkerScoreRequestMock.mockImplementation(async (_cacheKey, callback) => await callback())
  })

  it('returns an empty result for blank text before queueing scorer work', async () => {
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: '   ', locale: 'en' }, 1)).resolves.toEqual({})
    expect(queueWorkerScoreRequestMock).not.toHaveBeenCalled()
  })

  it('returns an empty result when the resolved question has no criteria', async () => {
    resolveQualityMeterInputMock.mockReturnValueOnce({
      question: 'Describe the project',
      criteria: [],
      requestConfig: {}
    })
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 1)).resolves.toEqual({})
    expect(queueWorkerScoreRequestMock).not.toHaveBeenCalled()
  })

  it('scores with the fast pass when no refinement is required', async () => {
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({
      text: ' A response ',
      locale: 'fr-CA',
      groupKey: 'question-1',
      settings: { configured: true }
    }, 7)).resolves.toEqual({
      state: 'runtime',
      result: createScoreResult(50, 0.5, [50, 50]),
      mode: 'fast',
      refinement: {
        shouldRunFullPass: false,
        reason: 'quick_only',
        riskBand: 'low',
        fastOverallPercent: 50
      }
    })
    expect(queueWorkerScoreRequestMock).toHaveBeenCalledWith(expect.any(String), expect.any(Function), {
      groupKey: 'question-1'
    })
    expect(postMessageMock).toHaveBeenCalledWith({
      kind: 'status',
      phase: 'scoring',
      requestId: 7,
      result: { state: 'pending' }
    })
    expect(scoreMock).toHaveBeenCalledWith({
      question: 'Describe the project',
      response: 'A response',
      criteria: ['clear', 'specific'],
      config: { adaptiveRefinementPolicy: 'never' }
    }, { mode: 'fast' })
  })

  it('runs fast and full passes when the configured policy is always', async () => {
    resolveQualityMeterInputMock.mockReturnValueOnce({
      question: 'Describe the project',
      criteria: ['clear', 'specific'],
      requestConfig: { adaptiveRefinementPolicy: 'always' }
    })
    scoreMock
      .mockResolvedValueOnce(createScoreResult(50, 0.5, [50, 50]))
      .mockResolvedValueOnce(createScoreResult(72, 0.8, [70, 74]))
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 8))
      .resolves.toMatchObject({
        mode: 'full',
        refinement: {
          shouldRunFullPass: true,
          reason: 'always_full'
        }
      })
    expect(scoreMock).toHaveBeenNthCalledWith(1, expect.any(Object), { mode: 'fast' })
    expect(scoreMock).toHaveBeenNthCalledWith(2, expect.any(Object), { mode: 'full' })
  })

  it('runs only the fast pass when the configured policy is never', async () => {
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 8))
      .resolves.toMatchObject({
        mode: 'fast',
        refinement: {
          shouldRunFullPass: false,
          reason: 'quick_only'
        }
      })
    expect(scoreMock).toHaveBeenCalledTimes(1)
    expect(scoreMock).toHaveBeenCalledWith(expect.any(Object), { mode: 'fast' })
  })

  it('uses configured adaptive thresholds when deciding whether to run the full pass', async () => {
    resolveQualityMeterInputMock.mockReturnValueOnce({
      question: 'Describe the project',
      criteria: ['clear', 'specific'],
      requestConfig: {
        adaptiveRefinementPolicy: 'adaptive',
        adaptiveRefinement: {
          lowStopOverallPercent: 60,
          lowStopAnswerSupport: 0.6,
          lowStopMaxCriterionPercent: 60
        }
      }
    })
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 8))
      .resolves.toMatchObject({
        mode: 'fast',
        refinement: {
          shouldRunFullPass: false,
          reason: 'obvious_failure'
        }
      })
    expect(scoreMock).toHaveBeenCalledTimes(1)
  })

  it('runs and reports a full refinement pass when requested', async () => {
    resolveQualityMeterInputMock.mockReturnValueOnce({
      question: 'Describe the project',
      criteria: ['clear', 'specific'],
      requestConfig: { adaptiveRefinementPolicy: 'always' }
    })
    scoreMock
      .mockResolvedValueOnce(createScoreResult(60, 0.6, [55, 65]))
      .mockResolvedValueOnce(createScoreResult(80, 0.9, [78, 82]))
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 9)).resolves.toEqual({
      state: 'runtime',
      result: createScoreResult(80, 0.9, [78, 82]),
      mode: 'full',
      refinement: {
        shouldRunFullPass: true,
        reason: 'always_full',
        riskBand: 'medium',
        fastOverallPercent: 60
      }
    })
    expect(postMessageMock).toHaveBeenCalledWith({
      kind: 'status',
      phase: 'refining',
      requestId: 9,
      result: {
        state: 'refining',
        result: createScoreResult(60, 0.6, [55, 65]),
        refinement: {
          shouldRunFullPass: true,
          reason: 'always_full',
          riskBand: 'medium',
          fastOverallPercent: 60
        }
      }
    })
    expect(scoreMock).toHaveBeenLastCalledWith(expect.any(Object), { mode: 'full' })
  })

  it('normalizes URL, Request, and string model fetch inputs against extension assets', async () => {
    const fetchMock = vi.fn(async () => new Response('model'))
    vi.stubGlobal('fetch', fetchMock)
    const { scorePayload } = await import('../../client/worker-source.js')

    await scorePayload({ text: 'A response', locale: 'en' }, 10)
    const workerFetch = transformersEnvMock.fetch as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    await workerFetch(new URL('weights.bin', 'https://models.example.test/base/'))
    await workerFetch(new Request('https://models.example.test/config.json', { headers: { accept: 'application/json' } }))
    await workerFetch('tokenizer.json', { cache: 'no-store' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('weights.bin')
    expect(fetchMock.mock.calls[1]?.[0]).toBeInstanceOf(Request)
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://assets.example.test/extensions/gcs-narrative-quality/models/tokenizer.json')
  })

  it('clears a failed scorer initialization so the next request can retry', async () => {
    loadModelMock.mockRejectedValueOnce(new Error('model unavailable')).mockResolvedValueOnce(undefined)
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'first response' }, 11)).rejects.toThrow('model unavailable')
    await expect(scorePayload({ text: 'second response' }, 12)).resolves.toMatchObject({ mode: 'fast' })
    expect(createTransformersQualityScorerMock).toHaveBeenCalledTimes(2)
  })

  it('handles worker messages, defaults request data, and reports scoring failures', async () => {
    await import('../../client/worker-source.js')
    const listener = addEventListenerMock.mock.calls[0]?.[1] as (event: { data?: unknown }) => void

    listener({ data: { type: 'ignored' } })
    expect(postMessageMock).not.toHaveBeenCalled()

    listener({ data: { type: 'score', payload: { text: 'A response' } } })
    await vi.waitFor(() => expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'result', requestId: 0, ok: true
    })))

    queueWorkerScoreRequestMock.mockRejectedValueOnce(new Error('worker failed'))
    listener({ data: { type: 'score', requestId: 13, payload: { text: 'A response' } } })
    await vi.waitFor(() => expect(postMessageMock).toHaveBeenCalledWith({
      kind: 'error', phase: 'error', requestId: 13, ok: false, error: 'worker failed'
    }))

    queueWorkerScoreRequestMock.mockRejectedValueOnce('primitive failure')
    listener({ data: { type: 'score', requestId: 14, payload: { text: 'A response' } } })
    await vi.waitFor(() => expect(postMessageMock).toHaveBeenCalledWith({
      kind: 'error', phase: 'error', requestId: 14, ok: false, error: 'QUALITY_METER_WORKER_ERROR'
    }))
  })

  it('silently drops a superseded queued message', async () => {
    isWorkerScoreRequestSupersededErrorMock.mockReturnValue(true)
    await import('../../client/worker-source.js')
    const listener = addEventListenerMock.mock.calls[0]?.[1] as (event: { data?: unknown }) => void
    queueWorkerScoreRequestMock.mockRejectedValueOnce(new Error('superseded'))

    listener({ data: { type: 'score', requestId: 15, payload: { text: 'A response' } } })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(postMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
  })
})
