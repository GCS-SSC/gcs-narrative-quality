<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { JsonValue } from '@gcs-ssc/extensions'
import type { NarrativeQualityPluginUiNode } from './narrative-quality-plugin-ui'
import configSchemaJson from '../ui/config.json'
import NarrativeQualityConfigRenderer from './NarrativeQualityConfigRenderer.vue'
import {
  narrativeQualityTargetDefinitions,
  normalizeNarrativeQualityConfig,
  toNarrativeQualityJson
} from './narrative-quality'
import type {
  NarrativeQualityAssessmentTarget,
  NarrativeQualityConfig,
  NarrativeQualityLocale,
  NarrativeQualityProfile,
  NarrativeQualityTargetKey
} from './narrative-quality'

const model = defineModel<Record<string, JsonValue>>({
  default: () => ({})
})

const { streamId = '' } = defineProps<{
  streamId?: string
}>()

const { locale } = useI18n()

const configSchema = configSchemaJson as NarrativeQualityPluginUiNode
const activeTarget: Ref<NarrativeQualityTargetKey> = ref('agreement_top_level')
const selectedAlignmentSchemaId: Ref<string> = ref('')
const selectedCommentSchemaId: Ref<string> = ref('')
const selectedQuestionKey: Ref<string> = ref('')
const state: Ref<NarrativeQualityConfig> = ref(normalizeNarrativeQualityConfig(model.value))

const { data: catalogData, status: catalogStatus, error: catalogError } = useFetch<{ items: NarrativeQualityAssessmentTarget[] }>(
  `/api/extensions/gcs-narrative-quality/streams/${streamId}/assessment-targets`,
  {
    server: false,
    immediate: streamId.length > 0,
    default: () => ({
      items: []
    })
  }
)

const labels = {
  title: { en: 'Narrative scoring setup', fr: 'Configuration de la notation narrative' },
  description: {
    en: 'Configure the same scoring model used by the original plugin-platform flow, scoped to the exact narrative target on this stream.',
    fr: 'Configurez le même modèle de notation que dans le flux original de la plateforme de plugins, appliqué à la cible narrative exacte de ce volet.'
  },
  targetSection: { en: 'Scored Narrative Field', fr: 'Champ narratif évalué' },
  targetDescription: {
    en: 'Choose which narrative field this configuration applies to before editing the scoring prompt and criteria.',
    fr: 'Choisissez le champ narratif auquel cette configuration s’applique avant de modifier la question et les critères de notation.'
  },
  target: { en: 'Target', fr: 'Cible' },
  assessment: { en: 'Assessment', fr: 'Évaluation' },
  assessmentDescription: {
    en: 'Select which assessment schema this narrative prompt applies to.',
    fr: 'Sélectionnez le schéma d’évaluation auquel cette question narrative s’applique.'
  },
  questionSelection: { en: 'Question', fr: 'Question' },
  questionDescription: {
    en: 'Select the exact assessment question comment that should be scored.',
    fr: 'Sélectionnez le commentaire de question d’évaluation précis qui doit être noté.'
  },
  noAssessments: {
    en: 'No assessment schemas are configured for this stream yet.',
    fr: 'Aucun schéma d’évaluation n’est encore configuré pour ce volet.'
  },
  noQuestions: {
    en: 'This assessment schema has no scoreable questions.',
    fr: 'Ce schéma d’évaluation ne contient aucune question à noter.'
  },
  loadingAssessments: {
    en: 'Loading assessment schemas...',
    fr: 'Chargement des schémas d’évaluation...'
  },
  loadingError: {
    en: 'Assessment schemas could not be loaded right now.',
    fr: 'Les schémas d’évaluation ne peuvent pas être chargés pour le moment.'
  },
  enabled: {
    en: 'Enable scoring for this target',
    fr: 'Activer la notation pour cette cible'
  },
  enabledDescription: {
    en: 'Only explicitly enabled targets render the scorer at runtime.',
    fr: 'Seules les cibles explicitement activées affichent le scoreur à l’exécution.'
  }
} as const

const text = (key: keyof typeof labels) => {
  const item = labels[key]
  return locale.value === 'fr' ? item.fr : item.en
}

const localized = (value: Record<NarrativeQualityLocale, string>) => locale.value === 'fr' ? value.fr : value.en

const catalogItems = computed<NarrativeQualityAssessmentTarget[]>(() => catalogData.value?.items ?? [])

const syncSelectionState = (items: NarrativeQualityAssessmentTarget[]) => {
  const firstAssessment = items[0]
  const alignmentAssessment = items.find(item => item.schemaId === selectedAlignmentSchemaId.value) ?? firstAssessment
  const commentAssessment = items.find(item => item.schemaId === selectedCommentSchemaId.value) ?? firstAssessment

  selectedAlignmentSchemaId.value = alignmentAssessment?.schemaId ?? ''
  selectedCommentSchemaId.value = commentAssessment?.schemaId ?? ''

  const availableQuestions = commentAssessment?.questions ?? []
  const selectedQuestion = availableQuestions.find(item => item.key === selectedQuestionKey.value) ?? availableQuestions[0]
  selectedQuestionKey.value = selectedQuestion?.key ?? ''
}

watch(catalogItems, items => {
  state.value = normalizeNarrativeQualityConfig(model.value, items)
  syncSelectionState(items)
}, { immediate: true, deep: true })

watch(state, value => {
  model.value = toNarrativeQualityJson(value)
}, { deep: true })

const targetOptions = computed(() => narrativeQualityTargetDefinitions.map(target => ({
  label: localized(target.label),
  value: target.key
})))

const assessmentOptions = computed(() => catalogItems.value.map(item => ({
  label: localized(item.name),
  value: item.schemaId
})))

const selectedCommentAssessment = computed(() =>
  catalogItems.value.find(item => item.schemaId === selectedCommentSchemaId.value) ?? null
)

const questionOptions = computed(() => (selectedCommentAssessment.value?.questions ?? []).map(item => ({
  label: localized(item.label),
  value: item.key
})))

const getAssessmentProfile = (
  schemaId: string,
  targetKey: 'reviewAlignment' | 'questionComments',
  questionKey?: string
): NarrativeQualityProfile | null => {
  if (schemaId.length === 0) {
    return null
  }

  const assessmentConfig = state.value.assessments[schemaId]
  if (!assessmentConfig) {
    return null
  }

  if (targetKey === 'reviewAlignment') {
    return assessmentConfig.reviewAlignment
  }

  if (!questionKey || questionKey.length === 0) {
    return null
  }

  return assessmentConfig.questionComments[questionKey] ?? null
}

const currentProfile = computed<NarrativeQualityProfile | null>(() => {
  if (activeTarget.value === 'agreement_top_level') {
    return state.value.agreementTopLevel
  }

  if (activeTarget.value === 'assessment_review_alignment_narrative') {
    return getAssessmentProfile(selectedAlignmentSchemaId.value, 'reviewAlignment')
  }

  return getAssessmentProfile(selectedCommentSchemaId.value, 'questionComments', selectedQuestionKey.value)
})

const currentProfileModel = computed<Record<string, unknown> | null>(() =>
  currentProfile.value ? currentProfile.value as unknown as Record<string, unknown> : null
)

const canEditSelectedTarget = computed(() => {
  if (activeTarget.value === 'agreement_top_level') {
    return true
  }

  if (activeTarget.value === 'assessment_review_alignment_narrative') {
    return selectedAlignmentSchemaId.value.length > 0
  }

  return selectedCommentSchemaId.value.length > 0 && selectedQuestionKey.value.length > 0
})

const currentProfileEnabled = computed(() => currentProfile.value?.enabled === true)

const showQuestionField = computed(() => activeTarget.value === 'assessment_question_comment')

const showLoadingState = computed(() =>
  activeTarget.value !== 'agreement_top_level' && catalogStatus.value === 'pending'
)

const showNoAssessments = computed(() =>
  activeTarget.value !== 'agreement_top_level'
  && catalogStatus.value !== 'pending'
  && !catalogError.value
  && catalogItems.value.length === 0
)

const showNoQuestions = computed(() =>
  activeTarget.value === 'assessment_question_comment'
  && catalogStatus.value !== 'pending'
  && !catalogError.value
  && catalogItems.value.length > 0
  && questionOptions.value.length === 0
)

const showCatalogError = computed(() =>
  activeTarget.value !== 'agreement_top_level'
  && catalogStatus.value !== 'pending'
  && Boolean(catalogError.value)
)

const handleProfileUpdate = (value: Record<string, unknown>) => {
  if (!currentProfile.value) {
    return
  }

  Object.assign(currentProfile.value, value)
}

const handleCurrentProfileEnabledUpdate = (value: boolean | string) => {
  if (!currentProfile.value) {
    return
  }

  currentProfile.value.enabled = value === true
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h3 class="text-base font-semibold text-zinc-900 dark:text-white">
        {{ text('title') }}
      </h3>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {{ text('description') }}
      </p>
    </div>

    <CommonSection :title="text('targetSection')" badge="01" :grid-cols="2">
      <div class="space-y-2 md:col-span-2">
        <p class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ text('targetDescription') }}
        </p>
      </div>

      <UFormField :label="text('target')">
        <USelect
          v-model="activeTarget"
          :items="targetOptions"
          value-key="value"
          label-key="label" />
      </UFormField>

      <UFormField
        v-if="activeTarget === 'assessment_review_alignment_narrative'"
        :label="text('assessment')"
        :description="text('assessmentDescription')">
        <USelect
          v-model="selectedAlignmentSchemaId"
          :items="assessmentOptions"
          value-key="value"
          label-key="label"
          :disabled="showLoadingState || showNoAssessments" />
      </UFormField>

      <UFormField
        v-if="showQuestionField"
        :label="text('assessment')"
        :description="text('assessmentDescription')">
        <USelect
          v-model="selectedCommentSchemaId"
          :items="assessmentOptions"
          value-key="value"
          label-key="label"
          :disabled="showLoadingState || showNoAssessments" />
      </UFormField>

      <UFormField
        v-if="showQuestionField"
        :label="text('questionSelection')"
        :description="text('questionDescription')">
        <USelect
          v-if="questionOptions.length > 0"
          v-model="selectedQuestionKey"
          :items="questionOptions"
          value-key="value"
          label-key="label" />
        <div
          v-else
          class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ text('noQuestions') }}
        </div>
      </UFormField>

      <UFormField
        v-if="canEditSelectedTarget"
        :label="text('enabled')"
        :description="text('enabledDescription')">
        <USwitch
          :model-value="currentProfileEnabled"
          @update:model-value="handleCurrentProfileEnabledUpdate" />
      </UFormField>

      <div
        v-if="showLoadingState"
        class="text-sm text-zinc-500 dark:text-zinc-400 md:col-span-2">
        {{ text('loadingAssessments') }}
      </div>

      <div
        v-else-if="showCatalogError"
        class="text-sm text-error md:col-span-2">
        {{ text('loadingError') }}
      </div>

      <div
        v-else-if="showNoAssessments"
        class="text-sm text-zinc-500 dark:text-zinc-400 md:col-span-2">
        {{ text('noAssessments') }}
      </div>

      <div
        v-else-if="showNoQuestions"
        class="text-sm text-zinc-500 dark:text-zinc-400 md:col-span-2">
        {{ text('noQuestions') }}
      </div>
    </CommonSection>

    <NarrativeQualityConfigRenderer
      v-if="canEditSelectedTarget && currentProfile"
      :model="currentProfileModel || {}"
      :schema="configSchema"
      @update:model="handleProfileUpdate" />
  </div>
</template>
