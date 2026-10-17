import { defineGcsExtensionMessages } from '@gcs-ssc/extensions'
export const targetMessages = defineGcsExtensionMessages({
  "en": {
    "description_en": "English description",
    "description_fr": "French description",
    "agreement_top_level.label": "Agreement descriptions",
    "agreement_top_level.description": "Scores the English and French agreement description fields.",
    "assessment_review_alignment_narrative.label": "Alternative overall result justification",
    "assessment_review_alignment_narrative.description": "Configure a separate narrative prompt for each assessment schema on this stream.",
    "assessment_question_comment.label": "Assessment question comments",
    "assessment_question_comment.description": "Configure question-comment scoring per assessment schema and per question."
  },
  "fr": {
    "description_en": "Description anglaise",
    "description_fr": "Description française",
    "agreement_top_level.label": "Descriptions d’entente",
    "agreement_top_level.description": "Évalue les champs de description français et anglais de l’entente.",
    "assessment_review_alignment_narrative.label": "Justification de l’autre résultat global",
    "assessment_review_alignment_narrative.description": "Configurez une consigne de notation distincte pour chaque schéma d’évaluation du volet.",
    "assessment_question_comment.label": "Commentaires des questions d’évaluation",
    "assessment_question_comment.description": "Configurez la notation des commentaires de question par schéma d’évaluation et par question."
  }
})
