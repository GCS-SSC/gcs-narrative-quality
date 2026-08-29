import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export const NARRATIVE_QUALITY_COVERAGE_INCLUDE = [
  'client/core.ts',
  'client/runtime.js',
  'client/worker-request-queue.js',
  'client/worker-source.js',
  'components/**/*.{ts,vue}',
  'extension.config.ts',
  'server/**/*.ts'
]

export const NARRATIVE_QUALITY_COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80
} as const

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'coverage/unit',
      include: NARRATIVE_QUALITY_COVERAGE_INCLUDE,
      thresholds: NARRATIVE_QUALITY_COVERAGE_THRESHOLDS
    }
  }
})
