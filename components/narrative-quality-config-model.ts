/* eslint-disable jsdoc/require-jsdoc */
import type { NarrativeQualityPluginUiNode } from './narrative-quality-plugin-ui'

const getPathSegments = (path: string) => path.split('.').filter(segment => segment.trim().length > 0)

const getModelValue = (model: Record<string, unknown>, path: string) =>
  getPathSegments(path).reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }

    return (current as Record<string, unknown>)[segment]
  }, model)

export const setModelValue = (model: Record<string, unknown>, path: string, value: unknown) => {
  const segments = getPathSegments(path)
  if (segments.length === 0) {
    return
  }

  let current: Record<string, unknown> = model

  for (const segment of segments.slice(0, -1)) {
    const nextValue = current[segment]
    if (typeof nextValue !== 'object' || nextValue === null || Array.isArray(nextValue)) {
      current[segment] = {}
    }

    current = current[segment] as Record<string, unknown>
  }

  const finalSegment = segments[segments.length - 1]
  if (!finalSegment) {
    return
  }

  current[finalSegment] = value
}

const mergeNestedDefaults = (target: Record<string, unknown>, value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const existingValue = target[key]

    if (
      typeof existingValue === 'object'
      && existingValue !== null
      && !Array.isArray(existingValue)
      && typeof nestedValue === 'object'
      && nestedValue !== null
      && !Array.isArray(nestedValue)
    ) {
      mergeNestedDefaults(existingValue as Record<string, unknown>, nestedValue)
      continue
    }

    target[key] = nestedValue
  }
}

const createDefaultValue = (schema?: NarrativeQualityPluginUiNode, skipSchemaKey = false): unknown => {
  if (!schema) {
    return {}
  }

  if (schema.type === 'input' || schema.type === 'textarea' || schema.type === 'select') {
    return typeof schema.default_value === 'string' ? schema.default_value : ''
  }

  if (schema.type === 'number') {
    return typeof schema.default_value === 'number' ? schema.default_value : 0
  }

  if (schema.type === 'switch') {
    return typeof schema.default_value === 'boolean' ? schema.default_value : false
  }

  if (schema.type === 'collection') {
    return []
  }

  if (
    schema.type === 'stack'
    || schema.type === 'group'
    || schema.type === 'section'
    || schema.type === 'accordion'
  ) {
    const nestedDefaults = (schema.children ?? []).reduce<Record<string, unknown>>((acc, child) => {
      if (!child.key) {
        mergeNestedDefaults(acc, createDefaultValue(child, true))
        return acc
      }

      setModelValue(acc, child.key, createDefaultValue(child, true))
      return acc
    }, {})

    if (schema.key && !skipSchemaKey) {
      const wrappedDefaults: Record<string, unknown> = {}
      setModelValue(wrappedDefaults, schema.key, nestedDefaults)
      return wrappedDefaults
    }

    return nestedDefaults
  }

  return schema.default_value ?? null
}

export const mergePluginUiDefaults = (schema: NarrativeQualityPluginUiNode | undefined, currentValue?: unknown): unknown => {
  const defaultValue = createDefaultValue(schema)

  const mergeValues = (defaults: unknown, current: unknown): unknown => {
    if (current === undefined) {
      return structuredClone(defaults)
    }

    if (Array.isArray(defaults)) {
      return Array.isArray(current) ? structuredClone(current) : structuredClone(defaults)
    }

    if (
      typeof defaults === 'object'
      && defaults !== null
      && typeof current === 'object'
      && current !== null
      && !Array.isArray(current)
    ) {
      const merged: Record<string, unknown> = structuredClone(defaults as Record<string, unknown>)

      for (const [key, currentChildValue] of Object.entries(current as Record<string, unknown>)) {
        merged[key] = mergeValues(merged[key], currentChildValue)
      }

      return merged
    }

    return structuredClone(current)
  }

  return mergeValues(defaultValue, currentValue)
}

export const getPluginModelValue = getModelValue
