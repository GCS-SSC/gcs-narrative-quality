import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadModelMock = vi.fn()
const scoreMock = vi.fn()
const createTransformersQualityScorerMock = vi.fn()
const decideQualityRefinementMock = vi.fn()
const resolveQualityMeterInputMock = vi.fn()
const queueWorkerScoreRequestMock = vi.fn()
const postMessageMock = vi.fn()

vi.mock('@huggingface/transformers', () => ({
  env: {
    backends: {
      onnx: {
        wasm: {}
      }
    }
  }
}))

vi.mock('../../client/core.ts', () => ({
  DEFAULT_ADAPTIVE_REFINEMENT_CONFIG: { threshold: 0.2 },
  createTransformersQualityScorer: (...args: unknown[]) => createTransformersQualityScorerMock(...args),
  decideQualityRefinement: (...args: unknown[]) => decideQualityRefinementMock(...args)
}))

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
  isWorkerScoreRequestSupersededError: () => false,
  queueWorkerScoreRequest: (...args: unknown[]) => queueWorkerScoreRequestMock(...args)
}))

describe('narrative quality worker source', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('self', {
      postMessage: postMessageMock,
      addEventListener: vi.fn()
    })
    loadModelMock.mockResolvedValue(undefined)
    scoreMock.mockResolvedValue({ score: 0.9 })
    createTransformersQualityScorerMock.mockReturnValue({
      loadModel: loadModelMock,
      score: scoreMock
    })
    resolveQualityMeterInputMock.mockReturnValue({
      question: 'Describe the project',
      criteria: ['clear', 'specific'],
      requestConfig: { targetScore: 0.75 }
    })
    queueWorkerScoreRequestMock.mockImplementation(async (_cacheKey, callback) => await callback())
    decideQualityRefinementMock.mockReturnValue({ shouldRunFullPass: false })
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
      result: { score: 0.9 },
      mode: 'fast',
      refinement: { shouldRunFullPass: false }
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
      config: { targetScore: 0.75 }
    }, { mode: 'fast' })
  })

  it('runs and reports a full refinement pass when requested', async () => {
    decideQualityRefinementMock.mockReturnValueOnce({ shouldRunFullPass: true, reason: 'borderline' })
    scoreMock
      .mockResolvedValueOnce({ score: 0.6 })
      .mockResolvedValueOnce({ score: 0.8 })
    const { scorePayload } = await import('../../client/worker-source.js')

    await expect(scorePayload({ text: 'A response', locale: 'en' }, 9)).resolves.toEqual({
      state: 'runtime',
      result: { score: 0.8 },
      mode: 'full',
      refinement: { shouldRunFullPass: true, reason: 'borderline' }
    })
    expect(postMessageMock).toHaveBeenCalledWith({
      kind: 'status',
      phase: 'refining',
      requestId: 9,
      result: {
        state: 'refining',
        result: { score: 0.6 },
        refinement: { shouldRunFullPass: true, reason: 'borderline' }
      }
    })
    expect(scoreMock).toHaveBeenLastCalledWith(expect.any(Object), { mode: 'full' })
  })
})
