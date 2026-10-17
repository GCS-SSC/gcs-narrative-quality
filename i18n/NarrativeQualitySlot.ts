import { defineGcsExtensionMessages } from '@gcs-ssc/extensions'

export const NarrativeQualitySlotMessages = defineGcsExtensionMessages({
  "en": {
    "meterLabel": "Narrative quality: {target}",
    "loading": "Preparing quality meter",
    "unavailable": "Quality meter unavailable",
    "scoring": "Scoring"
  },
  "fr": {
    "meterLabel": "Qualité du texte : {target}",
    "loading": "Préparation de l’indicateur de qualité",
    "unavailable": "Indicateur de qualité indisponible",
    "scoring": "Évaluation"
  }
})
