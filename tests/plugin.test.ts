import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'

type PluginManifest = {
  config_ui_entry?: string
  runtime_ui_entry?: string
  client_worker_entry?: string
  dependency_asset_roots?: Array<{
    public_prefix?: string
    package?: string
    package_path?: string
  }>
}

describe('gcs narrative quality plugin manifest', () => {
  it('declares package-backed model assets in the plugin manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')) as PluginManifest

    expect(existsSync(new URL(`../${manifest.config_ui_entry}`, import.meta.url))).toBe(true)
    expect(existsSync(new URL(`../${manifest.runtime_ui_entry}`, import.meta.url))).toBe(true)
    expect(existsSync(new URL(`../${manifest.client_worker_entry}`, import.meta.url))).toBe(true)
    expect(manifest.dependency_asset_roots).toEqual([
      {
        public_prefix: 'models/',
        package: '@browser-quality-scorer/core',
        package_path: 'models/'
      }
    ])
  })

  it('pins a scorer package install that includes the model files', () => {
    expect(
      existsSync(new URL('../node_modules/@browser-quality-scorer/core/models/Xenova/nli-deberta-v3-xsmall/config.json', import.meta.url))
    ).toBe(true)
    expect(
      existsSync(
        new URL('../node_modules/@browser-quality-scorer/core/models/Xenova/nli-deberta-v3-xsmall/onnx/model_quantized.onnx', import.meta.url)
      )
    ).toBe(true)
  })

  it('keeps worker model fetches on the host plugin asset endpoint', () => {
    const workerSource = readFileSync(new URL('../client/worker-source.js', import.meta.url), 'utf8')

    expect(workerSource).toContain("/api/plugn/assets/quality-meter/models/")
    expect(workerSource).toContain("mode: 'url'")
  })
})
