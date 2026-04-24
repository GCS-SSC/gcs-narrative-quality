import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/mock-db'

const resolveExtensionStreamContextMock = vi.fn()
const authorizeWithTeamMock = vi.fn()
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
    authorizeWithTeamMock.mockResolvedValue(true)

    resolveExtensionStreamContextMock.mockResolvedValue({
      agencyId: 'agency-1',
      profileId: 'tp-1',
      streamId: 'stream-1',
      scope: { type: 'entity', agencyId: 'agency-1', path: [] }
    })
  })

  it('returns assessment schemas and question targets for the extension config modal', async () => {
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
          egcs_cn_version: 2,
          egcs_cn_scoringmatrix: null,
          egcs_cn_assessmentschema: {
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
          },
          egcs_cn_publishedscoringmatrix: null,
          egcs_cn_publishedassessmentschema: null
        },
        {
          id: 'schema-1',
          egcs_cn_name_en: 'Program Fit',
          egcs_cn_name_fr: 'Concordance au programme',
          egcs_cn_version: 2,
          egcs_cn_scoringmatrix: null,
          egcs_cn_assessmentschema: {
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
          },
          egcs_cn_publishedscoringmatrix: null,
          egcs_cn_publishedassessmentschema: null
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
            authorize: vi.fn(() => true),
            authorizeWithTeam: authorizeWithTeamMock
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
    }])
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
            authorize: vi.fn(() => true),
            authorizeWithTeam: authorizeWithTeamMock
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
  })

  it('returns assessment schemas without requiring extension enablement rows', async () => {
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
            authorize: vi.fn(() => true),
            authorizeWithTeam: authorizeWithTeamMock
          }
        }
      }
    }) as RouteResponse

    expect(result.items).toEqual([])
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
    authorizeWithTeamMock.mockResolvedValueOnce(false)

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
            authorize: vi.fn(() => false),
            authorizeWithTeam: authorizeWithTeamMock
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
  })
})
