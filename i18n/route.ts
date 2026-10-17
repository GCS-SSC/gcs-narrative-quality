import { defineGcsExtensionMessages } from '@gcs-ssc/extensions'

export const routeMessages = defineGcsExtensionMessages({
  en: { missingId: 'Missing stream id.', notFound: 'Transfer payment stream not found.', unauthorized: 'Unauthorized.', forbidden: 'Forbidden.' },
  fr: { missingId: 'Identifiant du volet manquant.', notFound: 'Volet de paiement de transfert introuvable.', unauthorized: 'Non autorisé.', forbidden: 'Accès interdit.' }
})
