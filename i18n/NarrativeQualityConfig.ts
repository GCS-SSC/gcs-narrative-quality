import { defineGcsExtensionMessages } from '@gcs-ssc/extensions'

export const NarrativeQualityConfigMessages = defineGcsExtensionMessages({
  "en": {
    "title": "Narrative scoring setup",
    "description": "Configure the same scoring model used by the original plugin-platform flow, scoped to the exact narrative target on this stream.",
    "targetSection": "Scored Narrative Field",
    "targetDescription": "Choose which narrative field this configuration applies to before editing the scoring prompt and criteria.",
    "target": "Target",
    "assessment": "Assessment",
    "assessmentDescription": "Select which assessment schema this narrative prompt applies to.",
    "questionSelection": "Question",
    "questionDescription": "Select the exact assessment question comment that should be scored.",
    "noAssessments": "No assessment schemas are configured for this stream yet.",
    "noQuestions": "This assessment schema has no scoreable questions.",
    "loadingAssessments": "Loading assessment schemas...",
    "loadingError": "Assessment schemas could not be loaded right now.",
    "enabled": "Enable scoring for this target",
    "enabledDescription": "Only explicitly enabled targets render the scorer at runtime."
  },
  "fr": {
    "title": "Configuration de la notation narrative",
    "description": "Configurez le même modèle de notation que dans le flux original de la plateforme de plugins, appliqué à la cible narrative exacte de ce volet.",
    "targetSection": "Champ narratif évalué",
    "targetDescription": "Choisissez le champ narratif auquel cette configuration s’applique avant de modifier la question et les critères de notation.",
    "target": "Cible",
    "assessment": "Évaluation",
    "assessmentDescription": "Sélectionnez le schéma d’évaluation auquel cette question narrative s’applique.",
    "questionSelection": "Question",
    "questionDescription": "Sélectionnez le commentaire de question d’évaluation précis qui doit être noté.",
    "noAssessments": "Aucun schéma d’évaluation n’est encore configuré pour ce volet.",
    "noQuestions": "Ce schéma d’évaluation ne contient aucune question à noter.",
    "loadingAssessments": "Chargement des schémas d’évaluation...",
    "loadingError": "Les schémas d’évaluation ne peuvent pas être chargés pour le moment.",
    "enabled": "Activer la notation pour cette cible",
    "enabledDescription": "Seules les cibles explicitement activées affichent le scoreur à l’exécution."
  }
})
