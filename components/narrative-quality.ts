/* eslint-disable jsdoc/require-jsdoc */
import type { JsonValue } from '~~/shared/types/database'

export type NarrativeQualityLocale = 'en' | 'fr'
export type NarrativeQualityTone = 'error' | 'warning' | 'success'
export type NarrativeQualityRefinementPolicy = 'always' | 'adaptive' | 'never'
export type NarrativeQualityTargetKey =
  | 'agreement_top_level'
  | 'assessment_review_alignment_narrative'
  | 'assessment_question_comment'

export interface NarrativeQualityCriterion {
  label: string
  weight: number
}

export interface NarrativeQualityRequestConfig {
  adaptiveRefinementPolicy: NarrativeQualityRefinementPolicy
  adaptiveRefinement: {
    lowStopOverallPercent: number
    lowStopAnswerSupport: number
    lowStopMaxCriterionPercent: number
    lowStopSecondaryOverallBuffer: number
    lowStopLowCriterionShare: number
    highStopOverallPercent: number
    highStopMinCriterionPercent: number
    highStopSpreadPercent: number
    highStopWeakAnswerGate: number
    disableHighStopForConstraintQuestions: boolean
    disableHighStopForComparison: boolean
    disableHighStopForPlanning: boolean
  }
  presentation: {
    mixedFitMinPercent: number
    strongFitMinPercent: number
    toneByBand: {
      off_track: NarrativeQualityTone
      mixed_fit: NarrativeQualityTone
      strong_fit: NarrativeQualityTone
    }
  }
}

export interface NarrativeQualityProfile {
  enabled: boolean
  question: Record<NarrativeQualityLocale, string>
  criteria: Record<NarrativeQualityLocale, NarrativeQualityCriterion[]>
  request_config: NarrativeQualityRequestConfig
}

export interface NarrativeQualityAssessmentQuestionTarget {
  key: string
  sectionName: string
  subSectionName: string
  questionName: string
  label: Record<NarrativeQualityLocale, string>
}

export interface NarrativeQualityAssessmentTarget {
  schemaId: string
  version: number
  name: Record<NarrativeQualityLocale, string>
  questions: NarrativeQualityAssessmentQuestionTarget[]
}

export interface NarrativeQualityAssessmentConfig {
  reviewAlignment: NarrativeQualityProfile
  questionComments: Record<string, NarrativeQualityProfile>
}

export interface NarrativeQualityConfig {
  agreementTopLevel: NarrativeQualityProfile
  assessmentDefaults: {
    reviewAlignment: NarrativeQualityProfile
    questionComment: NarrativeQualityProfile
  }
  assessments: Record<string, NarrativeQualityAssessmentConfig>
}

export interface NarrativeQualityTargetDefinition {
  key: NarrativeQualityTargetKey
  label: Record<NarrativeQualityLocale, string>
  description: Record<NarrativeQualityLocale, string>
}

export type NarrativeQualityResolvedConfigKey =
  | {
    kind: 'agreement_top_level'
  }
  | {
    kind: 'assessment_review_alignment_narrative'
    schemaId: string
  }
  | {
    kind: 'assessment_question_comment'
    schemaId: string
    questionKey: string
  }

export interface NarrativeQualityTarget {
  key: string
  configKey: NarrativeQualityResolvedConfigKey
  locale: NarrativeQualityLocale
  label: string
  text: string
}

export const narrativeQualityTargetDefinitions: NarrativeQualityTargetDefinition[] = [
  {
    key: 'agreement_top_level',
    label: {
      en: 'Agreement descriptions',
      fr: 'Descriptions d’entente'
    },
    description: {
      en: 'Scores the English and French agreement description fields.',
      fr: 'Évalue les champs de description français et anglais de l’entente.'
    }
  },
  {
    key: 'assessment_review_alignment_narrative',
    label: {
      en: 'Assessment review alignment',
      fr: 'Alignement de l’examen d’évaluation'
    },
    description: {
      en: 'Configure a separate narrative prompt for each assessment schema on this stream.',
      fr: 'Configurez une question narrative distincte pour chaque schéma d’évaluation du volet.'
    }
  },
  {
    key: 'assessment_question_comment',
    label: {
      en: 'Assessment question comments',
      fr: 'Commentaires des questions d’évaluation'
    },
    description: {
      en: 'Configure question-comment scoring per assessment schema and per question.',
      fr: 'Configurez la notation des commentaires de question par schéma d’évaluation et par question.'
    }
  }
]

const defaultCriteria = {
  en: [
    { label: 'Clearly answers the prompt with enough detail to support a decision.', weight: 3 },
    { label: 'Uses specific facts, outcomes, dates, or constraints rather than generic phrasing.', weight: 2 },
    { label: 'Is coherent, concise, and understandable for a reviewer.', weight: 2 }
  ],
  fr: [
    { label: 'Répond clairement à la question avec assez de détails pour appuyer une décision.', weight: 3 },
    { label: 'Utilise des faits, résultats, dates ou contraintes précis plutôt que des formules génériques.', weight: 2 },
    { label: 'Est cohérent, concis et compréhensible pour une personne responsable de l’examen.', weight: 2 }
  ]
} satisfies Record<NarrativeQualityLocale, NarrativeQualityCriterion[]>

const defaultQuestions = {
  agreement_top_level: {
    en: 'Does this agreement description provide enough specific, relevant, and coherent information for a reviewer to assess the agreement confidently?',
    fr: 'Cette description d’entente fournit-elle assez d’information précise, pertinente et cohérente pour permettre une évaluation fiable?'
  },
  assessment_review_alignment_narrative: {
    en: 'Does this review narrative clearly explain how the assessment result aligns with the evidence and decision context?',
    fr: 'Ce narratif d’examen explique-t-il clairement comment le résultat d’évaluation s’aligne avec les preuves et le contexte décisionnel?'
  },
  assessment_question_comment: {
    en: 'Does this assessment question comment provide specific, relevant justification for the selected response?',
    fr: 'Ce commentaire de question d’évaluation fournit-il une justification précise et pertinente pour la réponse sélectionnée?'
  }
} satisfies Record<NarrativeQualityTargetKey, Record<NarrativeQualityLocale, string>>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const asString = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback

const asNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

const asPolicy = (value: unknown, fallback: NarrativeQualityRefinementPolicy): NarrativeQualityRefinementPolicy => {
  if (value === 'always' || value === 'adaptive' || value === 'never') {
    return value
  }

  return fallback
}

const asTone = (value: unknown, fallback: NarrativeQualityTone): NarrativeQualityTone => {
  if (value === 'error' || value === 'warning' || value === 'success') {
    return value
  }

  return fallback
}

const hasOwnProfileContent = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false
  }

  return 'enabled' in value
    || 'question' in value
    || 'criteria' in value
    || 'request_config' in value
}

const normalizeCriteria = (
  value: unknown,
  fallback: NarrativeQualityCriterion[]
): NarrativeQualityCriterion[] => {
  if (!Array.isArray(value)) {
    return fallback.map(item => ({ ...item }))
  }

  const normalized = value.flatMap(item => {
    if (!isRecord(item)) {
      return []
    }

    const label = asString(item.label, '').trim()
    if (label.length === 0) {
      return []
    }

    return [{
      label,
      weight: asNumber(item.weight, 1, 0.1, 10)
    }]
  })

  return normalized.length > 0 ? normalized : fallback.map(item => ({ ...item }))
}

const normalizeRequestConfig = (
  value: unknown,
  defaults: NarrativeQualityRequestConfig
): NarrativeQualityRequestConfig => {
  const requestConfig = isRecord(value) ? value : {}
  const adaptiveRefinement = isRecord(requestConfig.adaptiveRefinement) ? requestConfig.adaptiveRefinement : {}
  const presentation = isRecord(requestConfig.presentation) ? requestConfig.presentation : {}
  const toneByBand = isRecord(presentation.toneByBand) ? presentation.toneByBand : {}

  return {
    adaptiveRefinementPolicy: asPolicy(requestConfig.adaptiveRefinementPolicy, defaults.adaptiveRefinementPolicy),
    adaptiveRefinement: {
      lowStopOverallPercent: asNumber(adaptiveRefinement.lowStopOverallPercent, defaults.adaptiveRefinement.lowStopOverallPercent, 0, 100),
      lowStopAnswerSupport: asNumber(adaptiveRefinement.lowStopAnswerSupport, defaults.adaptiveRefinement.lowStopAnswerSupport, 0, 1),
      lowStopMaxCriterionPercent: asNumber(adaptiveRefinement.lowStopMaxCriterionPercent, defaults.adaptiveRefinement.lowStopMaxCriterionPercent, 0, 100),
      lowStopSecondaryOverallBuffer: asNumber(adaptiveRefinement.lowStopSecondaryOverallBuffer, defaults.adaptiveRefinement.lowStopSecondaryOverallBuffer, 0, 100),
      lowStopLowCriterionShare: asNumber(adaptiveRefinement.lowStopLowCriterionShare, defaults.adaptiveRefinement.lowStopLowCriterionShare, 0, 1),
      highStopOverallPercent: asNumber(adaptiveRefinement.highStopOverallPercent, defaults.adaptiveRefinement.highStopOverallPercent, 0, 100),
      highStopMinCriterionPercent: asNumber(adaptiveRefinement.highStopMinCriterionPercent, defaults.adaptiveRefinement.highStopMinCriterionPercent, 0, 100),
      highStopSpreadPercent: asNumber(adaptiveRefinement.highStopSpreadPercent, defaults.adaptiveRefinement.highStopSpreadPercent, 0, 100),
      highStopWeakAnswerGate: asNumber(adaptiveRefinement.highStopWeakAnswerGate, defaults.adaptiveRefinement.highStopWeakAnswerGate, 0, 1),
      disableHighStopForConstraintQuestions: asBoolean(
        adaptiveRefinement.disableHighStopForConstraintQuestions,
        defaults.adaptiveRefinement.disableHighStopForConstraintQuestions
      ),
      disableHighStopForComparison: asBoolean(
        adaptiveRefinement.disableHighStopForComparison,
        defaults.adaptiveRefinement.disableHighStopForComparison
      ),
      disableHighStopForPlanning: asBoolean(
        adaptiveRefinement.disableHighStopForPlanning,
        defaults.adaptiveRefinement.disableHighStopForPlanning
      )
    },
    presentation: {
      mixedFitMinPercent: asNumber(presentation.mixedFitMinPercent, defaults.presentation.mixedFitMinPercent, 0, 100),
      strongFitMinPercent: asNumber(presentation.strongFitMinPercent, defaults.presentation.strongFitMinPercent, 0, 100),
      toneByBand: {
        off_track: asTone(toneByBand.off_track, defaults.presentation.toneByBand.off_track),
        mixed_fit: asTone(toneByBand.mixed_fit, defaults.presentation.toneByBand.mixed_fit),
        strong_fit: asTone(toneByBand.strong_fit, defaults.presentation.toneByBand.strong_fit)
      }
    }
  }
}

const normalizeProfile = (
  value: unknown,
  defaults: NarrativeQualityProfile,
  enabledFallback = defaults.enabled
): NarrativeQualityProfile => {
  const root = isRecord(value) ? value : {}
  const question = isRecord(root.question) ? root.question : {}
  const criteria = isRecord(root.criteria) ? root.criteria : {}

  return {
    enabled: asBoolean(root.enabled, enabledFallback),
    question: {
      en: asString(question.en, defaults.question.en),
      fr: asString(question.fr, defaults.question.fr)
    },
    criteria: {
      en: normalizeCriteria(criteria.en, defaults.criteria.en),
      fr: normalizeCriteria(criteria.fr, defaults.criteria.fr)
    },
    request_config: normalizeRequestConfig(root.request_config, defaults.request_config)
  }
}

const readContextText = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const resolveLegacyTargetProfiles = (root: Record<string, unknown>) => {
  const targets = isRecord(root.targets) ? root.targets : {}
  const useLegacyRootForAllTargets = !isRecord(root.targets)

  return {
    agreement: useLegacyRootForAllTargets ? root : targets.agreement_top_level,
    reviewAlignment: useLegacyRootForAllTargets ? root : targets.assessment_review_alignment_narrative,
    questionComment: useLegacyRootForAllTargets ? root : targets.assessment_question_comment
  }
}

const cloneProfile = (profile: NarrativeQualityProfile): NarrativeQualityProfile => ({
  enabled: profile.enabled,
  question: {
    en: profile.question.en,
    fr: profile.question.fr
  },
  criteria: {
    en: profile.criteria.en.map(item => ({ ...item })),
    fr: profile.criteria.fr.map(item => ({ ...item }))
  },
  request_config: JSON.parse(JSON.stringify(profile.request_config)) as NarrativeQualityRequestConfig
})

const ensureAssessmentConfig = (
  assessments: Record<string, NarrativeQualityAssessmentConfig>,
  schemaId: string,
  defaults: NarrativeQualityConfig['assessmentDefaults']
): NarrativeQualityAssessmentConfig => {
  const existing = assessments[schemaId]
  if (existing) {
    return existing
  }

  const created: NarrativeQualityAssessmentConfig = {
    reviewAlignment: cloneProfile(defaults.reviewAlignment),
    questionComments: {}
  }
  assessments[schemaId] = created
  return created
}

export const buildNarrativeQualityQuestionKey = (
  sectionName: string,
  subSectionName: string,
  questionName: string
) => `${sectionName}::${subSectionName}::${questionName}`

export const createDefaultNarrativeQualityRequestConfig = (): NarrativeQualityRequestConfig => ({
  adaptiveRefinementPolicy: 'adaptive',
  adaptiveRefinement: {
    lowStopOverallPercent: 10,
    lowStopAnswerSupport: 0.25,
    lowStopMaxCriterionPercent: 15,
    lowStopSecondaryOverallBuffer: 5,
    lowStopLowCriterionShare: 0.66,
    highStopOverallPercent: 100,
    highStopMinCriterionPercent: 100,
    highStopSpreadPercent: 0,
    highStopWeakAnswerGate: 1,
    disableHighStopForConstraintQuestions: true,
    disableHighStopForComparison: true,
    disableHighStopForPlanning: true
  },
  presentation: {
    mixedFitMinPercent: 45,
    strongFitMinPercent: 70,
    toneByBand: {
      off_track: 'error',
      mixed_fit: 'warning',
      strong_fit: 'success'
    }
  }
})

export const createDefaultNarrativeQualityProfile = (
  targetKey: NarrativeQualityTargetKey
): NarrativeQualityProfile => ({
  enabled: false,
  question: {
    ...defaultQuestions[targetKey]
  },
  criteria: {
    en: defaultCriteria.en.map(item => ({ ...item })),
    fr: defaultCriteria.fr.map(item => ({ ...item }))
  },
  request_config: createDefaultNarrativeQualityRequestConfig()
})

export const createDefaultNarrativeQualityConfig = (): NarrativeQualityConfig => ({
  agreementTopLevel: createDefaultNarrativeQualityProfile('agreement_top_level'),
  assessmentDefaults: {
    reviewAlignment: createDefaultNarrativeQualityProfile('assessment_review_alignment_narrative'),
    questionComment: createDefaultNarrativeQualityProfile('assessment_question_comment')
  },
  assessments: {}
})

export const normalizeNarrativeQualityConfig = (
  value: Record<string, JsonValue> | null | undefined,
  catalog: NarrativeQualityAssessmentTarget[] = []
): NarrativeQualityConfig => {
  const defaults = createDefaultNarrativeQualityConfig()
  const root = isRecord(value) ? value : {}
  const legacyTargets = resolveLegacyTargetProfiles(root)
  const assessmentDefaultsRoot = isRecord(root.assessmentDefaults) ? root.assessmentDefaults : {}
  const assessmentsRoot = isRecord(root.assessments) ? root.assessments : {}

  const config: NarrativeQualityConfig = {
    agreementTopLevel: normalizeProfile(
      root.agreementTopLevel ?? legacyTargets.agreement,
      defaults.agreementTopLevel,
      hasOwnProfileContent(root.agreementTopLevel ?? legacyTargets.agreement)
    ),
    assessmentDefaults: {
      reviewAlignment: normalizeProfile(
        assessmentDefaultsRoot.reviewAlignment ?? legacyTargets.reviewAlignment,
        defaults.assessmentDefaults.reviewAlignment,
        hasOwnProfileContent(assessmentDefaultsRoot.reviewAlignment ?? legacyTargets.reviewAlignment)
      ),
      questionComment: normalizeProfile(
        assessmentDefaultsRoot.questionComment ?? legacyTargets.questionComment,
        defaults.assessmentDefaults.questionComment,
        hasOwnProfileContent(assessmentDefaultsRoot.questionComment ?? legacyTargets.questionComment)
      )
    },
    assessments: Object.fromEntries(Object.entries(assessmentsRoot).map(([schemaId, rawAssessment]) => {
      const assessment = isRecord(rawAssessment) ? rawAssessment : {}
      const questionCommentsRoot = isRecord(assessment.questionComments) ? assessment.questionComments : {}

      return [schemaId, {
        reviewAlignment: normalizeProfile(
          assessment.reviewAlignment,
          defaults.assessmentDefaults.reviewAlignment,
          hasOwnProfileContent(assessment.reviewAlignment)
        ),
        questionComments: Object.fromEntries(Object.entries(questionCommentsRoot).map(([questionKey, rawProfile]) => [
          questionKey,
          normalizeProfile(
            rawProfile,
            defaults.assessmentDefaults.questionComment,
            hasOwnProfileContent(rawProfile)
          )
        ]))
      }]
    }))
  }

  for (const assessment of catalog) {
    const assessmentConfig = ensureAssessmentConfig(config.assessments, assessment.schemaId, config.assessmentDefaults)

    for (const question of assessment.questions) {
      if (!assessmentConfig.questionComments[question.key]) {
        assessmentConfig.questionComments[question.key] = cloneProfile(config.assessmentDefaults.questionComment)
      }
    }
  }

  return config
}

export const toNarrativeQualityJson = (config: NarrativeQualityConfig): Record<string, JsonValue> =>
  JSON.parse(JSON.stringify(config)) as Record<string, JsonValue>

export const resolveNarrativeQualityTargetConfig = (
  config: NarrativeQualityConfig,
  target: NarrativeQualityResolvedConfigKey
): NarrativeQualityProfile | null => {
  if (target.kind === 'agreement_top_level') {
    return config.agreementTopLevel.enabled ? config.agreementTopLevel : null
  }

  if (target.kind === 'assessment_review_alignment_narrative') {
    const profile = config.assessments[target.schemaId]?.reviewAlignment ?? null
    return profile?.enabled ? profile : null
  }

  const profile = config.assessments[target.schemaId]?.questionComments[target.questionKey] ?? null
  return profile?.enabled ? profile : null
}

const getQuestionLabel = (question: Record<string, unknown> | null, locale: NarrativeQualityLocale) => {
  const questionLabel = isRecord(question?.question) ? question.question : {}
  const label = locale === 'fr' ? questionLabel.fr : questionLabel.en
  return readContextText(label)
}

const asLocale = (value: unknown, fallback: NarrativeQualityLocale): NarrativeQualityLocale =>
  value === 'fr' ? 'fr' : value === 'en' ? 'en' : fallback

export const resolveNarrativeQualityTargets = (
  context: Record<string, unknown>,
  activeLocale: string
): NarrativeQualityTarget[] => {
  const locale: NarrativeQualityLocale = activeLocale === 'fr' ? 'fr' : 'en'
  const textarea = isRecord(context.textarea) ? context.textarea : null

  if (textarea) {
    const textareaKind = readContextText(textarea.kind)
    const textareaLocale = asLocale(textarea.locale, locale)
    const textareaLabel = readContextText(textarea.label)
    const textareaText = readContextText(textarea.text)

    if (textareaKind === 'agreement.description') {
      return textareaText.length > 0
        ? [{
            key: `agreement-description-${textareaLocale}`,
            configKey: { kind: 'agreement_top_level' },
            locale: textareaLocale,
            label: textareaLabel || (textareaLocale === 'fr' ? 'Description française' : 'English description'),
            text: textareaText
          }]
        : []
    }

    const assessmentSchemaId = readContextText(textarea.assessmentSchemaId)
    if (textareaKind === 'assessment.reviewAlignment') {
      return textareaText.length > 0 && assessmentSchemaId.length > 0
        ? [{
            key: `review-alignment-narrative-${assessmentSchemaId}`,
            configKey: {
              kind: 'assessment_review_alignment_narrative',
              schemaId: assessmentSchemaId
            },
            locale: textareaLocale,
            label: textareaLabel || (textareaLocale === 'fr' ? 'Narratif d’examen' : 'Review narrative'),
            text: textareaText
          }]
        : []
    }

    if (textareaKind === 'assessment.questionComment') {
      const sectionName = readContextText(textarea.sectionName)
      const subSectionName = readContextText(textarea.subSectionName)
      const questionName = readContextText(textarea.questionName)

      if (
        textareaText.length === 0
        || assessmentSchemaId.length === 0
        || sectionName.length === 0
        || subSectionName.length === 0
        || questionName.length === 0
      ) {
        return []
      }

      const questionKey = buildNarrativeQualityQuestionKey(sectionName, subSectionName, questionName)

      return [{
        key: `question-comment-${assessmentSchemaId}-${questionKey}`,
        configKey: {
          kind: 'assessment_question_comment',
          schemaId: assessmentSchemaId,
          questionKey
        },
        locale: textareaLocale,
        label: textareaLabel || (textareaLocale === 'fr' ? 'Commentaire' : 'Comment'),
        text: textareaText
      }]
    }
  }

  const agreement = isRecord(context.agreement) ? context.agreement : null
  if (agreement) {
    const targets: NarrativeQualityTarget[] = [
      {
        key: 'agreement-description-en',
        configKey: { kind: 'agreement_top_level' },
        locale: 'en',
        label: 'English description',
        text: readContextText(agreement.egcs_fc_description_en)
      },
      {
        key: 'agreement-description-fr',
        configKey: { kind: 'agreement_top_level' },
        locale: 'fr',
        label: 'Description française',
        text: readContextText(agreement.egcs_fc_description_fr)
      }
    ]

    return targets.filter(target => target.text.length > 0)
  }

  const assessment = isRecord(context.assessment) ? context.assessment : null
  const assessmentResponse = isRecord(context.assessmentResponse) ? context.assessmentResponse : null
  const assessmentSchemaId = readContextText(context.assessmentSchemaId) || readContextText(assessment?.egcs_cn_reviewschema)

  if (assessmentResponse && assessmentSchemaId.length > 0) {
    const text = readContextText(assessmentResponse.egcs_cn_reviewalignmentnarrative)
    return text.length > 0
      ? [{
          key: `review-alignment-narrative-${assessmentSchemaId}`,
          configKey: {
            kind: 'assessment_review_alignment_narrative',
            schemaId: assessmentSchemaId
          },
          locale,
          label: locale === 'fr' ? 'Narratif d’examen' : 'Review narrative',
          text
        }]
      : []
  }

  const comment = readContextText(context.comment)
  const question = isRecord(context.question) ? context.question : null
  const sectionName = readContextText(context.sectionName)
  const subSectionName = readContextText(context.subSectionName)
  const questionName = readContextText(question?.name)
  if (comment.length === 0 || assessmentSchemaId.length === 0 || sectionName.length === 0 || subSectionName.length === 0 || questionName.length === 0) {
    return []
  }

  const questionKey = buildNarrativeQualityQuestionKey(sectionName, subSectionName, questionName)
  const localizedQuestionLabel = getQuestionLabel(question, locale)

  return [{
    key: `question-comment-${assessmentSchemaId}-${questionKey}`,
    configKey: {
      kind: 'assessment_question_comment',
      schemaId: assessmentSchemaId,
      questionKey
    },
    locale,
    label: localizedQuestionLabel || (locale === 'fr' ? 'Commentaire' : 'Comment'),
    text: comment
  }]
}
