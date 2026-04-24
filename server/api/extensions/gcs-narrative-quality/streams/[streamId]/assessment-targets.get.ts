/* eslint-disable jsdoc/require-jsdoc */
import {
  AssessmentDefinitionSchema,
  getReviewSchemaEffectiveContent,
  resolveExtensionStreamContext
} from '@gcs-ssc/extensions/server'
import type {
  ExtensionStreamContextQueryBuilder,
  ReviewSchemaContentSource
} from '@gcs-ssc/extensions/server'

interface AssessmentSetRow {
  id: unknown
}

interface AssessmentSchemaRow extends ReviewSchemaContentSource {
  id: unknown
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_version: unknown
}

interface AssessmentQueryBuilder {
  innerJoin: (...args: unknown[]) => AssessmentQueryBuilder
  select: (...args: unknown[]) => AssessmentQueryBuilder
  where: (...args: unknown[]) => AssessmentQueryBuilder
  orderBy: (...args: unknown[]) => AssessmentQueryBuilder
  execute: () => Promise<unknown[]>
}

interface AssessmentTargetRouteDatabase {
  selectFrom(table: 'Transfer_Payment_Stream'): ExtensionStreamContextQueryBuilder
  selectFrom(table: 'Common_Review_Set_Setup' | 'Common_Review_Setup'): AssessmentQueryBuilder
}

const buildQuestionKey = (sectionName: string, subSectionName: string, questionName: string) =>
  `${sectionName}::${subSectionName}::${questionName}`

const createExtensionRouteErrorResponse = (
  event: Parameters<EventHandler>[0],
  statusCode: number,
  code: string,
  message: string
): {
  statusCode: number
  message: string
  data: {
    message: string
    code: string
  }
} => {
  if (event.node?.res) {
    event.node.res.statusCode = statusCode
    event.node.res.statusMessage = message
  }

  return {
    statusCode,
    message,
    data: {
      message,
      code
    }
  }
}

export default async (event: Parameters<EventHandler>[0]) => {
  const db = event.context.$db as AssessmentTargetRouteDatabase
  const streamId = typeof event.context.params?.streamId === 'string'
    ? event.context.params.streamId
    : undefined

  if (!streamId) {
    return createExtensionRouteErrorResponse(event, 400, 'MISSING_ID', 'Missing stream id.')
  }

  const streamContext = await resolveExtensionStreamContext(db, streamId)
  if (!streamContext) {
    return createExtensionRouteErrorResponse(event, 404, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'Transfer payment stream not found.')
  }

  const authContext = event.context.$authContext
  if (!authContext) {
    return createExtensionRouteErrorResponse(event, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized.')
  }

  const canAccessWithTeam = await authContext.userAbilities.authorizeWithTeam(
    'transfer_payment',
    'read',
    streamContext.scope,
    authContext.userId,
    true,
    db
  )

  const canAccessScope = authContext.userAbilities.authorize('transfer_payment', 'read', streamContext.scope)
  if (!canAccessWithTeam && !canAccessScope) {
    return createExtensionRouteErrorResponse(event, 403, 'AUTH_FORBIDDEN', 'Forbidden.')
  }

  const assessmentSets = await db
    .selectFrom('Common_Review_Set_Setup')
    .select('Common_Review_Set_Setup.id as id')
    .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .execute() as AssessmentSetRow[]

  const assessmentSetIds = assessmentSets.map(item => String(item.id))
  if (assessmentSetIds.length === 0) {
    return {
      items: []
    }
  }

  const rows = await db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .select([
      'Common_Review_Schema.id as id',
      'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
      'Common_Review_Schema.egcs_cn_version as egcs_cn_version',
      'Common_Review_Schema.egcs_cn_scoringmatrix as egcs_cn_scoringmatrix',
      'Common_Review_Schema.egcs_cn_assessmentschema as egcs_cn_assessmentschema',
      'Common_Review_Schema.egcs_cn_publishedscoringmatrix as egcs_cn_publishedscoringmatrix',
      'Common_Review_Schema.egcs_cn_publishedassessmentschema as egcs_cn_publishedassessmentschema'
    ])
    .where('Common_Review_Setup.egcs_cn_reviewset', 'in', assessmentSetIds)
    .where('Common_Review_Setup._deleted', '=', false)
    .where('Common_Review_Schema._deleted', '=', false)
    .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'assessment')
    .orderBy('Common_Review_Schema.egcs_cn_name_en', 'asc')
    .orderBy('Common_Review_Schema.id', 'asc')
    .execute() as AssessmentSchemaRow[]

  const items = Array.from(new Map(rows.map(row => [String(row.id), row])).values()).map(row => {
    const effectiveContent = getReviewSchemaEffectiveContent(row)
    const parsed = AssessmentDefinitionSchema.safeParse(effectiveContent.assessmentSchema ?? {})
    const questions = parsed.success
      ? parsed.data.sections.flatMap(section => section.subSections.flatMap(subSection => subSection.questions.flatMap(question => {
          if (question.type !== 'question') {
            return []
          }

          return [{
            key: buildQuestionKey(section.name, subSection.name, question.name),
            sectionName: section.name,
            subSectionName: subSection.name,
            questionName: question.name,
            label: question.question
          }]
        })))
      : []

    return {
      schemaId: String(row.id),
      version: Number(row.egcs_cn_version),
      name: {
        en: row.egcs_cn_name_en,
        fr: row.egcs_cn_name_fr
      },
      questions
    }
  })

  return {
    items
  }
}
