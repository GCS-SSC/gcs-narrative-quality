import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import extensionDefinition from '../../extension.config'
import {
  buildNarrativeQualityQuestionKey,
  createDefaultNarrativeQualityConfig,
  normalizeNarrativeQualityConfig,
  resolveNarrativeQualityTargetConfig,
  resolveNarrativeQualityTargets,
  toNarrativeQualityJson
} from '../../components/narrative-quality'

const assessmentCatalog = [{
  schemaId: 'schema-1',
  version: 2,
  name: {
    en: 'Program Fit',
    fr: 'Concordance au programme'
  },
  questions: [{
    key: buildNarrativeQualityQuestionKey('section-a', 'sub-a', 'question-a'),
    sectionName: 'section-a',
    subSectionName: 'sub-a',
    questionName: 'question-a',
    label: {
      en: 'Describe the evidence',
      fr: 'Decrivez la preuve'
    }
  }]
}]

describe('gcs narrative quality extension', () => {
  it('declares stream configuration, runtime slots, static assets, and extension-owned server handlers', () => {
    expect(extensionDefinition.key).toBe('gcs-narrative-quality')
    expect(extensionDefinition.admin?.streamConfig?.path).toBe('./components/NarrativeQualityConfig.vue')
    expect(extensionDefinition.client?.slots?.map(slot => slot.slot)).toEqual([
      'textarea.after'
    ])
    expect(extensionDefinition.assets).toEqual([
      {
        path: './client',
        baseURL: '/extensions/gcs-narrative-quality/client'
      },
      {
        package: '@browser-quality-scorer/core',
        packagePath: 'models',
        baseURL: '/extensions/gcs-narrative-quality/models'
      }
    ])
    expect(extensionDefinition.serverHandlers).toEqual([{
      route: '/streams/[streamId]/assessment-targets',
      method: 'get',
      path: './server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get.ts'
    }])
  })

  it('normalizes persisted JSON config for assessment-specific and question-specific profiles', () => {
    const config = normalizeNarrativeQualityConfig({
      assessments: {
        'schema-1': {
          reviewAlignment: {
            question: {
              en: 'Is the review alignment persuasive?',
              fr: 12
            }
          },
          questionComments: {
            [assessmentCatalog[0].questions[0].key]: {
              question: {
                en: 'Is this answer comment specific?',
                fr: 'Ce commentaire est-il precis?'
              },
              criteria: {
                en: [
                  { label: ' Specific enough ', weight: '4' },
                  { label: '', weight: 9 }
                ],
                fr: []
              },
              request_config: {
                adaptiveRefinementPolicy: 'sometimes',
                adaptiveRefinement: {
                  lowStopOverallPercent: -1,
                  highStopWeakAnswerGate: 4,
                  disableHighStopForComparison: false
                },
                presentation: {
                  mixedFitMinPercent: -10,
                  strongFitMinPercent: 140,
                  toneByBand: {
                    off_track: 'warning',
                    mixed_fit: 'invalid'
                  }
                }
              }
            }
          }
        }
      }
    }, assessmentCatalog)

    const defaults = createDefaultNarrativeQualityConfig()
    const reviewAlignmentConfig = resolveNarrativeQualityTargetConfig(config, {
      kind: 'assessment_review_alignment_narrative',
      schemaId: 'schema-1'
    })
    const questionCommentConfig = resolveNarrativeQualityTargetConfig(config, {
      kind: 'assessment_question_comment',
      schemaId: 'schema-1',
      questionKey: assessmentCatalog[0].questions[0].key
    })

    expect(reviewAlignmentConfig.question.en).toBe('Is the review alignment persuasive?')
    expect(reviewAlignmentConfig.question.fr).toBe(defaults.assessmentDefaults.reviewAlignment.question.fr)
    expect(reviewAlignmentConfig.enabled).toBe(true)
    expect(questionCommentConfig.question.en).toBe('Is this answer comment specific?')
    expect(questionCommentConfig.enabled).toBe(true)
    expect(questionCommentConfig.criteria.en).toEqual([{ label: 'Specific enough', weight: 4 }])
    expect(questionCommentConfig.criteria.fr).toEqual(defaults.assessmentDefaults.questionComment.criteria.fr)
    expect(questionCommentConfig.request_config.adaptiveRefinementPolicy).toBe('adaptive')
    expect(questionCommentConfig.request_config.adaptiveRefinement.lowStopOverallPercent).toBe(0)
    expect(questionCommentConfig.request_config.adaptiveRefinement.highStopWeakAnswerGate).toBe(1)
    expect(questionCommentConfig.request_config.adaptiveRefinement.disableHighStopForComparison).toBe(false)
    expect(questionCommentConfig.request_config.presentation.mixedFitMinPercent).toBe(0)
    expect(questionCommentConfig.request_config.presentation.strongFitMinPercent).toBe(100)
    expect(questionCommentConfig.request_config.presentation.toneByBand).toEqual({
      off_track: 'warning',
      mixed_fit: 'warning',
      strong_fit: 'success'
    })
    expect(toNarrativeQualityJson(config)).toEqual(config)
  })

  it('keeps legacy config compatible by seeding discovered assessments and questions from the old target buckets', () => {
    const config = normalizeNarrativeQualityConfig({
      targets: {
        assessment_review_alignment_narrative: {
          question: {
            en: 'Legacy review prompt',
            fr: 'Question historique'
          }
        },
        assessment_question_comment: {
          criteria: {
            en: [{ label: 'Legacy criterion', weight: 2 }],
            fr: [{ label: 'Critere historique', weight: 3 }]
          }
        }
      }
    }, assessmentCatalog)

    expect(config.assessments['schema-1']?.reviewAlignment.question.en).toBe('Legacy review prompt')
    expect(config.assessments['schema-1']?.reviewAlignment.enabled).toBe(true)
    expect(config.assessments['schema-1']?.questionComments[assessmentCatalog[0].questions[0].key]?.criteria.en).toEqual([
      { label: 'Legacy criterion', weight: 2 }
    ])
    expect(config.assessments['schema-1']?.questionComments[assessmentCatalog[0].questions[0].key]?.enabled).toBe(true)
  })

  it('maps host slot contexts into schema-specific and question-specific narrative scoring targets', () => {
    expect(resolveNarrativeQualityTargets({
      textarea: {
        kind: 'agreement.description',
        locale: 'en',
        label: 'English description',
        text: ' English agreement narrative '
      }
    }, 'en')).toEqual([
      {
        key: 'agreement-description-en',
        configKey: { kind: 'agreement_top_level' },
        locale: 'en',
        label: 'English description',
        text: 'English agreement narrative'
      }
    ])

    expect(resolveNarrativeQualityTargets({
      textarea: {
        kind: 'assessment.reviewAlignment',
        locale: 'fr',
        label: 'Narratif d’examen',
        text: 'Aligned with program outcomes.',
        assessmentSchemaId: 'schema-1'
      }
    }, 'fr')).toEqual([
      {
        key: 'review-alignment-narrative-schema-1',
        configKey: {
          kind: 'assessment_review_alignment_narrative',
          schemaId: 'schema-1'
        },
        locale: 'fr',
        label: 'Narratif d’examen',
        text: 'Aligned with program outcomes.'
      }
    ])

    expect(resolveNarrativeQualityTargets({
      textarea: {
        kind: 'assessment.questionComment',
        locale: 'en',
        label: 'Describe the evidence',
        text: 'Needs more evidence.',
        assessmentSchemaId: 'schema-1',
        sectionName: 'section-a',
        subSectionName: 'sub-a',
        questionName: 'question-a'
      }
    }, 'en')).toEqual([
      {
        key: `question-comment-schema-1-${assessmentCatalog[0].questions[0].key}`,
        configKey: {
          kind: 'assessment_question_comment',
          schemaId: 'schema-1',
          questionKey: assessmentCatalog[0].questions[0].key
        },
        locale: 'en',
        label: 'Describe the evidence',
        text: 'Needs more evidence.'
      }
    ])
  })

  it('defaults discovered targets to disabled until explicitly enabled', () => {
    const config = normalizeNarrativeQualityConfig({}, assessmentCatalog)

    expect(config.agreementTopLevel.enabled).toBe(false)
    expect(config.assessments['schema-1']?.reviewAlignment.enabled).toBe(false)
    expect(config.assessments['schema-1']?.questionComments[assessmentCatalog[0].questions[0].key]?.enabled).toBe(false)
    expect(resolveNarrativeQualityTargetConfig(config, {
      kind: 'assessment_question_comment',
      schemaId: 'schema-1',
      questionKey: assessmentCatalog[0].questions[0].key
    })).toBeNull()
  })

  it('rewrites old plugin asset URLs to extension public asset URLs', async () => {
    const workerSource = await readFile(join(process.cwd(), 'extensions/gcs-narrative-quality/client/worker-source.js'), 'utf8')
    const bundledWorker = await readFile(join(process.cwd(), 'extensions/gcs-narrative-quality/client/worker.js'), 'utf8')

    expect(workerSource).not.toContain('/api/plugn/assets/quality-meter')
    expect(bundledWorker).not.toContain('/api/plugn/assets/quality-meter')
    expect(workerSource).toContain('/extensions/gcs-narrative-quality/models/')
    expect(workerSource).toContain('/extensions/gcs-narrative-quality/client/')
  })

  it('renders assessment and question selections alongside the original accordion controls', async () => {
    const componentSource = await readFile(join(process.cwd(), 'extensions/gcs-narrative-quality/components/NarrativeQualityConfig.vue'), 'utf8')
    const rendererSource = await readFile(join(process.cwd(), 'extensions/gcs-narrative-quality/components/NarrativeQualityConfigRenderer.vue'), 'utf8')
    const helperSource = await readFile(join(process.cwd(), 'extensions/gcs-narrative-quality/components/narrative-quality.ts'), 'utf8')

    expect(componentSource).toContain('/api/extensions/gcs-narrative-quality/streams/${streamId}/assessment-targets')
    expect(componentSource).toContain('assessment: { en: \'Assessment\'')
    expect(componentSource).toContain('questionSelection: { en: \'Question\'')
    expect(helperSource).toContain('questionComments')
    expect(componentSource).toContain('<CommonSection :title="text(\'targetSection\')" badge="01" :grid-cols="2">')
    expect(componentSource).toContain('<NarrativeQualityConfigRenderer')
    expect(rendererSource).toContain('<AssessmentSchemaAccordionSection')
    expect(rendererSource).toContain('<CommonSection')
  })
})
