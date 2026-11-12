import { createApp, eventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { AssessmentDefinitionSchema } from '@gcs-ssc/extensions/server'
import { createQueryChain } from './helpers/mock-db'
import catalogHandler from '../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get'
import {
  buildNarrativeQualityQuestionKey,
  normalizeNarrativeQualityConfig,
  resolveNarrativeQualityTargetConfig,
  resolveNarrativeQualityTargets,
  toNarrativeQualityJson
} from '../../components/narrative-quality'

const profile = (prompt: string) => ({ enabled: true, question: { en: prompt, fr: prompt } })

const definition = {
  sections: [{
    name: 'S', number: '1', label: { en: 'S', fr: 'S' }, icon: 'i-lucide-circle', weight: 1,
    subSections: [
      { name: 'B::C', questionName: 'D' },
      { name: 'B', questionName: 'C::D' },
      { name: 'ordinary', questionName: 'question' }
    ].map(({ name, questionName }) => ({
      name, label: { en: name, fr: name }, weight: { adjustable: false, weight: 1 },
      questions: [{
        type: 'question', name: questionName, question: { en: questionName, fr: questionName },
        weight: { adjustable: false, weight: 1 }, commentThreshold: { min: 0, max: 5 }, options: [], help: []
      }]
    }))
  }],
  sectionMatrix: [], outcomes: []
}

describe('exact narrative quality question identity', () => {
  it('keeps reserved characters, Unicode and exact authored names independent in both context callers', () => {
    const names = ['ordinary', 'with::delimiter', ':', '%3A', '%', 'é', ' section ', '', '\ud800']
    const keys = names.flatMap(section => names.flatMap(subSection => names.map(question =>
      buildNarrativeQualityQuestionKey(section, subSection, question))))
    expect(new Set(keys).size).toBe(names.length ** 3)
    expect(buildNarrativeQualityQuestionKey('S', 'ordinary', 'question')).toBe('S::ordinary::question')
    for (const [sectionName, subSectionName, questionName] of [
      ['S', 'B::C', 'D'], ['S', 'B', 'C::D'], [' S ', ' B ', 'D']
    ]) {
      const expected = buildNarrativeQualityQuestionKey(sectionName, subSectionName, questionName)
      expect(resolveNarrativeQualityTargets({ textarea: {
        kind: 'assessment.questionComment', assessmentSchemaId: '3', sectionName, subSectionName,
        questionName, text: 'Comment'
      } }, 'en')[0]?.configKey).toEqual({ kind: 'assessment_question_comment', schemaId: '3', questionKey: expected })
      expect(resolveNarrativeQualityTargets({ assessmentSchemaId: '3', sectionName, subSectionName,
        question: { name: questionName }, comment: 'Comment'
      }, 'en')[0]?.configKey).toEqual({ kind: 'assessment_question_comment', schemaId: '3', questionKey: expected })
    }
  })

  it('migrates representable legacy profiles once and retains ambiguous content without assigning it to a target', () => {
    const first = buildNarrativeQualityQuestionKey('S', 'B::C', 'D')
    const second = buildNarrativeQualityQuestionKey('S', 'B', 'C::D')
    const escaped = buildNarrativeQualityQuestionKey('S', '%3A', 'D')
    const catalog = [{
      schemaId: '3', version: 1, name: { en: 'Schema', fr: 'Schéma' },
      questions: [
        { key: first, sectionName: 'S', subSectionName: 'B::C', questionName: 'D', label: { en: 'First', fr: 'Premier' } },
        { key: second, sectionName: 'S', subSectionName: 'B', questionName: 'C::D', label: { en: 'Second', fr: 'Deuxième' } }
      ]
    }]
    const config = normalizeNarrativeQualityConfig({ assessments: { 3: { questionComments: {
      'S::ordinary::question': profile('ordinary retained'),
      'S::%3A::D': profile('literal percent retained'),
      'S::B::C::D': profile('ambiguous retained'),
      'S:::B::D': profile('overlapping separators retained'),
      ['__proto__']: profile('opaque retained profile')
    } } } }, catalog)
    expect(config.assessments['3']?.questionComments[escaped]?.question.en).toBe('literal percent retained')
    expect(Object.hasOwn(config.assessments['3']?.questionComments ?? {}, '__proto__')).toBe(true)
    expect(config.assessments['3']?.questionComments['S::ordinary::question']?.question.en).toBe('ordinary retained')
    expect(config.assessments['3']?.questionComments['S::B::C::D']?.question.en).toBe('ambiguous retained')
    expect(config.assessments['3']?.questionComments['S:::B::D']?.question.en).toBe('overlapping separators retained')
    expect(config.assessments['3']?.questionComments[buildNarrativeQualityQuestionKey('S:', 'B', 'D')]).toBeUndefined()
    expect(config.assessments['3']?.questionComments[buildNarrativeQualityQuestionKey('S', ':B', 'D')]).toBeUndefined()
    for (const questionKey of [first, second]) {
      expect(resolveNarrativeQualityTargetConfig(config, { kind: 'assessment_question_comment', schemaId: '3', questionKey })).toBeNull()
    }
    expect(normalizeNarrativeQualityConfig(toNarrativeQualityJson(config), catalog)).toEqual(config)
    const updated = config.assessments['3']?.questionComments[first]
    if (!updated) throw new Error('Expected hydrated first question')
    updated.enabled = true
    updated.question.en = 'First independently edited'
    expect(config.assessments['3']?.questionComments[second]?.question.en).not.toBe(updated.question.en)
    expect(normalizeNarrativeQualityConfig(toNarrativeQualityJson(config), catalog)).toEqual(config)
    expect(normalizeNarrativeQualityConfig({ targets: { assessment_question_comment: profile('legacy bucket') } }, catalog)
      .assessments['3']?.questionComments[first]?.question.en).toBe('legacy bucket')
    expect(normalizeNarrativeQualityConfig(profile('legacy root'), catalog)
      .assessments['3']?.questionComments[second]?.question.en).toBe('legacy root')
  })

  it('recovers a delimiter-bearing legacy profile only from a unique authoritative catalog tuple', () => {
    const question = { key: buildNarrativeQualityQuestionKey('S', 'B::C', 'D'),
      sectionName: 'S', subSectionName: 'B::C', questionName: 'D', label: { en: 'First', fr: 'Premier' } }
    const catalog = [{ schemaId: '3', version: 1, name: { en: 'Schema', fr: 'Schéma' }, questions: [question] }]
    const legacy = normalizeNarrativeQualityConfig({ assessments: { 3: { questionComments: {
      'S::B::C::D': profile('uniquely recoverable authored prompt')
    } } } })
    const recovered = normalizeNarrativeQualityConfig(toNarrativeQualityJson(legacy), catalog)
    expect(recovered.assessments['3']?.questionComments[question.key]?.question.en).toBe('uniquely recoverable authored prompt')
    for (const entries of [
      [['S::B::C::D', profile('retained legacy')], [question.key, profile('new exact prompt')]],
      [[question.key, profile('new exact prompt')], ['S::B::C::D', profile('retained legacy')]]
    ]) {
      const normalized = normalizeNarrativeQualityConfig({ questionKeyEncoding: 'percent-v1', assessments: { 3: {
        questionComments: Object.fromEntries(entries)
      } } }, catalog)
      expect(normalized.assessments['3']?.questionComments[question.key]?.question.en).toBe('new exact prompt')
    }
    expect(normalizeNarrativeQualityConfig(toNarrativeQualityJson(recovered), catalog)).toEqual(recovered)
  })

  it('returns distinct valid published targets through the actual H3 route and public SDK schema', async () => {
    expect(AssessmentDefinitionSchema.safeParse(definition).success).toBe(true)
    const db = {
      /**
       * Supplies published-row fixtures to the real route.
       * @param table - Requested public contract table.
       * @returns Fluent query fixture.
       */
      selectFrom: (table: string) => createQueryChain({
        executeTakeFirstResult: { profile_id: '1', agency_id: '1' },
        executeResult: table === 'Transfer_Payment_Stream_Review_Set as Link'
          ? [{ id: '2' }]
          : [{ id: '3', egcs_cn_name_en: 'Schema', egcs_cn_name_fr: 'Schéma', publicationVersion: 1,
              definition: { assessmentSchema: definition, scoringMatrix: null } }]
      }) }
    const app = createApp()
    app.use('/assessment-targets', eventHandler(async event => {
      event.context.$db = db
      event.context.params = { streamId: '31' }
      event.context.$authContext = { userAbilities: { authorize: () => true } }
      return catalogHandler(event)
    }))
    const response = await toWebHandler(app)(new Request('http://localhost/assessment-targets'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items[0].questions.map((question: { key: string }) => question.key)).toEqual([
      buildNarrativeQualityQuestionKey('S', 'B::C', 'D'),
      buildNarrativeQualityQuestionKey('S', 'B', 'C::D'),
      'S::ordinary::question'
    ])
    expect(new Set(body.items[0].questions.map((question: { key: string }) => question.key)).size).toBe(3)
  })
})
