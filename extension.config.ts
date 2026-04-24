import { defineGcsExtension } from '@gcs-ssc/extensions'

export default defineGcsExtension({
  key: 'gcs-narrative-quality',
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
      path: './server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get.ts'
    }
  ]
})
