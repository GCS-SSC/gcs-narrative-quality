// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref, Suspense } from 'vue'
import type { Ref } from 'vue'
import type { JsonValue } from '@gcs-ssc/extensions'
import NarrativeQualityConfig from '../../components/NarrativeQualityConfig.vue'
import NarrativeQualityConfigRenderer from '../../components/NarrativeQualityConfigRenderer.vue'
import configSchema from '../../ui/config.json'
import type { NarrativeQualityPluginUiNode } from '../../components/narrative-quality-plugin-ui'
import {
  getPluginModelValue
} from '../../components/narrative-quality-config-model'
import {
  buildNarrativeQualityQuestionKey,
  createDefaultNarrativeQualityConfig,
  toNarrativeQualityJson
} from '../../components/narrative-quality'
import type { NarrativeQualityCriterion } from '../../components/narrative-quality'

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

const mountComponent = async (
  items = assessmentCatalog,
  modelValue: Record<string, JsonValue> = {},
  options: { streamId?: Ref<string>; fetch?: typeof fetch } = {}
) => {
  const locale = ref('en')
  const streamId = options.streamId ?? ref('stream-1')
  const parentModel: Ref<Record<string, JsonValue>> = ref(modelValue)
  const onUpdateModelValue = vi.fn((value: Record<string, JsonValue>) => {
    parentModel.value = value
  })
  vi.stubGlobal('useI18n', () => ({ locale }))
  vi.stubGlobal('fetch', options.fetch ?? vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ items }), { headers: { 'content-type': 'application/json' } })
  ))

  const Host = defineComponent({
    setup: () => {
      return () => h(Suspense, null, {
        default: () => h(NarrativeQualityConfig, {
          'streamId': streamId.value,
          'modelValue': parentModel.value,
          'onUpdate:modelValue': onUpdateModelValue
        })
      })
    }
  })

  const wrapper = mount(Host, {
    global: {
      stubs: {
        UButton: {
          props: ['label', 'color', 'variant', 'icon'],
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')">{{ label || icon }}</button>'
        },
        CommonSection: {
          props: ['title', 'badge', 'gridCols'],
          template: '<section><h4>{{ title }}</h4><slot /></section>'
        },
        CommonAssessmentSchemaAccordionSection: {
          props: ['title', 'defaultOpen', 'level'],
          template: '<section><h5>{{ title }}</h5><slot /></section>'
        },
        UFormField: {
          props: ['label', 'description'],
          template: '<label><span>{{ label }}</span><span>{{ description }}</span><slot /></label>'
        },
        USelect: {
          props: ['modelValue', 'items', 'valueKey', 'labelKey'],
          emits: ['update:modelValue'],
          template: `
            <select
              :value="modelValue"
              @change="$emit('update:modelValue', $event.target.value)">
              <option v-for="item in items" :key="item[valueKey]" :value="item[valueKey]">
                {{ item[labelKey] }}
              </option>
            </select>
          `
        },
        UTextarea: {
          props: ['modelValue', 'rows'],
          emits: ['update:modelValue'],
          template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        UInput: {
          props: ['modelValue', 'type', 'min', 'max', 'step'],
          emits: ['update:modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        USwitch: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />'
        }
      }
    }
  })

  await flushPromises()

  return {
    wrapper,
    onUpdateModelValue,
    parentModel,
    locale,
    streamId
  }
}

describe('NarrativeQualityConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('computed', computed)
  })

  it('starts a catalog read when an initially empty Stream becomes available', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: assessmentCatalog })))
    const { wrapper, streamId } = await mountComponent(assessmentCatalog, {}, { streamId: ref(''), fetch: fetchMock })
    try {
      expect(fetchMock).not.toHaveBeenCalled()
      streamId.value = 'stream-enabled'
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/extensions/gcs-narrative-quality/streams/stream-enabled/assessment-targets')
      await wrapper.findAll('select')[0]?.setValue('assessment_review_alignment_narrative')
      expect(wrapper.text()).toContain('Program Fit')
    } finally {
      wrapper.unmount()
    }
  })

  it('clears accepted Stream evidence and rejects superseded responses and failures', async () => {
    const requests: Array<{
      signal: AbortSignal | null | undefined
      resolve: (value: Response) => void
      reject: (error: Error) => void
    }> = []
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((resolve, reject) => {
      requests.push({ signal: init?.signal, resolve, reject })
    }))
    const { wrapper, streamId } = await mountComponent(assessmentCatalog, {}, { fetch: fetchMock })
    try {
      requests[0]?.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
      await flushPromises()
      await wrapper.findAll('select')[0]?.setValue('assessment_review_alignment_narrative')
      expect(wrapper.text()).toContain('Program Fit')

      streamId.value = 'stream-2'
      await flushPromises()
      expect(wrapper.text()).not.toContain('Program Fit')
      expect(wrapper.text()).toContain('Loading assessment schemas...')
      streamId.value = 'stream-3'
      await flushPromises()
      expect(requests[1]?.signal?.aborted).toBe(true)
      const latestCatalog = [{ ...assessmentCatalog[0], schemaId: 'schema-3', name: { en: 'Latest Stream', fr: 'Dernier volet' } }]
      requests[2]?.resolve(new Response(JSON.stringify({ items: latestCatalog })))
      await flushPromises()
      expect(wrapper.text()).toContain('Latest Stream')
      requests[1]?.reject(new Error('Late previous Stream failure'))
      await flushPromises()
      expect(wrapper.text()).toContain('Latest Stream')
      expect(wrapper.text()).not.toContain('Assessment schemas could not be loaded right now.')

      streamId.value = 'stream-4'
      await flushPromises()
      streamId.value = 'stream-5'
      await flushPromises()
      expect(requests[3]?.signal?.aborted).toBe(true)
      requests[3]?.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
      await flushPromises()
      expect(wrapper.text()).not.toContain('Program Fit')
      expect(wrapper.text()).not.toContain('Latest Stream')
      requests[4]?.resolve(new Response(JSON.stringify({ items: latestCatalog })))
      await flushPromises()
      expect(wrapper.text()).toContain('Latest Stream')
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves a controlled replacement model when its Stream changes in the same update', async () => {
    const requests: Array<(value: Response) => void> = []
    const fetchMock = vi.fn<typeof fetch>(() => new Promise(resolve => { requests.push(resolve) }))
    const { wrapper, streamId, parentModel } = await mountComponent(assessmentCatalog, {}, { fetch: fetchMock })
    try {
      requests[0]?.(new Response(JSON.stringify({ items: assessmentCatalog })))
      await flushPromises()
      const replacement = createDefaultNarrativeQualityConfig()
      replacement.agreementTopLevel.question.en = 'Replacement Stream draft'
      streamId.value = 'stream-replacement'
      parentModel.value = toNarrativeQualityJson(replacement)
      await flushPromises()
      expect((wrapper.findAll('textarea')[0]?.element as HTMLTextAreaElement).value).toBe('Replacement Stream draft')
      requests[1]?.(new Response(JSON.stringify({ items: [] })))
      await flushPromises()
      expect((wrapper.findAll('textarea')[0]?.element as HTMLTextAreaElement).value).toBe('Replacement Stream draft')
      expect(parentModel.value.agreementTopLevel.question.en).toBe('Replacement Stream draft')
    } finally {
      wrapper.unmount()
    }
  })

  it('clears disabled catalogs, reports current failures, and aborts on disposal', async () => {
    const requests: Array<{ signal: AbortSignal | null | undefined; resolve: (value: Response) => void }> = []
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise(resolve => {
      requests.push({ signal: init?.signal, resolve })
    }))
    const { wrapper, streamId, onUpdateModelValue } = await mountComponent(assessmentCatalog, {}, { fetch: fetchMock })
    await wrapper.findAll('select')[0]?.setValue('assessment_review_alignment_narrative')
    requests[0]?.resolve(new Response('{}', { status: 503 }))
    await flushPromises()
    expect(wrapper.text()).toContain('Assessment schemas could not be loaded right now.')
    streamId.value = 'stream-2'
    await flushPromises()
    expect(wrapper.text()).not.toContain('Assessment schemas could not be loaded right now.')
    streamId.value = ''
    await flushPromises()
    expect(requests[1]?.signal?.aborted).toBe(true)
    expect(wrapper.text()).toContain('No assessment schemas are configured for this stream yet.')
    requests[1]?.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Program Fit')
    streamId.value = 'stream-3'
    await flushPromises()
    wrapper.unmount()
    expect(requests[2]?.signal?.aborted).toBe(true)
    const emissions = onUpdateModelValue.mock.calls.length
    requests[2]?.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
    await flushPromises()
    expect(onUpdateModelValue).toHaveBeenCalledTimes(emissions)
  })

  it.each(['en', 'fr'])('retries the current %s catalog without losing profile drafts or duplicating pending reads', async language => {
    const requests: Array<{ resolve: (value: Response) => void; reject: (reason: Error) => void }> = []
    const fetchMock = vi.fn<typeof fetch>(() => new Promise((resolve, reject) => { requests.push({ resolve, reject }) }))
    const config = createDefaultNarrativeQualityConfig()
    config.assessments['schema-1'] = {
      reviewAlignment: structuredClone(config.assessmentDefaults.reviewAlignment),
      questionComments: {}
    }
    config.assessments['schema-1'].reviewAlignment.question.en = 'Retained assessment prompt'
    const { wrapper, locale, parentModel } = await mountComponent(assessmentCatalog, toNarrativeQualityJson(config), { fetch: fetchMock })
    const retryLabel = language === 'fr' ? 'Réessayer le chargement des schémas d’évaluation' : 'Retry loading assessment schemas'
    const error = language === 'fr' ? 'Les schémas d’évaluation ne peuvent pas être chargés pour le moment.' : 'Assessment schemas could not be loaded right now.'
    const loading = language === 'fr' ? 'Chargement des schémas d’évaluation...' : 'Loading assessment schemas...'
    try {
      await wrapper.findAll('textarea')[0]!.setValue('Unsaved top-level prompt')
      await wrapper.findAll('input:not([type="checkbox"])')[0]!.setValue('')
      locale.value = language
      requests[0]!.reject(new Error('Initial catalog unavailable'))
      await flushPromises()
      await wrapper.findAll('select')[0]!.setValue('assessment_review_alignment_narrative')
      expect(wrapper.text()).toContain(error)

      const retry = wrapper.findAll('button').find(button => button.text() === retryLabel)!
      retry.element.click()
      retry.element.click()
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain(loading)
      expect(wrapper.text()).not.toContain(error)
      requests[1]!.reject(new Error('Retry temporarily unavailable'))
      await flushPromises()
      expect(wrapper.text()).toContain(error)

      const retryAgain = wrapper.findAll('button').find(button => button.text() === retryLabel)!
      retryAgain.element.click()
      retryAgain.element.click()
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(3)
      requests[2]!.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
      await flushPromises()
      expect(wrapper.text()).not.toContain(error)
      expect(wrapper.findAll<HTMLTextAreaElement>('textarea')[0]!.element.value).toBe('Retained assessment prompt')

      await wrapper.findAll('select')[0]!.setValue('agreement_top_level')
      expect(wrapper.findAll<HTMLTextAreaElement>('textarea')[0]!.element.value).toBe('Unsaved top-level prompt')
      expect(wrapper.findAll<HTMLInputElement>('input:not([type="checkbox"])')[0]!.element.value).toBe('')
      expect(parentModel.value.agreementTopLevel).toMatchObject({ question: { en: 'Unsaved top-level prompt' } })
    } finally {
      wrapper.unmount()
    }
  })

  it('invalidates pending retries on Stream replacement and disposal', async () => {
    const requests: Array<{
      signal: AbortSignal | null | undefined
      resolve: (value: Response) => void
      reject: (reason: Error) => void
    }> = []
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((resolve, reject) => {
      requests.push({ signal: init?.signal, resolve, reject })
    }))
    const { wrapper, streamId, onUpdateModelValue } = await mountComponent(assessmentCatalog, {}, { fetch: fetchMock })
    await wrapper.findAll('select')[0]!.setValue('assessment_review_alignment_narrative')
    requests[0]!.reject(new Error('Initial failure'))
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Retry loading assessment schemas')!.trigger('click')
    streamId.value = 'replacement-stream'
    await flushPromises()
    expect(requests[1]!.signal?.aborted).toBe(true)
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/extensions/gcs-narrative-quality/streams/replacement-stream/assessment-targets')
    requests[1]!.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Program Fit')
    requests[2]!.reject(new Error('Current failure'))
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Retry loading assessment schemas')!.trigger('click')
    wrapper.unmount()
    expect(requests[3]!.signal?.aborted).toBe(true)
    const emissions = onUpdateModelValue.mock.calls.length
    requests[3]!.resolve(new Response(JSON.stringify({ items: assessmentCatalog })))
    await flushPromises()
    expect(onUpdateModelValue).toHaveBeenCalledTimes(emissions)
  })

  it('renders every developer-defined config field using its stable schema path', async () => {
    const expected = new Set<string>()
    type SchemaNode = { type: string; key?: string; children?: SchemaNode[]; item_schema?: SchemaNode }
    const visit = (node: SchemaNode, prefix = '') => {
      const path = [prefix, node.key].filter(Boolean).join('.')
      if (['input', 'textarea', 'number', 'select', 'switch'].includes(node.type)) {
        expected.add(`extension.gcs-narrative-quality.config.${path}`)
      }
      for (const child of node.children ?? []) visit(child, prefix)
      if (node.item_schema) visit(node.item_schema, path)
    }
    visit(configSchema)
    const { wrapper } = await mountComponent()
    try {
      const actual = new Set(wrapper.findAll('[data-ui-target]').map(field => field.attributes('data-ui-target')).filter(key => key.startsWith('extension.gcs-narrative-quality.config.')))
      expect(actual).toEqual(expected)
      for (const field of wrapper.findAll('[data-ui-target^="extension.gcs-narrative-quality.config."]')) {
        expect(field.attributes('data-help-target')).toBe(field.attributes('data-ui-target'))
      }
      expect(expected.size).toBe(24)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps known prompt and criterion content languages when UI locale changes', async () => {
    const { wrapper, locale } = await mountComponent()
    const check = () => {
      expect(wrapper.findAll('textarea').map(input => input.attributes('lang'))).toEqual(['en', 'fr'])
      const labels = wrapper.findAll('input').filter(input => /Clearly|Uses specific|coherent|Répond|Utilise|Est cohérent/.test((input.element as HTMLInputElement).value))
      expect(labels.map(input => input.attributes('lang'))).toEqual(['en', 'en', 'en', 'fr', 'fr', 'fr'])
    }
    check()
    locale.value = 'fr'
    await flushPromises()
    check()
  })

  it('names criterion removal in the current locale and keeps the remove action', async () => {
    const { wrapper, locale, onUpdateModelValue } = await mountComponent()
    const firstLabel = createDefaultNarrativeQualityConfig().agreementTopLevel.criteria.en[0]!.label
    const remove = wrapper.findAll('button').find(button => button.text() === 'i-lucide-trash')!
    expect(remove.attributes('aria-label')).toBe(`Remove 1 - ${firstLabel}`)

    locale.value = 'fr'
    await flushPromises()
    expect(remove.attributes('aria-label')).toBe(`Supprimer 1 - ${firstLabel}`)
    await remove.trigger('click')
    await flushPromises()
    const updated = onUpdateModelValue.mock.calls.at(-1)![0]
    expect(updated.agreementTopLevel.criteria.en).toHaveLength(2)
    expect(updated.agreementTopLevel.criteria.en.some((item: NarrativeQualityCriterion) => item.label === firstLabel)).toBe(false)
  })

  it('renders assessment and question selectors for assessment-scoped configuration', async () => {
    const { wrapper } = await mountComponent()

    expect(wrapper.text()).toContain('Narrative scoring setup')
    expect(wrapper.text()).toContain('Scored Narrative Field')

    const selects = wrapper.findAll('select')
    await selects[0]?.setValue('assessment_review_alignment_narrative')
    await flushPromises()
    expect(wrapper.text()).toContain('Select which assessment schema this narrative prompt applies to.')
    expect(wrapper.text()).toContain('Program Fit')

    await selects[0]?.setValue('assessment_question_comment')
    await flushPromises()
    expect(wrapper.text()).toContain('Select the exact assessment question comment that should be scored.')
    expect(wrapper.text()).toContain('Describe the evidence')
  })

  it('keeps the selected question valid when changing assessments without losing profile drafts', async () => {
    const first = assessmentCatalog[0]!
    const second = {
      ...first,
      schemaId: 'schema-2',
      questions: [{ ...first.questions[0]!, key: 'second-question', label: { en: 'Second question', fr: 'Deuxième question' } }]
    }
    const { wrapper } = await mountComponent([first, second, { ...first, schemaId: 'empty-schema', questions: [] }])
    try {
      await wrapper.findAll('select')[0]!.setValue('assessment_question_comment')
      await wrapper.findAll('textarea')[0]!.setValue('First question draft')
      await wrapper.findAll('select')[1]!.setValue('schema-2')
      expect(wrapper.findAll<HTMLSelectElement>('select')[2]!.element.value).toBe('second-question')
      expect(wrapper.findAll('textarea').length).toBeGreaterThan(0)
      await wrapper.findAll('textarea')[0]!.setValue('Second question draft')

      await wrapper.findAll('select')[1]!.setValue('schema-1')
      expect(wrapper.findAll<HTMLSelectElement>('select')[2]!.element.value).toBe(first.questions[0]!.key)
      expect(wrapper.findAll<HTMLTextAreaElement>('textarea')[0]!.element.value).toBe('First question draft')
      await wrapper.findAll('select')[1]!.setValue('schema-2')
      expect(wrapper.findAll<HTMLTextAreaElement>('textarea')[0]!.element.value).toBe('Second question draft')

      await wrapper.findAll('select')[1]!.setValue('empty-schema')
      expect(wrapper.findAll('select')).toHaveLength(2)
      expect(wrapper.findAll('textarea')).toHaveLength(0)
      expect(wrapper.text()).toContain('This assessment schema has no scoreable questions.')
    } finally {
      wrapper.unmount()
    }
  })

  it('updates the model when prompt text and criteria change', async () => {
    const { wrapper, onUpdateModelValue } = await mountComponent()

    const selects = wrapper.findAll('select')
    await selects[0]?.setValue('assessment_question_comment')
    await flushPromises()

    const toggle = wrapper.find('input[type="checkbox"]')
    await toggle.setValue(true)
    await flushPromises()

    const textareas = wrapper.findAll('textarea')
    await textareas[0]?.setValue('Updated assessment prompt')
    await flushPromises()

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text().includes('Add Criterion'))?.trigger('click')
    await flushPromises()

    const textInputs = wrapper.findAll('input:not([type="checkbox"])')
    await textInputs[0]?.setValue('Specific evidence')
    await textInputs[1]?.setValue('5')
    await flushPromises()

    const updatedModel = onUpdateModelValue.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
    expect(JSON.stringify(updatedModel)).toContain('"enabled":true')
    expect(JSON.stringify(updatedModel)).toContain('Updated assessment prompt')
    expect(JSON.stringify(updatedModel)).toContain('Specific evidence')
  })

  it('preserves criterion identity across controlled profile updates', async () => {
    const config = createDefaultNarrativeQualityConfig()
    config.agreementTopLevel.question.en = 'Configured agreement prompt'

    const { wrapper, onUpdateModelValue } = await mountComponent(
      assessmentCatalog,
      toNarrativeQualityJson(config)
    )

    const englishPrompt = wrapper.findAll('textarea')[0]
    expect((englishPrompt?.element as HTMLTextAreaElement).value).toBe('Configured agreement prompt')

    const secondCriterionLabel = config.agreementTopLevel.criteria.en[1]?.label
    const criterionInput = wrapper.findAll('input')
      .find(input => (input.element as HTMLInputElement).value === secondCriterionLabel)
    const criterionInputElement = criterionInput?.element
    await criterionInput?.setValue('Updated criterion without remounting')
    await flushPromises()

    const updatedModel = onUpdateModelValue.mock.calls.at(-1)?.[0]
    expect(updatedModel.agreementTopLevel.criteria.en[1]).toEqual({
      label: 'Updated criterion without remounting',
      weight: 2
    })
    const updatedCriterionInput = wrapper.findAll('input')
      .find(input => (input.element as HTMLInputElement).value === 'Updated criterion without remounting')
    expect(updatedCriterionInput?.element).toBe(criterionInputElement)

    const addCriterionButton = wrapper.findAll('button')
      .find(button => button.text() === 'Add Criterion')
    await addCriterionButton?.trigger('click')
    await flushPromises()
    const criterionInputAfterAdd = wrapper.findAll('input')
      .find(input => (input.element as HTMLInputElement).value === 'Updated criterion without remounting')
    expect(criterionInputAfterAdd?.element).toBe(criterionInputElement)

    const removeCriterionButtons = wrapper.findAll('button')
      .filter(button => button.text() === 'i-lucide-trash')
    await removeCriterionButtons[0]?.trigger('click')
    await flushPromises()
    const criterionInputAfterRemove = wrapper.findAll('input')
      .find(input => (input.element as HTMLInputElement).value === 'Updated criterion without remounting')
    expect(criterionInputAfterRemove?.element).toBe(criterionInputElement)
    expect(wrapper.text()).toContain('1 - Updated criterion without remounting')
    expect(JSON.stringify(onUpdateModelValue.mock.calls.at(-1)?.[0])).not.toContain('__renderKey')
  })

  it('synchronizes a controlled model replacement after mount', async () => {
    const { wrapper, parentModel } = await mountComponent()
    const replacement = createDefaultNarrativeQualityConfig()
    replacement.agreementTopLevel.question.en = 'Externally replaced prompt'

    parentModel.value = toNarrativeQualityJson(replacement)
    await flushPromises()

    expect((wrapper.findAll('textarea')[0]?.element as HTMLTextAreaElement).value)
      .toBe('Externally replaced prompt')
  })

  it('emits a criterion model from a recursive row renderer', async () => {
    const locale = ref('en')
    vi.stubGlobal('useI18n', () => ({ locale }))

    const criterion: NarrativeQualityCriterion = {
      label: 'Original criterion',
      weight: 2
    }
    const schema: NarrativeQualityPluginUiNode = {
      type: 'input',
      key: 'label',
      label: {
        en: 'Criterion',
        fr: 'Critère'
      }
    }
    const wrapper = mount(NarrativeQualityConfigRenderer, {
      props: {
        model: criterion,
        schema
      },
      global: {
        stubs: {
          UFormField: {
            props: ['label'],
            template: '<label><span>{{ label }}</span><slot /></label>'
          },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
          }
        }
      }
    })

    await wrapper.find('input').setValue('Updated criterion')

    expect(wrapper.emitted('update:model')?.at(-1)?.[0]).toEqual({
      label: 'Updated criterion',
      weight: 2
    })
  })

  it.each([
    ['numeric input', 7.25, 7.25],
    ['numeric string', '4.5', 4.5],
    ['invalid string', 'not-a-number', 0]
  ] as const)('normalizes %s through the actual number control', async (_label, input, expected) => {
    const locale = ref('en')
    vi.stubGlobal('useI18n', () => ({ locale }))
    const original: NarrativeQualityCriterion = {
      label: 'Preserved criterion',
      weight: 2
    }
    const schema: NarrativeQualityPluginUiNode = {
      type: 'number',
      key: 'weight',
      min: 0.1,
      max: 10,
      step: 0.1
    }
    const InputStub = defineComponent({
      name: 'UInput',
      props: ['modelValue', 'type', 'min', 'max', 'step'],
      emits: ['update:modelValue'],
      template: '<input :value="modelValue" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    })
    const wrapper = mount(NarrativeQualityConfigRenderer, {
      props: { model: original, schema },
      global: {
        stubs: {
          UFormField: { template: '<label><slot /></label>' },
          UInput: InputStub
        }
      }
    })

    if (typeof input === 'number') {
      wrapper.getComponent(InputStub).vm.$emit('update:modelValue', input)
      await wrapper.vm.$nextTick()
    } else {
      await wrapper.find('input').setValue(input)
    }

    const emitted = wrapper.emitted('update:model')?.at(-1)?.[0] as NarrativeQualityCriterion
    expect(emitted).toEqual({ label: 'Preserved criterion', weight: expected })
    expect(emitted).not.toBe(original)
    expect(original).toEqual({ label: 'Preserved criterion', weight: 2 })
  })

  it('keeps non-number field controls on their existing update path', async () => {
    const locale = ref('en')
    vi.stubGlobal('useI18n', () => ({ locale }))
    const original: NarrativeQualityCriterion = { label: 'Original criterion', weight: 2 }
    const schema: NarrativeQualityPluginUiNode = { type: 'input', key: 'label' }
    const wrapper = mount(NarrativeQualityConfigRenderer, {
      props: { model: original, schema },
      global: {
        stubs: {
          UFormField: { template: '<label><slot /></label>' },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
          }
        }
      }
    })

    await wrapper.find('input').setValue('Updated criterion')

    expect(wrapper.emitted('update:model')?.at(-1)?.[0]).toEqual({
      label: 'Updated criterion',
      weight: 2
    })
    expect(original).toEqual({ label: 'Original criterion', weight: 2 })
  })

  it('renders frozen criterion rows without mutating them for keys', () => {
    const locale = ref('en')
    vi.stubGlobal('useI18n', () => ({
      locale,
      t: (key: string) => key
    }))

    const frozenCriterion: NarrativeQualityCriterion = Object.freeze({
      label: 'Frozen criterion',
      weight: 2
    })
    const profile = createDefaultNarrativeQualityConfig().agreementTopLevel
    profile.criteria.en = [frozenCriterion]
    const schema: NarrativeQualityPluginUiNode = {
      type: 'collection',
      key: 'criteria.en',
      label: {
        en: 'Criteria',
        fr: 'Critères'
      },
      item_title_key: 'label'
    }
    const wrapper = mount(NarrativeQualityConfigRenderer, {
      props: {
        model: profile,
        schema
      },
      global: {
        stubs: {
          UButton: {
            props: ['label', 'icon'],
            template: '<button type="button">{{ label || icon }}</button>'
          },
          CommonAssessmentSchemaAccordionSection: {
            props: ['title'],
            template: '<section><h5>{{ title }}</h5><slot /></section>'
          }
        }
      }
    })

    expect(wrapper.text()).toContain('1 - Frozen criterion')
    expect(Object.keys(frozenCriterion)).toEqual(['label', 'weight'])
  })

  it('emits a detached profile without mutating a controlled nested model', async () => {
    const locale = ref('en')
    vi.stubGlobal('useI18n', () => ({ locale }))

    const profile = createDefaultNarrativeQualityConfig().agreementTopLevel
    const originalQuestion = profile.question
    Object.freeze(originalQuestion)
    const schema: NarrativeQualityPluginUiNode = {
      type: 'textarea',
      key: 'question.en'
    }
    const wrapper = mount(NarrativeQualityConfigRenderer, {
      props: {
        model: profile,
        schema
      },
      global: {
        stubs: {
          UFormField: {
            template: '<label><slot /></label>'
          },
          UTextarea: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
          }
        }
      }
    })

    await wrapper.find('textarea').setValue('Detached prompt')

    const emittedModel = wrapper.emitted('update:model')?.at(-1)?.[0]
    expect(profile.question.en).not.toBe('Detached prompt')
    expect(getPluginModelValue(emittedModel!, 'question.en')).toBe('Detached prompt')
    expect(Reflect.get(emittedModel!, 'question')).not.toBe(originalQuestion)
  })

  it('keeps assessment question scoring disabled until explicitly enabled', async () => {
    const { wrapper } = await mountComponent()

    const selects = wrapper.findAll('select')
    await selects[0]?.setValue('assessment_question_comment')
    await flushPromises()

    const toggle = wrapper.find('input[type="checkbox"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
  })

  it('shows the empty assessment state when the stream has no assessment schemas', async () => {
    const { wrapper } = await mountComponent([])

    const selects = wrapper.findAll('select')
    await selects[0]?.setValue('assessment_review_alignment_narrative')
    await flushPromises()

    expect(wrapper.text()).toContain('No assessment schemas are configured for this stream yet.')
  })
})
