import { afterEach, describe, expect, it, vi } from 'vitest'

const importRuntime = async () =>
  await import('../../client/runtime.js')

describe('narrative quality runtime asset URLs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('resolves plugin assets against the current origin when no injected host origin is present', async () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost:3018'
    })

    const { resolveQualityMeterAssetUrl } = await importRuntime()

    expect(resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/models/'))
      .toBe('http://localhost:3018/extensions/gcs-narrative-quality/models/')
  })

  it('prefers the injected plugin host origin when provided', async () => {
    vi.stubGlobal('__GCS_PLUGIN_HOST_ORIGIN__', 'https://assets.example.test')
    vi.stubGlobal('location', {
      origin: 'http://localhost:3018'
    })

    const { resolveQualityMeterAssetUrl } = await importRuntime()

    expect(resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/client/'))
      .toBe('https://assets.example.test/extensions/gcs-narrative-quality/client/')
  })

  it('returns the relative asset path when no origin is available', async () => {
    const { resolveQualityMeterAssetUrl } = await importRuntime()

    expect(resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/client/'))
      .toBe('/extensions/gcs-narrative-quality/client/')
  })

  it('normalizes locale, request config, question text, and criteria', async () => {
    const {
      resolveQualityMeterInput,
      resolveQualityMeterLocale,
      resolveQualityMeterRequestConfig
    } = await importRuntime()

    const settings = {
      question: {
        en: ' Does the narrative answer the prompt? ',
        fr: 'La reponse est-elle complete?'
      },
      criteria: {
        en: [
          ' Specific evidence ',
          { label: 'Clear decision context', weight: 3 },
          '',
          { label: '' },
          12
        ]
      },
      request_config: {
        adaptiveRefinementPolicy: 'adaptive',
        presentation: {
          mixedFitMinPercent: '-10',
          strongFitMinPercent: 125,
          toneByBand: {
            off_track: 'error',
            mixed_fit: 'invalid',
            strong_fit: 'success',
            extra: 'warning'
          }
        },
        adaptiveRefinement: {
          lowStopOverallPercent: 15,
          lowStopAnswerSupport: '0.35',
          lowStopMaxCriterionPercent: 20,
          lowStopSecondaryOverallBuffer: 5,
          lowStopLowCriterionShare: 0.7,
          highStopOverallPercent: 95,
          highStopMinCriterionPercent: 90,
          highStopSpreadPercent: 8,
          highStopWeakAnswerGate: 0.8,
          disableHighStopForConstraintQuestions: true,
          disableHighStopForTaskTypes: ['comparison', 'invalid'],
          disableHighStopForComparison: false,
          disableHighStopForPlanning: true
        }
      }
    }

    expect(resolveQualityMeterLocale('fr')).toBe('fr')
    expect(resolveQualityMeterLocale('es')).toBe('en')
    expect(resolveQualityMeterRequestConfig(settings)).toEqual({
      adaptiveRefinementPolicy: 'adaptive',
      presentation: {
        mixedFitMinPercent: 0,
        strongFitMinPercent: 100,
        toneByBand: {
          off_track: 'error',
          strong_fit: 'success'
        }
      },
      adaptiveRefinement: {
        lowStopOverallPercent: 15,
        lowStopAnswerSupport: 0.35,
        lowStopMaxCriterionPercent: 20,
        lowStopSecondaryOverallBuffer: 5,
        lowStopLowCriterionShare: 0.7,
        highStopOverallPercent: 95,
        highStopMinCriterionPercent: 90,
        highStopSpreadPercent: 8,
        highStopWeakAnswerGate: 0.8,
        disableHighStopForConstraintQuestions: true,
        disableHighStopForTaskTypes: ['planning']
      }
    })
    expect(resolveQualityMeterInput(settings, 'en')).toEqual({
      question: 'Does the narrative answer the prompt?',
      criteria: [
        ' Specific evidence ',
        { label: 'Clear decision context', weight: 3 }
      ],
      requestConfig: resolveQualityMeterRequestConfig(settings)
    })
  })

  it('omits invalid request config and creates localized runtime result states', async () => {
    const {
      createQualityMeterPendingResult,
      createQualityMeterRefiningResult,
      createQualityMeterRuntimeResult,
      resolveQualityMeterInput,
      resolveQualityMeterRequestConfig
    } = await importRuntime()
    const result = {
      overallPercent: 72,
      band: 'strong_fit',
      tone: 'success',
      breakdown: [{ label: 'Specific evidence' }]
    }
    const refinement = {
      shouldRunFullPass: true,
      reason: 'mixed signal',
      riskBand: 'medium',
      fastOverallPercent: 54
    }

    expect(resolveQualityMeterRequestConfig({ request_config: { adaptiveRefinementPolicy: 'sometimes' } }))
      .toBeUndefined()
    expect(resolveQualityMeterInput({ question: { fr: ' Texte ' }, criteria: { fr: [''] } }, 'fr')).toEqual({
      question: 'Texte',
      criteria: [],
      requestConfig: undefined
    })
    expect(createQualityMeterRuntimeResult(result, 'full', null)).toEqual({
      overallPercent: 72,
      band: 'strong_fit',
      tone: 'success',
      label: {
        en: 'Strong fit',
        fr: 'Bonne adéquation'
      },
      statusLabel: {
        en: 'Strong fit',
        fr: 'Bonne adéquation'
      },
      scoreMode: 'full',
      refinement: null,
      breakdown: [{ label: 'Specific evidence' }],
      activity: null
    })
    expect(createQualityMeterPendingResult()).toEqual({
      statusLabel: {
        en: 'Scoring',
        fr: 'Évaluation'
      },
      tone: 'warning',
      activity: null
    })
    expect(createQualityMeterRefiningResult(result, refinement)).toEqual({
      overallPercent: 72,
      band: 'strong_fit',
      tone: 'success',
      label: {
        en: 'Strong fit',
        fr: 'Bonne adéquation'
      },
      statusLabel: {
        en: 'Strong fit',
        fr: 'Bonne adéquation'
      },
      scoreMode: 'fast',
      refinement,
      breakdown: [{ label: 'Specific evidence' }],
      activity: {
        label: {
          en: 'Refining',
          fr: 'Affinage'
        }
      }
    })
  })
})
