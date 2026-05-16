import { describe, expect, it } from 'vitest'
import {
  getPluginModelValue,
  mergePluginUiDefaults,
  setModelValue
} from '../../components/narrative-quality-config-model'
import type { NarrativeQualityPluginUiNode } from '../../components/narrative-quality-plugin-ui'

describe('narrative quality config model defaults', () => {
  it('merges nested plugin UI defaults while preserving current values', () => {
    const schema: NarrativeQualityPluginUiNode = {
      type: 'section',
      key: 'quality',
      children: [
        {
          type: 'input',
          key: 'prompt',
          default_value: 'Default prompt'
        },
        {
          type: 'group',
          key: 'thresholds',
          children: [
            {
              type: 'number',
              key: 'minimum',
              default_value: 3
            },
            {
              type: 'switch',
              key: 'enabled',
              default_value: true
            }
          ]
        },
        {
          type: 'collection',
          key: 'criteria'
        }
      ]
    }

    expect(mergePluginUiDefaults(schema, {
      quality: {
        prompt: 'Custom prompt',
        thresholds: {
          enabled: false
        }
      }
    })).toEqual({
      quality: {
        prompt: 'Custom prompt',
        thresholds: {
          minimum: 3,
          enabled: false
        },
        criteria: []
      }
    })
  })

  it('merges defaults from unkeyed container children into their parent', () => {
    const schema: NarrativeQualityPluginUiNode = {
      type: 'stack',
      children: [
        {
          type: 'group',
          children: [
            {
              type: 'select',
              key: 'target',
              default_value: 'agreement'
            }
          ]
        },
        {
          type: 'textarea',
          key: 'instructions',
          default_value: 'Score the narrative'
        }
      ]
    }

    expect(mergePluginUiDefaults(schema)).toEqual({
      target: 'agreement',
      instructions: 'Score the narrative'
    })
  })

  it('merges repeated unkeyed container defaults into the same nested object', () => {
    const schema: NarrativeQualityPluginUiNode = {
      type: 'stack',
      children: [
        {
          type: 'group',
          children: [
            {
              type: 'select',
              key: 'request.presentation',
              default_value: 'warning'
            }
          ]
        },
        {
          type: 'group',
          children: [
            {
              type: 'switch',
              key: 'request.enabled',
              default_value: true
            }
          ]
        }
      ]
    }

    expect(mergePluginUiDefaults(schema)).toEqual({
      request: {
        presentation: 'warning',
        enabled: true
      }
    })
  })

  it('uses type-specific defaults and preserves existing collection arrays', () => {
    const schema: NarrativeQualityPluginUiNode = {
      type: 'group',
      children: [
        {
          type: 'input',
          key: 'prompt',
          default_value: 12
        },
        {
          type: 'number',
          key: 'minimum',
          default_value: '4'
        },
        {
          type: 'switch',
          key: 'enabled',
          default_value: 'true'
        },
        {
          type: 'text',
          key: 'help'
        },
        {
          type: 'notice',
          key: 'notice',
          default_value: 'Read carefully'
        },
        {
          type: 'collection',
          key: 'criteria'
        }
      ]
    }

    expect(mergePluginUiDefaults(schema, {
      criteria: [{ label: 'Specific evidence', weight: 2 }],
      extra: {
        value: 'kept'
      }
    })).toEqual({
      prompt: '',
      minimum: 0,
      enabled: false,
      help: null,
      notice: 'Read carefully',
      criteria: [{ label: 'Specific evidence', weight: 2 }],
      extra: {
        value: 'kept'
      }
    })
  })

  it('falls back to collection defaults when current values are not arrays', () => {
    const schema: NarrativeQualityPluginUiNode = {
      type: 'group',
      children: [
        {
          type: 'collection',
          key: 'criteria'
        }
      ]
    }

    expect(mergePluginUiDefaults(schema, { criteria: 'not an array' })).toEqual({
      criteria: []
    })
  })

  it('reads and writes dotted model paths without disturbing sibling values', () => {
    const model = {
      request: {
        enabled: true
      }
    }

    setModelValue(model, 'request.threshold.minimum', 70)

    expect(getPluginModelValue(model, 'request.enabled')).toBe(true)
    expect(getPluginModelValue(model, 'request.threshold.minimum')).toBe(70)
    expect(getPluginModelValue(model, 'request.threshold.maximum')).toBeUndefined()
  })
})
