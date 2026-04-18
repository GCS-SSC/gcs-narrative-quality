import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import {
  createQualityMeterPendingResult,
  createQualityMeterRefiningResult,
  createQualityMeterRuntimeResult,
  resolveQualityMeterAssetUrl,
  resolveQualityMeterInput,
  resolveQualityMeterLocale,
  resolveQualityMeterRequestConfig
} from '../client/runtime.js'

describe('quality meter plugin runtime adapter', () => {
  it('resolves the field locale and localized weighted settings for scoring', () => {
    const locale = resolveQualityMeterLocale('fr')
    const input = resolveQualityMeterInput({
      question: {
        en: 'Describe the agreement objectives, expected impact, and beneficiaries.',
        fr: 'Décrivez les objectifs de l entente, les retombées prévues et les bénéficiaires.'
      },
      criteria: {
        en: [
          { label: 'Names the agreement objectives clearly', weight: 4 }
        ],
        fr: [
          { label: 'Nomme clairement les objectifs de l entente', weight: 4 },
          { label: 'Explique les retombées prévues', weight: 3 }
        ]
      }
    }, locale)

    expect(locale).toBe('fr')
    expect(input.question).toBe('Décrivez les objectifs de l entente, les retombées prévues et les bénéficiaires.')
    expect(input.criteria).toEqual([
      { label: 'Nomme clairement les objectifs de l entente', weight: 4 },
      { label: 'Explique les retombées prévues', weight: 3 }
    ])
  })

  it('resolves per-field request config for the latest scorer surface', () => {
    expect(resolveQualityMeterRequestConfig({
      request_config: {
        adaptiveRefinementPolicy: 'never',
        presentation: {
          mixedFitMinPercent: 40,
          strongFitMinPercent: 78,
          toneByBand: {
            off_track: 'warning',
            mixed_fit: 'warning',
            strong_fit: 'success'
          }
        },
        adaptiveRefinement: {
          lowStopOverallPercent: 12,
          lowStopAnswerSupport: 0.3,
          highStopWeakAnswerGate: 0.95,
          disableHighStopForConstraintQuestions: false,
          disableHighStopForComparison: true,
          disableHighStopForPlanning: true
        }
      }
    })).toEqual({
      adaptiveRefinementPolicy: 'never',
      presentation: {
        mixedFitMinPercent: 40,
        strongFitMinPercent: 78,
        toneByBand: {
          off_track: 'warning',
          mixed_fit: 'warning',
          strong_fit: 'success'
        }
      },
      adaptiveRefinement: {
        lowStopOverallPercent: 12,
        lowStopAnswerSupport: 0.3,
        highStopWeakAnswerGate: 0.95,
        disableHighStopForConstraintQuestions: false,
        disableHighStopForTaskTypes: ['comparison', 'planning']
      }
    })
  })

  it('preserves explicit false task-risk toggles in the mapped request config', () => {
    expect(resolveQualityMeterRequestConfig({
      request_config: {
        adaptiveRefinement: {
          disableHighStopForComparison: false,
          disableHighStopForPlanning: true
        }
      }
    })).toEqual({
      adaptiveRefinement: {
        disableHighStopForTaskTypes: ['planning']
      }
    })

    expect(resolveQualityMeterRequestConfig({
      request_config: {
        adaptiveRefinement: {
          disableHighStopForComparison: false,
          disableHighStopForPlanning: false
        }
      }
    })).toEqual({
      adaptiveRefinement: {
        disableHighStopForTaskTypes: []
      }
    })
  })

  it('ships the latest display-band controls in the plugin config schema', () => {
    const configSchema = JSON.parse(readFileSync(
      new URL('../ui/config.json', import.meta.url),
      'utf8'
    )) as {
      children?: Array<{
        type?: string
        badge?: string
        label?: { en?: string, fr?: string }
        default_open?: boolean
        children?: Array<{
          type?: string
          key?: string
          default_value?: string | number | boolean | null
          children?: Array<{ key?: string }>
        }>
      }>
    }

    const englishRuntimeSection = configSchema.children?.find(section => section.badge === '02')
    const frenchRuntimeSection = configSchema.children?.find(section => section.badge === '03')
    const displayBandsSection = configSchema.children?.find(section => section.label?.en === 'Display Bands')
    const adaptiveRefinementSection = configSchema.children?.find(section => section.label?.en === 'Adaptive Refinement')
    const adaptiveThresholdsSection = configSchema.children?.find(section => section.label?.en === 'Adaptive Thresholds')
    const childKeys = (displayBandsSection?.children ?? []).flatMap(child => {
      if (child.key) {
        return [child.key]
      }

      return (child.children ?? []).flatMap(grandchild => grandchild.key ? [grandchild.key] : [])
    })

    expect(englishRuntimeSection?.badge).toBe('02')
    expect(frenchRuntimeSection?.badge).toBe('03')
    expect(adaptiveRefinementSection?.type).toBe('accordion')
    expect(adaptiveRefinementSection?.default_open).toBe(false)
    expect(adaptiveThresholdsSection?.type).toBe('accordion')
    expect(adaptiveThresholdsSection?.default_open).toBe(false)
    expect(displayBandsSection?.type).toBe('accordion')
    expect(displayBandsSection?.default_open).toBe(false)
    expect(childKeys).toEqual(expect.arrayContaining([
      'request_config.presentation.mixedFitMinPercent',
      'request_config.presentation.strongFitMinPercent',
      'request_config.presentation.toneByBand.off_track',
      'request_config.presentation.toneByBand.mixed_fit',
      'request_config.presentation.toneByBand.strong_fit'
    ]))
  })

  it('ships plugin defaults that match the current upstream scorer defaults', () => {
    const configSchema = JSON.parse(readFileSync(
      new URL('../ui/config.json', import.meta.url),
      'utf8'
    )) as {
      children?: Array<{
        children?: Array<{
          key?: string
          default_value?: string | number | boolean | null
          children?: Array<{
            key?: string
            default_value?: string | number | boolean | null
          }>
        }>
      }>
    }

    const defaultValues = new Map<string, string | number | boolean | null>()

    for (const section of configSchema.children ?? []) {
      for (const child of section.children ?? []) {
        if (child.key) {
          defaultValues.set(child.key, child.default_value ?? null)
        }

        for (const grandchild of child.children ?? []) {
          if (grandchild.key) {
            defaultValues.set(grandchild.key, grandchild.default_value ?? null)
          }
        }
      }
    }

    expect(defaultValues.get('request_config.adaptiveRefinementPolicy')).toBe('adaptive')
    expect(defaultValues.get('request_config.adaptiveRefinement.lowStopOverallPercent')).toBe(10)
    expect(defaultValues.get('request_config.adaptiveRefinement.lowStopAnswerSupport')).toBe(0.25)
    expect(defaultValues.get('request_config.adaptiveRefinement.lowStopMaxCriterionPercent')).toBe(15)
    expect(defaultValues.get('request_config.adaptiveRefinement.lowStopSecondaryOverallBuffer')).toBe(5)
    expect(defaultValues.get('request_config.adaptiveRefinement.lowStopLowCriterionShare')).toBe(0.66)
    expect(defaultValues.get('request_config.adaptiveRefinement.highStopOverallPercent')).toBe(100)
    expect(defaultValues.get('request_config.adaptiveRefinement.highStopMinCriterionPercent')).toBe(100)
    expect(defaultValues.get('request_config.adaptiveRefinement.highStopSpreadPercent')).toBe(0)
    expect(defaultValues.get('request_config.adaptiveRefinement.highStopWeakAnswerGate')).toBe(1)
    expect(defaultValues.get('request_config.adaptiveRefinement.disableHighStopForConstraintQuestions')).toBe(true)
    expect(defaultValues.get('request_config.adaptiveRefinement.disableHighStopForComparison')).toBe(true)
    expect(defaultValues.get('request_config.adaptiveRefinement.disableHighStopForPlanning')).toBe(true)
    expect(defaultValues.get('request_config.presentation.mixedFitMinPercent')).toBe(45)
    expect(defaultValues.get('request_config.presentation.strongFitMinPercent')).toBe(70)
    expect(defaultValues.get('request_config.presentation.toneByBand.off_track')).toBe('error')
    expect(defaultValues.get('request_config.presentation.toneByBand.mixed_fit')).toBe('warning')
    expect(defaultValues.get('request_config.presentation.toneByBand.strong_fit')).toBe('success')
  })

  it('maps the language-agnostic score result to localized plugin labels', () => {
    const result = createQualityMeterRuntimeResult({
      overallPercent: 82,
      band: 'strong_fit',
      tone: 'success',
      breakdown: [
        {
          label: 'Names the agreement objectives clearly',
          weight: 4,
          weightShare: 0.4,
          raw: 0.82,
          percent: 82
        }
      ]
    } as never, 'full', {
      shouldRunFullPass: true,
      reason: 'mid_band',
      riskBand: 'medium',
      fastOverallPercent: 58
    })

    expect(result.overallPercent).toBe(82)
    expect(result.band).toBe('strong_fit')
    expect(result.tone).toBe('success')
    expect(result.label).toEqual({
      en: 'Strong fit',
      fr: 'Bonne adéquation'
    })
    expect(result.statusLabel).toEqual({
      en: 'Strong fit',
      fr: 'Bonne adéquation'
    })
    expect(result.scoreMode).toBe('full')
    expect(result.refinement).toEqual({
      shouldRunFullPass: true,
      reason: 'mid_band',
      riskBand: 'medium',
      fastOverallPercent: 58
    })
    expect(result.activity).toBeNull()
  })

  it('resolves plugin asset URLs against the injected host origin inside browser workers', () => {
    const qualityMeterGlobal = globalThis as typeof globalThis & {
      __GCS_PLUGIN_HOST_ORIGIN__?: string
    }
    const previousHostOrigin = qualityMeterGlobal.__GCS_PLUGIN_HOST_ORIGIN__

    try {
      qualityMeterGlobal.__GCS_PLUGIN_HOST_ORIGIN__ = 'http://localhost:3000'

      expect(resolveQualityMeterAssetUrl('/api/plugn/assets/quality-meter/models/')).toBe(
        'http://localhost:3000/api/plugn/assets/quality-meter/models/'
      )
    } finally {
      qualityMeterGlobal.__GCS_PLUGIN_HOST_ORIGIN__ = previousHostOrigin
    }
  })

  it('builds localized pending and refining runtime states', () => {
    const pendingResult = createQualityMeterPendingResult()
    const refiningResult = createQualityMeterRefiningResult({
      overallPercent: 48,
      band: 'mixed_fit',
      tone: 'warning',
      breakdown: []
    } as never, {
      shouldRunFullPass: true,
      reason: 'mid_band',
      riskBand: 'medium',
      fastOverallPercent: 48
    })

    expect(pendingResult).toEqual({
      statusLabel: {
        en: 'Scoring',
        fr: 'Évaluation'
      },
      tone: 'warning',
      activity: null
    })
    expect(refiningResult.statusLabel).toEqual({
      en: 'Mixed fit',
      fr: 'Adéquation partielle'
    })
    expect(refiningResult.activity).toEqual({
      label: {
        en: 'Refining',
        fr: 'Affinage'
      }
    })
  })

  it('preserves a fast-pass result when the library says no refinement is needed', () => {
    const result = createQualityMeterRuntimeResult({
      overallPercent: 78,
      band: 'strong_fit',
      tone: 'success',
      breakdown: []
    } as never, 'fast', {
      shouldRunFullPass: false,
      reason: 'stable_strong',
      riskBand: 'low',
      fastOverallPercent: 78
    })

    expect(result.scoreMode).toBe('fast')
    expect(result.refinement).toEqual({
      shouldRunFullPass: false,
      reason: 'stable_strong',
      riskBand: 'low',
      fastOverallPercent: 78
    })
  })

  it('forces library model fetches through the host-aware worker fetch wrapper', () => {
    const workerSource = readFileSync(
      new URL('../client/worker-source.js', import.meta.url),
      'utf8'
    )

    expect(workerSource).toContain("mode: 'url'")
    expect(workerSource).toContain('const MODEL_REMOTE_PATH_TEMPLATE = `${MODEL_BASE_URL.pathname}{model}/`')
    expect(workerSource).toContain('transformersEnv.fetch = async (input, init) => {')
    expect(workerSource).toContain('return new URL(String(input), MODEL_BASE_PATH)')
    expect(workerSource).toContain('return await fetch(resolvedUrl.toString(), init)')
    expect(workerSource).toContain('config: requestConfig')
    expect(workerSource).toContain('requestConfig,')
  })

  it('configures every bundled transformers runtime copy to use local ONNX assets', () => {
    const bundledWorker = readFileSync(
      new URL('../client/worker.js', import.meta.url),
      'utf8'
    )

    expect(bundledWorker).toContain('env2.useWasmCache = false;')
    expect(bundledWorker).toContain('env2.backends.onnx.wasm.proxy = false;')
    expect(bundledWorker).toContain('env2.backends.onnx.wasm.wasmPaths = {')
    expect(bundledWorker).toContain('mjs: `${WASM_BASE_PATH}ort-wasm-simd-threaded.asyncify.mjs`')
    expect(bundledWorker).toContain('wasm: `${WASM_BASE_PATH}ort-wasm-simd-threaded.asyncify.wasm`')
    expect(bundledWorker).toContain('context.input.config?.presentation')
    expect(bundledWorker).toContain('input.requestConfig?.adaptiveRefinementPolicy')
  })

  it('clears the cached scorer promise after a worker model load failure', () => {
    const workerSource = readFileSync(
      new URL('../client/worker-source.js', import.meta.url),
      'utf8'
    )

    expect(workerSource).toContain('const pendingScorer = (async () => {')
    expect(workerSource).toContain('pendingScorer.catch(() => {')
    expect(workerSource).toContain('if (scorerPromise === pendingScorer) {')
    expect(workerSource).toContain('scorerPromise = null')
  })
})
