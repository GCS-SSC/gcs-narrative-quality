/* eslint-disable jsdoc/require-jsdoc */
import type { NarrativeQualityPluginUiNode } from './narrative-quality-plugin-ui'

type DefaultValueFactory = (schema: NarrativeQualityPluginUiNode, skipSchemaKey: boolean) => unknown

const getPathSegments = (path: string) => path.split('.').filter(segment => segment.trim().length > 0)

const getModelValue = (model: Record<string, unknown>, path: string) =>
  getPathSegments(path).reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }

    return (current as Record<string, unknown>)[segment]
  }, model)

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

const shouldMergeRecordDefaults = (existingValue: unknown, nestedValue: unknown): existingValue is Record<string, unknown> =>
  isPlainRecord(existingValue) && isPlainRecord(nestedValue)

const assignNestedDefault = (
  target: Record<string, unknown>,
  key: string,
  nestedValue: unknown
) => {
  const existingValue = target[key]
  if (shouldMergeRecordDefaults(existingValue, nestedValue)) {
    mergeNestedDefaults(existingValue, nestedValue)
    return
  }

  target[key] = nestedValue
}

const mergeNestedDefaults = (target: Record<string, unknown>, value: unknown) => {
  if (!isPlainRecord(value)) {
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    assignNestedDefault(target, key, nestedValue)
  }
}

const createStringDefaultValue = (schema: NarrativeQualityPluginUiNode) =>
  typeof schema.default_value === 'string' ? schema.default_value : ''

const createNumberDefaultValue = (schema: NarrativeQualityPluginUiNode) =>
  typeof schema.default_value === 'number' ? schema.default_value : 0

const createSwitchDefaultValue = (schema: NarrativeQualityPluginUiNode) =>
  typeof schema.default_value === 'boolean' ? schema.default_value : false

const createCollectionDefaultValue = () => []

const createLiteralDefaultValue = (schema: NarrativeQualityPluginUiNode) =>
  schema.default_value === undefined ? null : schema.default_value

const createChildDefaults = (children: NarrativeQualityPluginUiNode[] = []): Record<string, unknown> =>
  children.reduce<Record<string, unknown>>((acc, child) => {
    const childDefault = createDefaultValue(child, true)
    if (!child.key) {
      mergeNestedDefaults(acc, childDefault)
      return acc
    }

    setModelValue(acc, child.key, childDefault)
    return acc
  }, {})

const createContainerDefaultValue = (
  schema: NarrativeQualityPluginUiNode,
  skipSchemaKey: boolean
): Record<string, unknown> => {
  const nestedDefaults = createChildDefaults(schema.children)
  if (schema.key && !skipSchemaKey) {
    const wrappedDefaults: Record<string, unknown> = {}
    setModelValue(wrappedDefaults, schema.key, nestedDefaults)
    return wrappedDefaults
  }

  return nestedDefaults
}

const defaultValueFactories: Partial<Record<NarrativeQualityPluginUiNode['type'], DefaultValueFactory>> = {
  input: createStringDefaultValue,
  textarea: createStringDefaultValue,
  select: createStringDefaultValue,
  number: createNumberDefaultValue,
  switch: createSwitchDefaultValue,
  collection: createCollectionDefaultValue,
  stack: createContainerDefaultValue,
  group: createContainerDefaultValue,
  section: createContainerDefaultValue,
  accordion: createContainerDefaultValue
}

const createDefaultValue = (schema?: NarrativeQualityPluginUiNode, skipSchemaKey = false): unknown => {
  if (!schema) {
    return {}
  }

  const factory = defaultValueFactories[schema.type]
  if (factory) {
    return factory(schema, skipSchemaKey)
  }

  return createLiteralDefaultValue(schema)
}

const cloneValue = <T>(value: T): T => structuredClone(value)

const mergeArrayValues = (defaults: unknown[], current: unknown): unknown[] =>
  Array.isArray(current) ? cloneValue(current) : cloneValue(defaults)

const mergeRecordValues = (
  defaults: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = cloneValue(defaults)

  for (const [key, currentChildValue] of Object.entries(current)) {
    merged[key] = mergeValues(merged[key], currentChildValue)
  }

  return merged
}

const mergeValues = (defaults: unknown, current: unknown): unknown => {
  if (current === undefined) {
    return cloneValue(defaults)
  }

  if (Array.isArray(defaults)) {
    return mergeArrayValues(defaults, current)
  }

  if (isPlainRecord(defaults) && isPlainRecord(current)) {
    return mergeRecordValues(defaults, current)
  }

  return cloneValue(current)
}

export const mergePluginUiDefaults = (schema: NarrativeQualityPluginUiNode | undefined, currentValue?: unknown): unknown => {
  const defaultValue = createDefaultValue(schema)
  return mergeValues(defaultValue, currentValue)
}

export const getPluginModelValue = getModelValue
