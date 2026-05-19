import { defineGcsExtension } from '@gcs-ssc/extensions'

export default defineGcsExtension({
  key: 'gcs-narrative-quality',
  sdkVersion: '^0.1.0',
  requiredHostCapabilities: [
    'stream-config-modal',
    'textarea-slots',
    'server-handlers',
    'server-handler-rbac',
    'public-assets',
    'extension-ui',
    'extension-api-client'
  ],
  name: {
    en: 'Narrative Quality',
    fr: 'Qualité narrative'
  },
  description: {
    en: 'Scores narrative field quality and renders a lightweight meter.',
    fr: 'Évalue la qualité des champs narratifs et affiche un indicateur léger.'
  },
  admin: {
    streamConfig: {
      path: './components/NarrativeQualityConfig.vue'
    }
  },
  client: {
    slots: [
      {
        slot: 'textarea.after',
        path: './components/NarrativeQualitySlot.vue'
      }
    ]
  },
  assets: [
    {
      path: './client',
      baseURL: '/extensions/gcs-narrative-quality/client'
    },
    {
      package: '@browser-quality-scorer/core',
      packagePath: 'models',
      baseURL: '/extensions/gcs-narrative-quality/models'
    }
  ],
  serverHandlers: [
    {
      route: '/streams/[streamId]/assessment-targets',
      method: 'get',
      rbac: {
        subject: 'transfer_payment',
        action: 'read',
        stream: { param: 'streamId' }
      },
      path: './server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get.ts'
    }
  ]
})
