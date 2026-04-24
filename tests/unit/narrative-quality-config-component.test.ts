// @vitest-environment jsdom
/* eslint-disable jsdoc/require-jsdoc */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref, Suspense } from 'vue'
import NarrativeQualityConfig from '../../components/NarrativeQualityConfig.vue'
import { buildNarrativeQualityQuestionKey } from '../../components/narrative-quality'

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

const mountComponent = async (items = assessmentCatalog) => {
  const locale = ref('en')
  const onUpdateModelValue = vi.fn()
  vi.stubGlobal('useI18n', () => ({ locale }))
  vi.stubGlobal('useFetch', () => ({
    data: ref({ items }),
    status: ref('success'),
    error: ref(null)
  }))

  const Host = defineComponent({
    setup: () => {
      return () => h(Suspense, null, {
        default: () => h(NarrativeQualityConfig, {
          'streamId': 'stream-1',
          'modelValue': {},
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
        AssessmentSchemaAccordionSection: {
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
    onUpdateModelValue
  }
}

describe('NarrativeQualityConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('computed', computed)
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
