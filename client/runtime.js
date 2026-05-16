const QUALITY_METER_LABELS = {
  off_track: {
    en: 'Off track',
    fr: 'Hors trajectoire'
  },
  mixed_fit: {
    en: 'Mixed fit',
    fr: 'Adéquation partielle'
  },
  strong_fit: {
    en: 'Strong fit',
    fr: 'Bonne adéquation'
  }
}

const QUALITY_METER_STATUS_LABELS = {
  scoring: {
    en: 'Scoring',
    fr: 'Évaluation'
  },
  refining: {
    en: 'Refining',
    fr: 'Affinage'
  }
}

const QUALITY_METER_REFINEMENT_POLICIES = new Set([
  'always',
  'adaptive',
  'never'
])

const QUALITY_METER_PRESENTATION_TONES = new Set([
  'error',
  'warning',
  'success'
])

const QUALITY_METER_TASK_TYPES = new Set([
  'comparison',
  'planning'
])

/**
 * Resolves one plugin asset URL against the host origin injected by the sandbox bootstrap.
 *
 * @param {string} relativePath Plugin asset path served by the GCS host.
 * @returns {string}
 */
export const resolveQualityMeterAssetUrl = relativePath => {
  const hostOrigin = typeof globalThis.__GCS_PLUGIN_HOST_ORIGIN__ === 'string'
    ? globalThis.__GCS_PLUGIN_HOST_ORIGIN__
    : ''

  if (hostOrigin.length === 0) {
    if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin.length > 0) {
      return new URL(relativePath, globalThis.location.origin).toString()
    }

    return relativePath
  }

  return `${hostOrigin}${relativePath}`
}

/**
 * Resolves the runtime locale used for plugin field scoring.
 *
 * @param {string} locale Active field locale from the host runtime.
 * @returns {'en' | 'fr'}
 */
export const resolveQualityMeterLocale = locale => {
  return locale === 'fr' ? 'fr' : 'en'
}

/**
 * Normalizes unknown plugin settings nodes to plain objects.
 *
 * @param {unknown} value Candidate nested settings value.
 * @returns {Record<string, unknown>}
 */
const resolveQualityMeterObject = value => {
  return typeof value === 'object' && value !== null
    ? value
    : {}
}

/**
 * Resolves one bounded numeric request-config value.
 *
 * @param {unknown} value Candidate numeric value from plugin settings.
 * @param {number} min Inclusive lower bound.
 * @param {number} max Inclusive upper bound.
 * @returns {number | undefined}
 */
const resolveQualityMeterNumber = (value, min, max) => {
  const nextValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(nextValue)) {
    return undefined
  }

  return Math.min(max, Math.max(min, nextValue))
}

const resolveQualityMeterBoolean = value => {
  return typeof value === 'boolean' ? value : undefined
}

const assignResolvedQualityMeterNumber = (target, key, settings, min, max) => {
  const value = resolveQualityMeterNumber(settings[key], min, max)

  if (value !== undefined) {
    target[key] = value
  }
}

const resolveQualityMeterToneByBandConfig = presentationSettings => {
  const toneByBand = {}
  const toneByBandSettings = resolveQualityMeterObject(presentationSettings.toneByBand)

  for (const [band, tone] of Object.entries(toneByBandSettings)) {
    if (typeof tone !== 'string' || !QUALITY_METER_PRESENTATION_TONES.has(tone)) {
      continue
    }

    if (band === 'off_track' || band === 'mixed_fit' || band === 'strong_fit') {
      toneByBand[band] = tone
    }
  }

  return Object.keys(toneByBand).length > 0 ? toneByBand : undefined
}

const resolveQualityMeterPresentationConfig = requestConfigSettings => {
  const presentationSettings = resolveQualityMeterObject(requestConfigSettings.presentation)
  const presentation = {}

  assignResolvedQualityMeterNumber(presentation, 'mixedFitMinPercent', presentationSettings, 0, 100)
  assignResolvedQualityMeterNumber(presentation, 'strongFitMinPercent', presentationSettings, 0, 100)

  const toneByBand = resolveQualityMeterToneByBandConfig(presentationSettings)

  if (toneByBand !== undefined) {
    presentation.toneByBand = toneByBand
  }

  return Object.keys(presentation).length > 0 ? presentation : undefined
}

const addQualityMeterTaskTypes = (target, taskTypes) => {
  if (!Array.isArray(taskTypes)) {
    return false
  }

  for (const taskType of taskTypes) {
    if (typeof taskType === 'string' && QUALITY_METER_TASK_TYPES.has(taskType)) {
      target.add(taskType)
    }
  }

  return true
}

const applyQualityMeterTaskTypeToggle = (target, value, taskType) => {
  if (value === true) {
    target.add(taskType)
  }

  if (value === false) {
    target.delete(taskType)
  }

  return typeof value === 'boolean'
}

const resolveQualityMeterTaskTypeStopConfig = adaptiveRefinementSettings => {
  const disableHighStopForTaskTypes = new Set()
  const hasExplicitTaskTypeList = addQualityMeterTaskTypes(
    disableHighStopForTaskTypes,
    adaptiveRefinementSettings.disableHighStopForTaskTypes
  )
  const hasExplicitComparisonToggle = applyQualityMeterTaskTypeToggle(
    disableHighStopForTaskTypes,
    adaptiveRefinementSettings.disableHighStopForComparison,
    'comparison'
  )
  const hasExplicitPlanningToggle = applyQualityMeterTaskTypeToggle(
    disableHighStopForTaskTypes,
    adaptiveRefinementSettings.disableHighStopForPlanning,
    'planning'
  )

  return hasExplicitTaskTypeList || hasExplicitComparisonToggle || hasExplicitPlanningToggle
    ? [...disableHighStopForTaskTypes]
    : undefined
}

const resolveQualityMeterAdaptiveRefinementConfig = requestConfigSettings => {
  const adaptiveRefinementSettings = resolveQualityMeterObject(requestConfigSettings.adaptiveRefinement)
  const adaptiveRefinement = {}

  assignResolvedQualityMeterNumber(adaptiveRefinement, 'lowStopOverallPercent', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'lowStopAnswerSupport', adaptiveRefinementSettings, 0, 1)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'lowStopMaxCriterionPercent', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'lowStopSecondaryOverallBuffer', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'lowStopLowCriterionShare', adaptiveRefinementSettings, 0, 1)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'highStopOverallPercent', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'highStopMinCriterionPercent', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'highStopSpreadPercent', adaptiveRefinementSettings, 0, 100)
  assignResolvedQualityMeterNumber(adaptiveRefinement, 'highStopWeakAnswerGate', adaptiveRefinementSettings, 0, 1)

  const disableHighStopForConstraintQuestions = resolveQualityMeterBoolean(
    adaptiveRefinementSettings.disableHighStopForConstraintQuestions
  )

  if (disableHighStopForConstraintQuestions !== undefined) {
    adaptiveRefinement.disableHighStopForConstraintQuestions = disableHighStopForConstraintQuestions
  }

  const disableHighStopForTaskTypes = resolveQualityMeterTaskTypeStopConfig(adaptiveRefinementSettings)

  if (disableHighStopForTaskTypes !== undefined) {
    adaptiveRefinement.disableHighStopForTaskTypes = disableHighStopForTaskTypes
  }

  return Object.keys(adaptiveRefinement).length > 0 ? adaptiveRefinement : undefined
}

/**
 * Resolves the per-field request config forwarded to the latest scorer surface.
 *
 * @param {Record<string, unknown>} settings Activation settings from the plugin host.
 * @returns {Record<string, unknown> | undefined}
 */
export const resolveQualityMeterRequestConfig = settings => {
  const requestConfigSettings = resolveQualityMeterObject(settings.request_config)
  const requestConfig = {}
  const presentation = resolveQualityMeterPresentationConfig(requestConfigSettings)
  const adaptiveRefinement = resolveQualityMeterAdaptiveRefinementConfig(requestConfigSettings)

  if (
    typeof requestConfigSettings.adaptiveRefinementPolicy === 'string'
    && QUALITY_METER_REFINEMENT_POLICIES.has(requestConfigSettings.adaptiveRefinementPolicy)
  ) {
    requestConfig.adaptiveRefinementPolicy = requestConfigSettings.adaptiveRefinementPolicy
  }

  if (presentation !== undefined) {
    requestConfig.presentation = presentation
  }

  if (adaptiveRefinement !== undefined) {
    requestConfig.adaptiveRefinement = adaptiveRefinement
  }

  return Object.keys(requestConfig).length > 0 ? requestConfig : undefined
}

/**
 * Resolves plugin-owned localized question text and weighted criteria for the active field locale.
 *
 * @param {Record<string, unknown>} settings Activation settings from the plugin host.
 * @param {'en' | 'fr'} locale Active runtime locale for the field.
 * @returns {{ question: string, criteria: Array<string | { label: string, weight?: number }>, requestConfig?: Record<string, unknown> }}
 */
export const resolveQualityMeterInput = (settings, locale) => {
  const questionConfig = resolveQualityMeterObject(settings.question)
  const criteriaConfig = resolveQualityMeterObject(settings.criteria)

  const question = String(questionConfig[locale] ?? '').trim()
  const localizedCriteria = criteriaConfig[locale]
  const criteria = Array.isArray(localizedCriteria)
    ? localizedCriteria.filter(item => {
        if (typeof item === 'string') {
          return item.trim().length > 0
        }

        if (typeof item !== 'object' || item === null) {
          return false
        }

        return String(item.label ?? '').trim().length > 0
      })
    : []

  return {
    question,
    criteria,
    requestConfig: resolveQualityMeterRequestConfig(settings)
  }
}

/**
 * Maps the language-agnostic library result into the localized plugin runtime payload expected by the host renderer.
 *
 * @param {{ overallPercent: number, band: 'off_track' | 'mixed_fit' | 'strong_fit', tone: string, breakdown: unknown[] }} result Language-agnostic library score result.
 * @param {'fast' | 'full'} scoreMode Final score mode used for the response.
 * @param {{ shouldRunFullPass: boolean, reason: string, riskBand: string, fastOverallPercent: number } | null} refinement Adaptive refinement decision.
 * @returns {{ overallPercent: number, band: 'off_track' | 'mixed_fit' | 'strong_fit', tone: string, label: { en: string, fr: string }, scoreMode: 'fast' | 'full', refinement: { shouldRunFullPass: boolean, reason: string, riskBand: string, fastOverallPercent: number } | null, breakdown: unknown[] }}
 */
export const createQualityMeterRuntimeResult = (result, scoreMode, refinement) => {
  return {
    overallPercent: result.overallPercent,
    band: result.band,
    tone: result.tone,
    label: QUALITY_METER_LABELS[result.band],
    statusLabel: QUALITY_METER_LABELS[result.band],
    scoreMode,
    refinement,
    breakdown: result.breakdown,
    activity: null
  }
}

/**
 * Creates the localized pending state shown while the worker is still evaluating the field.
 *
 * @returns {{ statusLabel: { en: string, fr: string }, tone: 'warning', activity: null }}
 */
export const createQualityMeterPendingResult = () => {
  return {
    statusLabel: QUALITY_METER_STATUS_LABELS.scoring,
    tone: 'warning',
    activity: null
  }
}

/**
 * Creates the localized refining state shown after the fast pass while the full pass is running.
 *
 * @param {{ overallPercent: number, band: 'off_track' | 'mixed_fit' | 'strong_fit', tone: string, breakdown: unknown[] }} result Fast-pass language-agnostic score result.
 * @param {{ shouldRunFullPass: boolean, reason: string, riskBand: string, fastOverallPercent: number } | null} refinement Adaptive refinement decision.
 * @returns {{ overallPercent: number, band: 'off_track' | 'mixed_fit' | 'strong_fit', tone: string, label: { en: string, fr: string }, statusLabel: { en: string, fr: string }, scoreMode: 'fast', refinement: { shouldRunFullPass: boolean, reason: string, riskBand: string, fastOverallPercent: number } | null, breakdown: unknown[], activity: { label: { en: string, fr: string } } }}
 */
export const createQualityMeterRefiningResult = (result, refinement) => {
  return {
    ...createQualityMeterRuntimeResult(result, 'fast', refinement),
    activity: {
      label: QUALITY_METER_STATUS_LABELS.refining
    }
  }
}
