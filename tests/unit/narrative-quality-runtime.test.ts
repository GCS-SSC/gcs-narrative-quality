import { afterEach, describe, expect, it, vi } from 'vitest'

const importRuntime = async () =>
  await import('../../client/runtime.js')

describe('narrative quality runtime asset URLs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('resolves plugin assets against the current origin when no injected host origin is present', async () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost:3018'
    })

    const { resolveQualityMeterAssetUrl } = await importRuntime()

    expect(resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/models/'))
      .toBe('http://localhost:3018/extensions/gcs-narrative-quality/models/')
  })

  it('prefers the injected plugin host origin when provided', async () => {
    vi.stubGlobal('__GCS_PLUGIN_HOST_ORIGIN__', 'https://assets.example.test')
    vi.stubGlobal('location', {
      origin: 'http://localhost:3018'
    })

    const { resolveQualityMeterAssetUrl } = await importRuntime()

    expect(resolveQualityMeterAssetUrl('/extensions/gcs-narrative-quality/client/'))
      .toBe('https://assets.example.test/extensions/gcs-narrative-quality/client/')
  })
})
