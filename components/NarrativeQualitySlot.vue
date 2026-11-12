<script setup lang="ts">
import { NarrativeQualitySlotMessages } from '../i18n/NarrativeQualitySlot'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { GcsExtensionJsonConfig, GcsExtensionSlotContext } from '@gcs-ssc/extensions'
import {
  ExtensionBadge,
  ExtensionProgress,
  useExtensionI18n
} from '@gcs-ssc/extensions/ui'
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
  lifecycle: { kind: 'absent' } | { kind: 'live'; worker: Worker } | { kind: 'failed' }
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
      lifecycle: { kind: 'absent' },
      requestId: 1,
      listeners: new Set()
    }
  }

  return globalScope[SHARED_WORKER_STATE_KEY]
}

const getSharedWorker = () => {
  const state = getSharedWorkerState()
  if (state.lifecycle.kind !== 'live') {
    const worker = new Worker('/extensions/gcs-narrative-quality/client/worker.js', { type: 'module' })
    state.lifecycle = { kind: 'live', worker }
    worker.addEventListener('message', event => {
      if (state.lifecycle.kind !== 'live' || state.lifecycle.worker !== worker) return
      const message = event.data as WorkerMessage
      for (const listener of state.listeners) {
        listener(message)
      }
    })
    const handleWorkerFailure = () => {
      if (state.lifecycle.kind !== 'live' || state.lifecycle.worker !== worker) return
      state.lifecycle = { kind: 'failed' }
      worker.terminate()
      for (const listener of state.listeners) {
        listener({ kind: 'error' })
      }
    }
    worker.addEventListener('error', handleWorkerFailure)
    worker.addEventListener('messageerror', handleWorkerFailure)
  }

  return state.lifecycle.worker
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
  context?: GcsExtensionSlotContext
}>()

const { locale, t: text } = useExtensionI18n(NarrativeQualitySlotMessages)

type TargetScoreState =
  | { kind: 'debouncing'; requestId: number; unavailable: boolean; timer: ReturnType<typeof setTimeout> }
  | { kind: 'pending'; requestId: number; result: QualityMeterResult | null }
  | { kind: 'success'; requestId: number; result: QualityMeterResult }
  | { kind: 'error'; requestId: number; result: QualityMeterResult | null }

const scoreByKey: Ref<Record<string, TargetScoreState>> = ref({})
const resultByKey = computed(() => Object.fromEntries(Object.entries(scoreByKey.value).flatMap(([key, state]) =>
  state.kind !== 'debouncing' && state.result ? [[key, state.result]] : []
)))
const errorByKey = computed(() => Object.fromEntries(Object.entries(scoreByKey.value).flatMap(([key, state]) =>
  state.kind === 'error' || (state.kind === 'debouncing' && state.unavailable) ? [[key, text('unavailable')]] : []
)))

const targets = computed<NarrativeQualityTarget[]>(() => resolveNarrativeQualityTargets(context as Record<string, unknown>, locale.value))
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

/**
 * Applies only the latest mapped worker response, discarding stale or unknown request messages.
 */
const handleWorkerMessage = (message: WorkerMessage) => {
  const requestId = typeof message.requestId === 'number' ? message.requestId : 0
  if (message.kind === 'error' && requestId === 0) {
    for (const [key, state] of Object.entries(scoreByKey.value)) {
      if (state.kind === 'debouncing') {
        scoreByKey.value[key] = { ...state, unavailable: true }
        continue
      }
      scoreByKey.value[key] = {
        kind: 'error', requestId: state.requestId,
        result: state.result
      }
    }
    return
  }
  const entry = Object.entries(scoreByKey.value).find(([, state]) => state.requestId === requestId)
  if (!entry) return
  const [key, state] = entry
  if (state.kind === 'debouncing') return
  if (message.kind === 'error') {
    scoreByKey.value[key] = { kind: 'error', requestId, result: state.result }
  } else if (message.result) {
    scoreByKey.value[key] = {
      kind: message.kind === 'status' ? 'pending' : 'success',
      requestId, result: message.result
    }
  }
}

const clearPendingScoreTimers = () => {
  for (const state of Object.values(scoreByKey.value)) {
    if (state.kind === 'debouncing') clearTimeout(state.timer)
  }
}

const scheduleScoreRequest = (target: NarrativeQualityTarget & { settings: unknown }) => {
  const previous = scoreByKey.value[target.key]
  if (previous?.kind === 'debouncing') clearTimeout(previous.timer)
  const requestId = createSharedRequestId()
  const timer = setTimeout(() => {
    const current = scoreByKey.value[target.key]
    if (current?.kind !== 'debouncing' || current.requestId !== requestId) return
    scoreByKey.value[target.key] = { kind: 'pending', requestId, result: null }
    try {
      getSharedWorker().postMessage({
        type: 'score', requestId,
        payload: { groupKey: target.key, text: target.text, locale: target.locale, settings: target.settings }
      })
    } catch {
      scoreByKey.value[target.key] = { kind: 'error', requestId, result: null }
    }
  }, SCORE_REQUEST_DEBOUNCE_MS)
  scoreByKey.value[target.key] = { kind: 'debouncing', requestId, timer, unavailable: false }
}

const unsubscribeWorker = subscribeToSharedWorker(handleWorkerMessage)

watch(
  () => ({
    config,
    targets: enabledTargets.value.map(target => `${target.key}:${target.text}`).join('|'),
    locale: locale.value
  }),
  () => {
    clearPendingScoreTimers()
    scoreByKey.value = {}

    for (const target of enabledTargets.value) {
      scheduleScoreRequest(target)
    }
  },
  { immediate: true, deep: true, flush: 'sync' }
)

onBeforeUnmount(() => {
  clearPendingScoreTimers()
  scoreByKey.value = {}
  unsubscribeWorker()
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
      <ExtensionProgress data-field-container="Read-only progress display, not an input field."
        :aria-label="text('meterLabel', { target: target.label })"
        :model-value="resultByKey[target.key]?.overallPercent || 0"
        :color="toneClasses(resultByKey[target.key]?.tone)"
        :max="100"
        class="narrative-quality-meter"
        :ui="{
          base: 'h-2 rounded-full bg-zinc-200 dark:bg-zinc-800',
          indicator: 'rounded-full'
        }" />

      <div class="flex flex-wrap items-center gap-2">
        <ExtensionBadge
          v-if="errorByKey[target.key]"
          color="error"
          variant="solid">
          {{ text('unavailable') }}
        </ExtensionBadge>

        <ExtensionBadge
          v-else-if="localizedLabel(resultByKey[target.key]?.statusLabel)"
          :color="toneClasses(resultByKey[target.key]?.tone)"
          variant="solid">
          {{ localizedLabel(resultByKey[target.key]?.statusLabel) }}
        </ExtensionBadge>

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
