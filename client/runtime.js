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

/**
 * Resolves the per-field request config forwarded to the latest scorer surface.
 *
 * @param {Record<string, unknown>} settings Activation settings from the plugin host.
 * @returns {Record<string, unknown> | undefined}
 */
export const resolveQualityMeterRequestConfig = settings => {
  const requestConfigSettings = resolveQualityMeterObject(settings.request_config)
  const requestConfig = {}

  if (
    typeof requestConfigSettings.adaptiveRefinementPolicy === 'string'
    && QUALITY_METER_REFINEMENT_POLICIES.has(requestConfigSettings.adaptiveRefinementPolicy)
  ) {
    requestConfig.adaptiveRefinementPolicy = requestConfigSettings.adaptiveRefinementPolicy
  }

  const presentationSettings = resolveQualityMeterObject(requestConfigSettings.presentation)
  const presentation = {}
  const mixedFitMinPercent = resolveQualityMeterNumber(presentationSettings.mixedFitMinPercent, 0, 100)
  const strongFitMinPercent = resolveQualityMeterNumber(presentationSettings.strongFitMinPercent, 0, 100)

  if (mixedFitMinPercent !== undefined) {
    presentation.mixedFitMinPercent = mixedFitMinPercent
  }

  if (strongFitMinPercent !== undefined) {
    presentation.strongFitMinPercent = strongFitMinPercent
  }

  const toneByBandSettings = resolveQualityMeterObject(presentationSettings.toneByBand)
  const toneByBand = {}

  for (const [band, tone] of Object.entries(toneByBandSettings)) {
    if (typeof tone !== 'string' || !QUALITY_METER_PRESENTATION_TONES.has(tone)) {
      continue
    }

    if (band === 'off_track' || band === 'mixed_fit' || band === 'strong_fit') {
      toneByBand[band] = tone
    }
  }

  if (Object.keys(toneByBand).length > 0) {
    presentation.toneByBand = toneByBand
  }

  if (Object.keys(presentation).length > 0) {
    requestConfig.presentation = presentation
  }

  const adaptiveRefinementSettings = resolveQualityMeterObject(requestConfigSettings.adaptiveRefinement)
  const adaptiveRefinement = {}
  const lowStopOverallPercent = resolveQualityMeterNumber(adaptiveRefinementSettings.lowStopOverallPercent, 0, 100)
  const lowStopAnswerSupport = resolveQualityMeterNumber(adaptiveRefinementSettings.lowStopAnswerSupport, 0, 1)
  const lowStopMaxCriterionPercent = resolveQualityMeterNumber(adaptiveRefinementSettings.lowStopMaxCriterionPercent, 0, 100)
  const lowStopSecondaryOverallBuffer = resolveQualityMeterNumber(adaptiveRefinementSettings.lowStopSecondaryOverallBuffer, 0, 100)
  const lowStopLowCriterionShare = resolveQualityMeterNumber(adaptiveRefinementSettings.lowStopLowCriterionShare, 0, 1)
  const highStopOverallPercent = resolveQualityMeterNumber(adaptiveRefinementSettings.highStopOverallPercent, 0, 100)
  const highStopMinCriterionPercent = resolveQualityMeterNumber(adaptiveRefinementSettings.highStopMinCriterionPercent, 0, 100)
  const highStopSpreadPercent = resolveQualityMeterNumber(adaptiveRefinementSettings.highStopSpreadPercent, 0, 100)
  const highStopWeakAnswerGate = resolveQualityMeterNumber(adaptiveRefinementSettings.highStopWeakAnswerGate, 0, 1)
  const disableHighStopForConstraintQuestions = resolveQualityMeterBoolean(
    adaptiveRefinementSettings.disableHighStopForConstraintQuestions
  )

  if (lowStopOverallPercent !== undefined) {
    adaptiveRefinement.lowStopOverallPercent = lowStopOverallPercent
  }

  if (lowStopAnswerSupport !== undefined) {
    adaptiveRefinement.lowStopAnswerSupport = lowStopAnswerSupport
  }

  if (lowStopMaxCriterionPercent !== undefined) {
    adaptiveRefinement.lowStopMaxCriterionPercent = lowStopMaxCriterionPercent
  }

  if (lowStopSecondaryOverallBuffer !== undefined) {
    adaptiveRefinement.lowStopSecondaryOverallBuffer = lowStopSecondaryOverallBuffer
  }

  if (lowStopLowCriterionShare !== undefined) {
    adaptiveRefinement.lowStopLowCriterionShare = lowStopLowCriterionShare
  }

  if (highStopOverallPercent !== undefined) {
    adaptiveRefinement.highStopOverallPercent = highStopOverallPercent
  }

  if (highStopMinCriterionPercent !== undefined) {
    adaptiveRefinement.highStopMinCriterionPercent = highStopMinCriterionPercent
  }

  if (highStopSpreadPercent !== undefined) {
    adaptiveRefinement.highStopSpreadPercent = highStopSpreadPercent
  }

  if (highStopWeakAnswerGate !== undefined) {
    adaptiveRefinement.highStopWeakAnswerGate = highStopWeakAnswerGate
  }

  if (disableHighStopForConstraintQuestions !== undefined) {
    adaptiveRefinement.disableHighStopForConstraintQuestions = disableHighStopForConstraintQuestions
  }

  const disableHighStopForTaskTypes = new Set()
  const hasExplicitComparisonToggle = typeof adaptiveRefinementSettings.disableHighStopForComparison === 'boolean'
  const hasExplicitPlanningToggle = typeof adaptiveRefinementSettings.disableHighStopForPlanning === 'boolean'
  const hasExplicitTaskTypeList = Array.isArray(adaptiveRefinementSettings.disableHighStopForTaskTypes)

  if (hasExplicitTaskTypeList) {
    for (const taskType of adaptiveRefinementSettings.disableHighStopForTaskTypes) {
      if (typeof taskType === 'string' && QUALITY_METER_TASK_TYPES.has(taskType)) {
        disableHighStopForTaskTypes.add(taskType)
      }
    }
  }

  if (adaptiveRefinementSettings.disableHighStopForComparison === true) {
    disableHighStopForTaskTypes.add('comparison')
  }

  if (adaptiveRefinementSettings.disableHighStopForComparison === false) {
    disableHighStopForTaskTypes.delete('comparison')
  }

  if (adaptiveRefinementSettings.disableHighStopForPlanning === true) {
    disableHighStopForTaskTypes.add('planning')
  }

  if (adaptiveRefinementSettings.disableHighStopForPlanning === false) {
    disableHighStopForTaskTypes.delete('planning')
  }

  if (hasExplicitComparisonToggle || hasExplicitPlanningToggle || hasExplicitTaskTypeList) {
    adaptiveRefinement.disableHighStopForTaskTypes = [...disableHighStopForTaskTypes]
  }

  if (Object.keys(adaptiveRefinement).length > 0) {
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
