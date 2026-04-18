import { describe, expect, it } from 'bun:test'
import worker from '../server/worker.js'
import throwingWorker from '../server/throwing-worker.js'
import resultTooLargeWorker from '../server/result-too-large-worker.js'

describe('quality meter server-side test handlers', () => {
  it('echoes the input payload for worker-bridge integration checks', async () => {
    await expect(worker({
      text: 'Narrative body',
      nested: { score: 10 }
    })).resolves.toEqual({
      ok: true,
      received: {
        text: 'Narrative body',
        nested: { score: 10 }
      }
    })
  })

  it('throws the expected normalization error shape trigger', async () => {
    await expect(throwingWorker()).rejects.toThrow('BOOM')
  })

  it('returns a non-serializable result for host serialization error coverage', async () => {
    const result = await resultTooLargeWorker()
    expect(result).toBeObject()
    expect(result).toHaveProperty('self')
    expect(result.self).toBe(result)
  })
})
