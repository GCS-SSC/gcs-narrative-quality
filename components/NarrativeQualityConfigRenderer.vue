<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { nanoid } from 'nanoid'
import { computed, watch } from 'vue'
import type {
  NarrativeQualityPluginLabel,
  NarrativeQualityPluginUiNode
} from './narrative-quality-plugin-ui'
import {
  getPluginModelValue,
  mergePluginUiDefaults,
  setModelValue
} from './narrative-quality-config-model'

type CollectionRow = Record<string, unknown> & {
  __renderKey?: string
}

const {
  schema = { type: 'stack', children: [] } as NarrativeQualityPluginUiNode,
  model = {}
} = defineProps<{
  schema?: NarrativeQualityPluginUiNode
  model?: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:model': [value: Record<string, unknown>]
}>()

const { locale, t } = useI18n()

const fieldValue = computed(() => {
  if (!schema.key) {
    return undefined
  }

  return getPluginModelValue(model, schema.key)
})

const collectionItems = computed<Record<string, unknown>[]>(() => {
  if (!schema.key) {
    return []
  }

  const value = getPluginModelValue(model, schema.key)
  return Array.isArray(value) ? value as Record<string, unknown>[] : []
})

const getText = (value?: NarrativeQualityPluginLabel) => {
  if (!value) {
    return ''
  }

  return locale.value === 'fr' ? value.fr : value.en
}

const getDisplayText = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'en' in value
    && 'fr' in value
    && typeof value.en === 'string'
    && typeof value.fr === 'string'
  ) {
    return getText(value as NarrativeQualityPluginLabel)
  }

  return ''
}

const updateCurrentModel = (updater: (draft: Record<string, unknown>) => void) => {
  const nextModel = { ...model }
  updater(nextModel)
  emit('update:model', nextModel)
}

const ensureCollectionItemKey = (row: Record<string, unknown>) => {
  const typedRow = row as CollectionRow

  if (typeof typedRow.__renderKey === 'string' && typedRow.__renderKey.length > 0) {
    return typedRow.__renderKey
  }

  Object.defineProperty(typedRow, '__renderKey', {
    value: nanoid(),
    enumerable: false,
    configurable: true
  })

  return typedRow.__renderKey as string
}

const replaceCollectionItems = (items: Record<string, unknown>[]) => {
  if (!schema.key) {
    return
  }

  updateCurrentModel(nextModel => {
    setModelValue(nextModel, schema.key as string, items)
  })
}

const addCollectionItem = () => {
  const nextItem = mergePluginUiDefaults(
    schema.item_schema,
    undefined
  ) as Record<string, unknown>

  ensureCollectionItemKey(nextItem)
  replaceCollectionItems([...collectionItems.value, nextItem])
}

const updateCollectionItem = (index: number, value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return
  }

  const nextItems = [...collectionItems.value]
  const nextItem = value as Record<string, unknown>
  const existingItem = nextItems[index]

  if (existingItem) {
    const existingKey = ensureCollectionItemKey(existingItem)
    Object.defineProperty(nextItem as CollectionRow, '__renderKey', {
      value: existingKey,
      enumerable: false,
      configurable: true
    })
  }

  nextItems.splice(index, 1, nextItem)
  replaceCollectionItems(nextItems)
}

const removeCollectionItem = (index: number) => {
  const nextItems = [...collectionItems.value]
  nextItems.splice(index, 1)
  replaceCollectionItems(nextItems)
}

const getCollectionItemTitle = (row: Record<string, unknown>, index: number) => {
  const itemTitle = typeof schema.item_title_key === 'string' && schema.item_title_key.length > 0
    ? getDisplayText(getPluginModelValue(row, schema.item_title_key))
    : ''

  if (itemTitle.length > 0) {
    return `${index + 1} - ${itemTitle}`
  }

  const fallbackTitle = getText(schema.item_title_label) || t('common.item')
  return `${fallbackTitle} ${index + 1}`
}

const updateField = (value: unknown) => {
  if (!schema.key) {
    return
  }

  updateCurrentModel(nextModel => {
    setModelValue(nextModel, schema.key as string, value)
  })
}

watch(collectionItems, rows => {
  for (const row of rows) {
    ensureCollectionItemKey(row)
  }
}, { immediate: true })
</script>

<template>
  <div v-if="schema.type === 'stack'" class="space-y-8">
    <NarrativeQualityConfigRenderer
      v-for="(child, index) in schema.children ?? []"
      :key="`${schema.type}-${index}`"
      :model="model"
      :schema="child"
      @update:model="value => emit('update:model', value)" />
  </div>

  <div v-else-if="schema.type === 'group'" class="grid grid-cols-1 gap-6 md:grid-cols-2">
    <NarrativeQualityConfigRenderer
      v-for="(child, index) in schema.children ?? []"
      :key="`${schema.type}-${index}`"
      :model="model"
      :schema="child"
      @update:model="value => emit('update:model', value)" />
  </div>

  <CommonSection
    v-else-if="schema.type === 'section'"
    :title="getText(schema.label)"
    :badge="schema.badge"
    :grid-cols="1">
    <div class="space-y-2 md:col-span-1">
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>

    <div class="space-y-6">
      <NarrativeQualityConfigRenderer
        v-for="(child, index) in schema.children ?? []"
        :key="`${schema.type}-${index}`"
        :model="model"
        :schema="child"
        @update:model="value => emit('update:model', value)" />
    </div>
  </CommonSection>

  <AssessmentSchemaAccordionSection
    v-else-if="schema.type === 'accordion'"
    :title="getText(schema.label)"
    :default-open="Boolean(schema.default_open)">
    <div class="space-y-6">
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>

      <NarrativeQualityConfigRenderer
        v-for="(child, index) in schema.children ?? []"
        :key="`${schema.type}-${index}`"
        :model="model"
        :schema="child"
        @update:model="value => emit('update:model', value)" />
    </div>
  </AssessmentSchemaAccordionSection>

  <p v-else-if="schema.type === 'text'" class="text-sm text-zinc-500 dark:text-zinc-400">
    {{ getText(schema.value) }}
  </p>

  <div
    v-else-if="schema.type === 'notice'"
    class="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary dark:border-primary/35 dark:bg-primary/15">
    {{ getText(schema.value) }}
  </div>

  <UFormField v-else-if="schema.type === 'textarea' && schema.key" :label="getText(schema.label)">
    <div class="space-y-2">
      <UTextarea
        :model-value="String(fieldValue ?? '')"
        :rows="schema.rows ?? 4"
        @update:model-value="value => updateField(String(value ?? ''))" />
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>
  </UFormField>

  <UFormField v-else-if="schema.type === 'input' && schema.key" :label="getText(schema.label)">
    <div class="space-y-2">
      <UInput
        :model-value="String(fieldValue ?? '')"
        @update:model-value="value => updateField(String(value ?? ''))" />
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>
  </UFormField>

  <UFormField v-else-if="schema.type === 'number' && schema.key" :label="getText(schema.label)">
    <div class="space-y-2">
      <UInput
        type="number"
        :model-value="String(fieldValue ?? '')"
        :min="schema.min"
        :max="schema.max"
        :step="schema.step ?? 1"
        @update:model-value="value => {
          const nextValue = typeof value === 'number' ? value : Number(value ?? 0)
          updateField(Number.isFinite(nextValue) ? nextValue : 0)
        }" />
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>
  </UFormField>

  <UFormField v-else-if="schema.type === 'select' && schema.key" :label="getText(schema.label)">
    <div class="space-y-2">
      <USelect
        :model-value="String(fieldValue ?? '')"
        :items="(schema.options ?? []).map(option => ({ value: option.value, label: getText(option.label) }))"
        value-key="value"
        label-key="label"
        @update:model-value="value => updateField(String(value ?? ''))" />
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>
  </UFormField>

  <UFormField v-else-if="schema.type === 'switch' && schema.key" :label="getText(schema.label)">
    <div class="space-y-2">
      <USwitch
        :model-value="Boolean(fieldValue)"
        @update:model-value="value => updateField(Boolean(value))" />
      <p
        v-if="schema.description"
        class="text-sm text-zinc-500 dark:text-zinc-400">
        {{ getText(schema.description) }}
      </p>
    </div>
  </UFormField>

  <div v-else-if="schema.type === 'collection' && schema.key" class="space-y-4">
    <AssessmentSchemaAccordionSection :title="getText(schema.label)" :default-open="true">
      <div class="space-y-4">
        <p
          v-if="schema.description"
          class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ getText(schema.description) }}
        </p>

        <div class="flex justify-end">
          <UButton
            icon="i-lucide-plus"
            :label="getText(schema.add_label) || t('common.add')"
            variant="outline"
            class="cursor-default"
            @click="addCollectionItem" />
        </div>

        <p
          v-if="collectionItems.length === 0 && schema.empty_label"
          class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ getText(schema.empty_label) }}
        </p>

        <AssessmentSchemaAccordionSection
          v-for="(row, rowIndex) in collectionItems"
          :key="ensureCollectionItemKey(row)"
          :title="getCollectionItemTitle(row, rowIndex)"
          level="sub">
          <div class="space-y-6">
            <NarrativeQualityConfigRenderer
              v-if="schema.item_schema"
              :model="row"
              :schema="schema.item_schema"
              @update:model="value => updateCollectionItem(rowIndex, value)" />

            <div class="flex justify-end">
              <UButton
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                class="cursor-default"
                @click="removeCollectionItem(rowIndex)" />
            </div>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
