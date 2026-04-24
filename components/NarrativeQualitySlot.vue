<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { GcsExtensionJsonConfig } from '~~/shared/utils/extensions'
import {
  normalizeNarrativeQualityConfig,
  resolveNarrativeQualityTargetConfig,
  resolveNarrativeQualityTargets
} from './narrative-quality'
import type { NarrativeQualityTarget } from './narrative-quality'

interface QualityMeterLabel {
  en: string
  fr: string
}

interface QualityMeterResult {
  overallPercent?: number
  tone?: 'error' | 'warning' | 'success'
  statusLabel?: QualityMeterLabel
  label?: QualityMeterLabel
  activity?: {
    label?: QualityMeterLabel
  } | null
}

interface WorkerMessage {
  kind?: 'status' | 'result' | 'error'
  requestId?: number
  result?: QualityMeterResult
  error?: string
}

interface SharedWorkerState {
  worker: Worker | null
  requestId: number
  listeners: Set<(message: WorkerMessage) => void>
}

const SCORE_REQUEST_DEBOUNCE_MS = 500
const SHARED_WORKER_STATE_KEY = '__gcsNarrativeQualityWorkerState'

const getSharedWorkerState = (): SharedWorkerState => {
  const globalScope = globalThis as typeof globalThis & {
    [SHARED_WORKER_STATE_KEY]?: SharedWorkerState
  }

  if (!globalScope[SHARED_WORKER_STATE_KEY]) {
    globalScope[SHARED_WORKER_STATE_KEY] = {
      worker: null,
      requestId: 1,
      listeners: new Set()
    }
  }

  return globalScope[SHARED_WORKER_STATE_KEY]
}

const getSharedWorker = () => {
  const state = getSharedWorkerState()
  if (!state.worker) {
    state.worker = new Worker('/extensions/gcs-narrative-quality/client/worker.js', { type: 'module' })
    state.worker.addEventListener('message', event => {
      const message = event.data as WorkerMessage
      for (const listener of state.listeners) {
        listener(message)
      }
    })
  }

  return state.worker
}

const subscribeToSharedWorker = (listener: (message: WorkerMessage) => void) => {
  const state = getSharedWorkerState()
  state.listeners.add(listener)

  return () => {
    state.listeners.delete(listener)
  }
}

const createSharedRequestId = () => {
  const state = getSharedWorkerState()
  const requestId = state.requestId
  state.requestId += 1
  return requestId
}

const {
  config,
  context = {}
} = defineProps<{
  config: GcsExtensionJsonConfig
  context?: Record<string, unknown>
}>()

const { locale } = useI18n()

const resultByKey: Ref<Record<string, QualityMeterResult>> = ref({})
const errorByKey: Ref<Record<string, string>> = ref({})
const requestKeyById: Ref<Record<number, string>> = ref({})
const latestRequestByKey: Ref<Record<string, number>> = ref({})
const pendingScoreTimers: Ref<Record<string, ReturnType<typeof setTimeout>>> = ref({})
const unsubscribeWorker: Ref<(() => void) | null> = ref(null)

const labels = {
  loading: { en: 'Preparing quality meter', fr: 'Préparation de l’indicateur de qualité' },
  unavailable: { en: 'Quality meter unavailable', fr: 'Indicateur de qualité indisponible' },
  scoring: { en: 'Scoring', fr: 'Évaluation' }
} as const

const text = (key: keyof typeof labels) => {
  const item = labels[key]
  return locale.value === 'fr' ? item.fr : item.en
}

const targets = computed<NarrativeQualityTarget[]>(() => resolveNarrativeQualityTargets(context, locale.value))
const enabledTargets = computed(() => {
  const normalizedConfig = normalizeNarrativeQualityConfig(config)

  return targets.value.flatMap(target => {
    const settings = resolveNarrativeQualityTargetConfig(normalizedConfig, target.configKey)
    if (!settings) {
      return []
    }

    return [{
      ...target,
      settings
    }]
  })
})

const localizedLabel = (label: QualityMeterLabel | undefined) => {
  if (!label) {
    return ''
  }

  return locale.value === 'fr' ? label.fr : label.en
}

const hasMultipleTargets = computed(() => enabledTargets.value.length > 1)

const toneClasses = (tone: QualityMeterResult['tone']) => {
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'
  if (tone === 'error') return 'error'
  return 'neutral'
}

const handleWorkerMessage = (message: WorkerMessage) => {
  const requestId = typeof message.requestId === 'number' ? message.requestId : 0
  const targetKey = requestKeyById.value[requestId]
  if (!targetKey) {
    return
  }
  if (latestRequestByKey.value[targetKey] !== requestId) {
    return
  }

  if (message.kind === 'error') {
    errorByKey.value = {
      ...errorByKey.value,
      [targetKey]: message.error || text('unavailable')
    }
    return
  }

  if (message.result) {
    resultByKey.value = {
      ...resultByKey.value,
      [targetKey]: message.result
    }
  }
}

const clearPendingScoreTimers = () => {
  for (const timer of Object.values(pendingScoreTimers.value)) {
    clearTimeout(timer)
  }
  pendingScoreTimers.value = {}
}

const scheduleScoreRequest = (target: NarrativeQualityTarget & { settings: unknown }) => {
  const existingTimer = pendingScoreTimers.value[target.key]
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const requestId = createSharedRequestId()
  requestKeyById.value[requestId] = target.key
  latestRequestByKey.value[target.key] = requestId

  pendingScoreTimers.value = {
    ...pendingScoreTimers.value,
    [target.key]: setTimeout(() => {
      pendingScoreTimers.value = Object.fromEntries(
        Object.entries(pendingScoreTimers.value).filter(([key]) => key !== target.key)
      )

      getSharedWorker().postMessage({
        type: 'score',
        requestId,
        payload: {
          groupKey: target.key,
          text: target.text,
          locale: target.locale,
          settings: target.settings
        }
      })
    }, SCORE_REQUEST_DEBOUNCE_MS)
  }
}

unsubscribeWorker.value = subscribeToSharedWorker(handleWorkerMessage)

watch(
  () => ({
    config,
    targets: enabledTargets.value.map(target => `${target.key}:${target.text}`).join('|'),
    locale: locale.value
  }),
  () => {
    clearPendingScoreTimers()
    resultByKey.value = {}
    errorByKey.value = {}
    requestKeyById.value = {}
    latestRequestByKey.value = {}

    for (const target of enabledTargets.value) {
      scheduleScoreRequest(target)
    }
  },
  { immediate: true, deep: true }
)

onBeforeUnmount(() => {
  clearPendingScoreTimers()
  if (unsubscribeWorker.value) {
    unsubscribeWorker.value()
  }
})
</script>

<template>
  <div
    v-if="enabledTargets.length > 0"
    class="gap-4"
    :class="hasMultipleTargets ? 'grid grid-cols-1 md:grid-cols-2' : 'space-y-2'">
    <div
      v-for="target in enabledTargets"
      :key="target.key"
      class="space-y-2">
      <UProgress
        :model-value="resultByKey[target.key]?.overallPercent || 0"
        :color="toneClasses(resultByKey[target.key]?.tone)"
        :max="100"
        class="narrative-quality-meter"
        :ui="{
          base: 'h-2 rounded-full bg-zinc-200 dark:bg-zinc-800',
          indicator: 'rounded-full'
        }" />

      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          v-if="errorByKey[target.key]"
          color="error"
          variant="solid">
          {{ text('unavailable') }}
        </UBadge>

        <UBadge
          v-else-if="localizedLabel(resultByKey[target.key]?.statusLabel)"
          :color="toneClasses(resultByKey[target.key]?.tone)"
          variant="solid">
          {{ localizedLabel(resultByKey[target.key]?.statusLabel) }}
        </UBadge>

        <div
          v-if="localizedLabel(resultByKey[target.key]?.activity?.label)"
          class="inline-flex items-center gap-1 text-xs text-muted">
          <span class="plugin-runtime-activity-dot" />
          <span class="plugin-runtime-activity-dot plugin-runtime-activity-dot--delayed" />
          <span class="plugin-runtime-activity-dot plugin-runtime-activity-dot--late" />
          <span>{{ localizedLabel(resultByKey[target.key]?.activity?.label) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-runtime-activity-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: var(--ui-primary);
  animation: plugin-runtime-activity-bounce 1s infinite ease-in-out;
}

.plugin-runtime-activity-dot--delayed {
  animation-delay: -0.2s;
}

.plugin-runtime-activity-dot--late {
  animation-delay: -0.1s;
}

@keyframes plugin-runtime-activity-bounce {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>
