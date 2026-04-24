// @vitest-environment jsdom
/* eslint-disable jsdoc/require-jsdoc */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, ref } from 'vue'
import NarrativeQualitySlot from '../../components/NarrativeQualitySlot.vue'
import { buildNarrativeQualityQuestionKey } from '../../components/narrative-quality'

interface WorkerMessageEvent {
  data: unknown
}

const sharedWorkerStateKey = '__gcsNarrativeQualityWorkerState'

const progressStub = {
  props: ['modelValue'],
  setup: (props: { modelValue: number }) => () => h('div', { 'data-progress': props.modelValue })
}

const badgeStub = {
  setup: (_: unknown, { slots }: { slots: { default?: () => unknown[] } }) => () => h('div', slots.default ? slots.default() : [])
}

describe('NarrativeQualitySlot', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    Reflect.deleteProperty(globalThis, sharedWorkerStateKey)
    vi.stubGlobal('useI18n', () => ({
      locale: ref('en')
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(globalThis, sharedWorkerStateKey)
  })

  it('scores question-comment content with question-specific settings and renders the result', async () => {
    const postMessageMock = vi.fn()
    let onMessage: ((event: WorkerMessageEvent) => void) | null = null

    class WorkerStub {
      addEventListener(_type: string, handler: (event: WorkerMessageEvent) => void) {
        onMessage = handler
      }

      postMessage(payload: unknown) {
        postMessageMock(payload)
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', WorkerStub)

    const wrapper = mount(NarrativeQualitySlot, {
      global: {
        stubs: {
          UProgress: progressStub,
          UBadge: badgeStub
        }
      },
      props: {
        config: {
          assessments: {
            'schema-1': {
              questionComments: {
                [buildNarrativeQualityQuestionKey('section-a', 'sub-a', 'question-a')]: {
                  enabled: true,
                  question: {
                    en: 'Comment prompt',
                    fr: 'Question de commentaire'
                  },
                  criteria: {
                    en: [{ label: 'Specific evidence', weight: 4 }],
                    fr: [{ label: 'Preuve precise', weight: 4 }]
                  },
                  request_config: {
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
                  }
                }
              }
            }
          }
        },
        context: {
          textarea: {
            kind: 'assessment.questionComment',
            locale: 'en',
            label: 'Describe the evidence',
            text: 'Needs stronger support.',
            assessmentSchemaId: 'schema-1',
            sectionName: 'section-a',
            subSectionName: 'sub-a',
            questionName: 'question-a'
          }
        }
      }
    })

    await flushPromises()
    vi.advanceTimersByTime(500)
    await flushPromises()

    const payload = postMessageMock.mock.calls[0]?.[0] as {
      payload: {
        groupKey: string
        settings: {
          question: {
            en: string
          }
        }
      }
    }

    expect(payload.payload.groupKey).toBe('question-comment-schema-1-section-a::sub-a::question-a')
    expect(payload.payload.settings.question.en).toBe('Comment prompt')

    onMessage?.({
      data: {
        requestId: 1,
        result: {
          overallPercent: 84,
          tone: 'success',
          statusLabel: {
            en: 'Strong fit',
            fr: 'Bonne adequation'
          },
          label: {
            en: 'Strong fit',
            fr: 'Bonne adequation'
          },
          activity: {
            label: {
              en: 'Scored',
              fr: 'Note'
            }
          }
        }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Strong fit')
    expect(wrapper.text()).toContain('Scored')
  })

  it('does not create worker requests when no scoreable target text is present', async () => {
    const postMessageMock = vi.fn()

    class WorkerStub {
      addEventListener() {}

      postMessage(payload: unknown) {
        postMessageMock(payload)
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', WorkerStub)

    const wrapper = mount(NarrativeQualitySlot, {
      global: {
        stubs: {
          UProgress: progressStub,
          UBadge: badgeStub
        }
      },
      props: {
        config: {},
        context: {
          textarea: {
            kind: 'assessment.questionComment',
            locale: 'en',
            label: 'Describe the evidence',
            text: '',
            assessmentSchemaId: 'schema-1',
            sectionName: 'section-a',
            subSectionName: 'sub-a',
            questionName: 'question-a'
          }
        }
      }
    })

    await flushPromises()
    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(postMessageMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('')
  })

  it('does not create worker requests for disabled targets', async () => {
    const postMessageMock = vi.fn()

    class WorkerStub {
      addEventListener() {}

      postMessage(payload: unknown) {
        postMessageMock(payload)
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', WorkerStub)

    const wrapper = mount(NarrativeQualitySlot, {
      global: {
        stubs: {
          UProgress: progressStub,
          UBadge: badgeStub
        }
      },
      props: {
        config: {
          assessments: {
            'schema-1': {
              questionComments: {
                [buildNarrativeQualityQuestionKey('section-a', 'sub-a', 'question-a')]: {
                  enabled: false
                }
              }
            }
          }
        },
        context: {
          textarea: {
            kind: 'assessment.questionComment',
            locale: 'en',
            label: 'Describe the evidence',
            text: 'Needs stronger support.',
            assessmentSchemaId: 'schema-1',
            sectionName: 'section-a',
            subSectionName: 'sub-a',
            questionName: 'question-a'
          }
        }
      }
    })

    await flushPromises()
    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(postMessageMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('')
  })

  it('reuses one browser-global worker across multiple mounted slot instances', async () => {
    const postMessageMock = vi.fn()
    const workerConstructorMock = vi.fn()

    class WorkerStub {
      constructor() {
        workerConstructorMock()
      }

      addEventListener() {}

      postMessage(payload: unknown) {
        postMessageMock(payload)
      }

      terminate() {}
    }

    vi.stubGlobal('Worker', WorkerStub)

    const createProps = (questionName: string) => ({
      config: {
        assessments: {
          'schema-1': {
            questionComments: {
              [buildNarrativeQualityQuestionKey('section-a', 'sub-a', questionName)]: {
                enabled: true
              }
            }
          }
        }
      },
      context: {
        textarea: {
          kind: 'assessment.questionComment',
          locale: 'en',
          label: 'Describe the evidence',
          text: `Evidence for ${questionName}.`,
          assessmentSchemaId: 'schema-1',
          sectionName: 'section-a',
          subSectionName: 'sub-a',
          questionName
        }
      }
    })

    const wrappers = ['question-a', 'question-b', 'question-c', 'question-d'].map(questionName =>
      mount(NarrativeQualitySlot, {
        global: {
          stubs: {
            UProgress: progressStub,
            UBadge: badgeStub
          }
        },
        props: createProps(questionName)
      })
    )

    await flushPromises()
    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(workerConstructorMock).toHaveBeenCalledTimes(1)
    expect(postMessageMock).toHaveBeenCalledTimes(4)
    expect(postMessageMock.mock.calls.map(call => (call[0] as { payload: { groupKey: string } }).payload.groupKey)).toEqual([
      'question-comment-schema-1-section-a::sub-a::question-a',
      'question-comment-schema-1-section-a::sub-a::question-b',
      'question-comment-schema-1-section-a::sub-a::question-c',
      'question-comment-schema-1-section-a::sub-a::question-d'
    ])

    wrappers.forEach(wrapper => wrapper.unmount())
  })
})
