// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref, Suspense } from 'vue'
import type { Ref } from 'vue'
import type { JsonValue } from '@gcs-ssc/extensions'
import NarrativeQualityConfig from '../../components/NarrativeQualityConfig.vue'
import NarrativeQualityConfigRenderer from '../../components/NarrativeQualityConfigRenderer.vue'
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
  modelValue: Record<string, JsonValue> = {}
) => {
  const locale = ref('en')
  const parentModel: Ref<Record<string, JsonValue>> = ref(modelValue)
  const onUpdateModelValue = vi.fn((value: Record<string, JsonValue>) => {
    parentModel.value = value
  })
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
    parentModel
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
