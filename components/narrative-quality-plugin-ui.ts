export type NarrativeQualityPluginLabel = {
  en: string
  fr: string
}

export type NarrativeQualityPluginUiNode = {
  type:
    | 'stack'
    | 'group'
    | 'section'
    | 'accordion'
    | 'collection'
    | 'text'
    | 'notice'
    | 'input'
    | 'textarea'
    | 'number'
    | 'select'
    | 'switch'
  key?: string
  badge?: string | number
  label?: NarrativeQualityPluginLabel
  description?: NarrativeQualityPluginLabel
  value?: NarrativeQualityPluginLabel
  rows?: number
  add_label?: NarrativeQualityPluginLabel
  empty_label?: NarrativeQualityPluginLabel
  presentation?: 'accordion'
  default_open?: boolean
  item_title_key?: string
  item_title_label?: NarrativeQualityPluginLabel
  default_value?: string | number | boolean | null
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: string, label: NarrativeQualityPluginLabel }>
  item_schema?: NarrativeQualityPluginUiNode
  children?: NarrativeQualityPluginUiNode[]
}
