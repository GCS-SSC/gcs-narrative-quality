import { describe, expect, it } from 'bun:test'
import {
  decideQualityRefinement,
  resolveQualityScorePresentation
} from '../client/core.ts'
import type {
  QualityScoreRequestConfig,
  QualityScoreResult
} from '../client/core.ts'
import { resolveQualityMeterRequestConfig } from '../client/runtime.js'

const createFastResult = (overrides: Partial<QualityScoreResult> = {}): QualityScoreResult => ({
  criteria: ['criterion a', 'criterion b', 'criterion c'],
  weightedCriteria: [
    { label: 'criterion a', weight: 1 },
    { label: 'criterion b', weight: 1 },
    { label: 'criterion c', weight: 1 }
  ],
  normalizedCriteria: ['criterion a', 'criterion b', 'criterion c'],
  scores: [0.9, 0.9, 0.9],
  rawScores: [0.9, 0.9, 0.9],
  gate: 1,
  answerSupport: 1,
  constraintPresence: 0,
  constraintRespect: 1,
  deterministicConstraintPresence: 0,
  deterministicConstraintRespect: 1,
  structuralScore: 1,
  topicAlignment: 1,
  taskType: 'unknown',
  overallRaw: 0.9,
  weakAnswerGate: 1,
  overallAdjustedRaw: 0.9,
  overallCalibrated: 0.9,
  overallPercent: 90,
  band: 'strong_fit',
  tone: 'success',
  breakdown: [
    { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.9, percent: 90 },
    { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.9, percent: 90 },
    { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.9, percent: 90 }
  ],
  ...overrides
})

const getRequestConfig = (requestConfig: Record<string, unknown>): QualityScoreRequestConfig => {
  return resolveQualityMeterRequestConfig({ request_config: requestConfig }) as QualityScoreRequestConfig
}

const runRefinement = (
  requestConfig: QualityScoreRequestConfig | undefined,
  overrides: {
    fastResult?: Partial<QualityScoreResult>
    question?: string
    response?: string
    criteria?: string[]
  } = {}
) => {
  return decideQualityRefinement({
    fastResult: createFastResult(overrides.fastResult),
    question: overrides.question ?? 'Summarize the agreement.',
    response: overrides.response ?? 'It funds training and community support.',
    criteria: overrides.criteria ?? ['criterion a', 'criterion b', 'criterion c'],
    requestConfig
  })
}

describe('quality meter configurable behavior', () => {
  it('applies request_config.presentation.mixedFitMinPercent individually', () => {
    const requestConfig = getRequestConfig({
      presentation: {
        mixedFitMinPercent: 65
      }
    })

    expect(resolveQualityScorePresentation(60, requestConfig.presentation).band).toBe('off_track')
  })

  it('applies request_config.presentation.strongFitMinPercent individually', () => {
    const requestConfig = getRequestConfig({
      presentation: {
        strongFitMinPercent: 60
      }
    })

    expect(resolveQualityScorePresentation(60, requestConfig.presentation).band).toBe('strong_fit')
  })

  it('applies request_config.presentation.toneByBand.off_track individually', () => {
    const requestConfig = getRequestConfig({
      presentation: {
        toneByBand: {
          off_track: 'warning'
        }
      }
    })

    expect(resolveQualityScorePresentation(20, requestConfig.presentation).tone).toBe('warning')
  })

  it('applies request_config.presentation.toneByBand.mixed_fit individually', () => {
    const requestConfig = getRequestConfig({
      presentation: {
        toneByBand: {
          mixed_fit: 'success'
        }
      }
    })

    expect(resolveQualityScorePresentation(50, requestConfig.presentation).tone).toBe('success')
  })

  it('applies request_config.presentation.toneByBand.strong_fit individually', () => {
    const requestConfig = getRequestConfig({
      presentation: {
        toneByBand: {
          strong_fit: 'warning'
        }
      }
    })

    expect(resolveQualityScorePresentation(80, requestConfig.presentation).tone).toBe('warning')
  })

  it('applies request_config.adaptiveRefinementPolicy=always individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinementPolicy: 'always'
    })

    expect(runRefinement(requestConfig).reason).toBe('always_full')
  })

  it('applies request_config.adaptiveRefinementPolicy=never individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinementPolicy: 'never'
    })

    expect(runRefinement(requestConfig).reason).toBe('quick_only')
  })

  it('applies request_config.adaptiveRefinement.lowStopOverallPercent individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        lowStopOverallPercent: 12
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 12,
        answerSupport: 0.2,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.1, percent: 10 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.12, percent: 12 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.14, percent: 14 }
        ]
      },
      response: 'Short answer.'
    }).reason).toBe('obvious_failure')
  })

  it('applies request_config.adaptiveRefinement.lowStopAnswerSupport individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        lowStopAnswerSupport: 0.3
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 10,
        answerSupport: 0.3,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.08, percent: 8 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.1, percent: 10 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.12, percent: 12 }
        ]
      },
      response: 'Short answer.'
    }).reason).toBe('obvious_failure')
  })

  it('applies request_config.adaptiveRefinement.lowStopMaxCriterionPercent individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        lowStopMaxCriterionPercent: 18
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 10,
        answerSupport: 0.2,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.12, percent: 12 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.16, percent: 16 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.18, percent: 18 }
        ]
      },
      response: 'Short answer.'
    }).reason).toBe('obvious_failure')
  })

  it('applies request_config.adaptiveRefinement.lowStopSecondaryOverallBuffer individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        lowStopSecondaryOverallBuffer: 3
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 14,
        answerSupport: 0.25,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.12, percent: 12 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.14, percent: 14 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.2, percent: 20 }
        ]
      },
      response: 'Short answer.'
    }).reason).toBe('mid_band')
  })

  it('applies request_config.adaptiveRefinement.lowStopLowCriterionShare individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        lowStopLowCriterionShare: 0.8
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 14,
        answerSupport: 0.25,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.12, percent: 12 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.14, percent: 14 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 0.2, percent: 20 }
        ]
      },
      response: 'Short answer.'
    }).reason).toBe('mid_band')
  })

  it('applies request_config.adaptiveRefinement.highStopOverallPercent individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        highStopOverallPercent: 95
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 95,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('stable_strong')
  })

  it('applies request_config.adaptiveRefinement.highStopMinCriterionPercent individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        highStopMinCriterionPercent: 95
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.95, percent: 95 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.97, percent: 97 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('mid_band')
  })

  it('applies request_config.adaptiveRefinement.highStopSpreadPercent individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        highStopSpreadPercent: 10
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 0.8, percent: 80 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 0.95, percent: 95 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('mid_band')
  })

  it('applies request_config.adaptiveRefinement.highStopWeakAnswerGate individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        highStopWeakAnswerGate: 0.8
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        weakAnswerGate: 0.8,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('stable_strong')
  })

  it('applies request_config.adaptiveRefinement.disableHighStopForConstraintQuestions individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        disableHighStopForConstraintQuestions: true
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        constraintPresence: 1,
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('stable_strong')
  })

  it('applies request_config.adaptiveRefinement.disableHighStopForTaskTypes individually', () => {
    const requestConfig = getRequestConfig({
      adaptiveRefinement: {
        disableHighStopForTaskTypes: ['comparison', 'planning']
      }
    })

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        taskType: 'comparison',
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('task_risk')

    expect(runRefinement(requestConfig, {
      fastResult: {
        overallPercent: 100,
        taskType: 'planning',
        breakdown: [
          { label: 'criterion a', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion b', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 },
          { label: 'criterion c', weight: 1, weightShare: 1 / 3, raw: 1, percent: 100 }
        ]
      }
    }).reason).toBe('task_risk')
  })
})
