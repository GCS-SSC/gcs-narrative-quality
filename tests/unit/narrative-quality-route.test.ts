import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/mock-db'

const resolveExtensionStreamContextMock = vi.fn()
const streamScope = { type: 'entity' as const, agencyId: 'agency-1', path: [] }
type RouteHandler = (event: { context: { $db: unknown } }) => Promise<unknown>
type RouteResponse = {
  items?: unknown[]
}

vi.mock('@gcs-ssc/extensions/server', async importOriginal => ({
  ...await importOriginal<typeof import('@gcs-ssc/extensions/server')>(),
  resolveExtensionStreamContext: (...args: unknown[]) => resolveExtensionStreamContextMock(...args)
}))

describe('gcs narrative quality assessment targets route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resolveExtensionStreamContextMock.mockResolvedValue({
      agencyId: 'agency-1',
      profileId: 'tp-1',
      streamId: 'stream-1',
      scope: streamScope
    })
  })

  it('returns assessment schemas and question targets for the extension config modal', async () => {
    const authorizeMock = vi.fn(() => true)
    const assessmentSetsQuery = createQueryChain({
      executeResult: [
        { id: 'set-1' },
        { id: 'set-2' }
      ]
    })

    const reviewSchemasQuery = createQueryChain({
      executeResult: [
        {
          id: 'schema-1',
          egcs_cn_name_en: 'Program Fit',
          egcs_cn_name_fr: 'Concordance au programme',
          publicationVersion: 2,
          definition: {
            scoringMatrix: null,
            assessmentSchema: {
            sections: [{
              name: 'section-a',
              label: { en: 'Section A', fr: 'Section A' },
              number: '1',
              icon: 'i-lucide-circle',
              weight: 1,
              subSections: [{
                name: 'sub-a',
                label: { en: 'Sub A', fr: 'Sous A' },
                weight: { adjustable: false, weight: 1 },
                questions: [
                  {
                    type: 'question',
                    name: 'question-a',
                    question: {
                      en: 'Describe the evidence',
                      fr: 'Decrivez la preuve'
                    },
                    weight: { adjustable: false, weight: 1 },
                    commentThreshold: { min: 0, max: 5 },
                    options: [],
                    help: []
                  }
                ]
              }]
            }],
            sectionMatrix: [],
              outcomes: []
            }
          }
        },
        {
          id: 'schema-1',
          egcs_cn_name_en: 'Program Fit',
          egcs_cn_name_fr: 'Concordance au programme',
          publicationVersion: 2,
          definition: {
            scoringMatrix: null,
            assessmentSchema: {
            sections: [{
              name: 'section-a',
              label: { en: 'Section A', fr: 'Section A' },
              number: '1',
              icon: 'i-lucide-circle',
              weight: 1,
              subSections: [{
                name: 'sub-a',
                label: { en: 'Sub A', fr: 'Sous A' },
                weight: { adjustable: false, weight: 1 },
                questions: [{
                  type: 'question',
                  name: 'question-a',
                  question: {
                    en: 'Describe the evidence',
                    fr: 'Decrivez la preuve'
                  },
                  weight: { adjustable: false, weight: 1 },
                  commentThreshold: { min: 0, max: 5 },
                  options: [],
                  help: []
                }]
              }]
            }],
            sectionMatrix: [],
              outcomes: []
            }
          }
        },
        {
          id: 'schema-malformed',
          egcs_cn_name_en: 'Malformed schema',
          egcs_cn_name_fr: 'Schéma malformé',
          publicationVersion: 1,
          definition: { assessmentSchema: ['invalid'] }
        }
      ]
    })

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'Common_Review_Set_Setup') {
          return assessmentSetsQuery
        }

        if (table === 'Common_Review_Setup') {
          return reviewSchemasQuery
        }

        return createQueryChain()
      })
    }

    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: db,
        params: {
          streamId: 'stream-1'
        },
        $authContext: {
          userId: 'user-1',
          userAbilities: {
            authorize: authorizeMock
          }
        }
      }
    }) as RouteResponse

    expect(result.items).toEqual([{
      schemaId: 'schema-1',
      version: 2,
      name: {
        en: 'Program Fit',
        fr: 'Concordance au programme'
      },
      questions: [{
        key: 'section-a::sub-a::question-a',
        sectionName: 'section-a',
        subSectionName: 'sub-a',
        questionName: 'question-a',
        label: {
          en: 'Describe the evidence',
          fr: 'Decrivez la preuve'
        }
      }]
    }, {
      schemaId: 'schema-malformed',
      version: 1,
      name: { en: 'Malformed schema', fr: 'Schéma malformé' },
      questions: []
    }])
    expect(authorizeMock).toHaveBeenCalledWith('transfer_payment', 'read', streamScope)
  })

  it('returns badRequest when the stream id is missing', async () => {
    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: {},
        params: {}
      },
      node: {
        res: {}
      }
    }) as {
      statusCode: 400,
      data: {
        code: 'MISSING_ID'
      }
    }

    expect(result.statusCode).toBe(400)
    expect(result.data.code).toBe('MISSING_ID')
  })

  it('returns notFound when the stream context is missing', async () => {
    const authorizeMock = vi.fn(() => true)
    resolveExtensionStreamContextMock.mockResolvedValueOnce(null)

    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: {},
        params: {
          streamId: 'stream-1'
        },
        $authContext: {
          userId: 'user-1',
          userAbilities: {
            authorize: authorizeMock
          }
        }
      },
      node: {
        res: {}
      }
    }) as {
      statusCode: 404
      data: {
        code: string
      }
    }

    expect(result.statusCode).toBe(404)
    expect(result.data.code).toBe('TRANSFER_PAYMENT_STREAM_NOT_FOUND')
    expect(authorizeMock).not.toHaveBeenCalled()
  })

  it('returns assessment schemas without requiring extension enablement rows', async () => {
    const authorizeMock = vi.fn(() => true)
    const assessmentSetsQuery = createQueryChain({
      executeResult: []
    })

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'Common_Review_Set_Setup') {
          return assessmentSetsQuery
        }

        return createQueryChain()
      })
    }

    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: db,
        params: {
          streamId: 'stream-1'
        },
        $authContext: {
          userId: 'user-1',
          userAbilities: {
            authorize: authorizeMock
          }
        }
      }
    }) as RouteResponse

    expect(result.items).toEqual([])
    expect(authorizeMock).toHaveBeenCalledWith('transfer_payment', 'read', streamScope)
  })

  it('returns unauthorized when the authenticated dispatcher context is missing', async () => {
    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: {},
        params: {
          streamId: 'stream-1'
        }
      },
      node: {
        res: {}
      }
    }) as {
      statusCode: 401
      data: {
        code: string
      }
    }

    expect(result.statusCode).toBe(401)
    expect(result.data.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('returns forbidden when the authenticated user cannot read the stream', async () => {
    const authorizeMock = vi.fn(() => false)
    const handler = (await import('../../server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get')).default as RouteHandler
    const result = await handler({
      context: {
        $db: {},
        params: {
          streamId: 'stream-1'
        },
        $authContext: {
          userId: 'user-1',
          userAbilities: {
            authorize: authorizeMock
          }
        }
      },
      node: {
        res: {}
      }
    }) as {
      statusCode: 403
      data: {
        code: string
      }
    }

    expect(result.statusCode).toBe(403)
    expect(result.data.code).toBe('AUTH_FORBIDDEN')
    expect(authorizeMock).toHaveBeenCalledWith('transfer_payment', 'read', streamScope)
  })
})
