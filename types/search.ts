export const SEARCH_MESSAGE_STATUSES = ['completed', 'failed', 'safety_routed'] as const
export const SEARCH_SOURCE_TYPES = [
  'disease_database',
  'drug_approval',
  'clinical_trial',
  'news',
  'policy',
  'patient_support',
  'reference',
] as const
export const AUTHORITY_SOURCE_TYPES = [
  'disease_reference',
  'clinical_guideline',
  'treatment_update',
  'clinical_trial',
  'drug_approval',
  'policy_access',
  'patient_org',
  'research_publication',
] as const
export const SEARCH_QUERY_INTENTS = [
  'disease_overview',
  'clinical_guidance',
  'treatment_update',
  'clinical_trial',
  'drug_approval',
  'policy_access',
  'patient_support',
  'research_progress',
] as const

export type SearchMessageStatus = (typeof SEARCH_MESSAGE_STATUSES)[number]
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number]
export type AuthoritySourceType = (typeof AUTHORITY_SOURCE_TYPES)[number]
export type SearchQueryIntent = (typeof SEARCH_QUERY_INTENTS)[number]
export type SearchSourceTier = 'authority' | 'internet_supplement'
export type SearchTraceStatus = 'success' | 'empty' | 'error'
export type SourceExplainStatus = 'success' | 'unavailable'

export interface SearchSource {
  title: string
  sourceType: SearchSourceType
  sourceTier: SearchSourceTier
  sourceLabel: string
  sourceUrl: string
  sourceDomain: string
  snippet: string
  publishedAt: string | null
  rank: number
}

export interface SearchTraceEntry {
  key: string
  label: string
  status: SearchTraceStatus
  detail: string
}

export interface SearchResponse {
  query: string
  answer: string
  messageStatus: SearchMessageStatus
  sources: SearchSource[]
  searchTrace: SearchTraceEntry[]
}

export interface SourceExplainRequest {
  title: string
  sourceUrl: string
  sourceLabel: string
  sourceDomain: string
  snippet: string
}

export interface SourceExplainResponse {
  status: SourceExplainStatus
  summary: string
  matchedUrl?: string | null
}

export interface SearchCacheEntry {
  id: string
  queryHash: string
  queryText: string
  sourceUrl: string
  sourceDomain: string
  sourceType: SearchSourceType
  title: string
  snippet: string
  content: string
  publishedAt: string | null
  fetchedAt: string
  expiresAt: string
}

export interface SourceRegistryEntry {
  id: string
  name: string
  domain: string
  url: string
  sourceType: SearchSourceType
  sourceTypes: AuthoritySourceType[]
  region: string
  language: string
  priority: number
  enabled: boolean
  notes: string | null
  topics: string[]
  topicAliases: string[]
  authorityEligible: boolean
  pathMatch: 'exact' | 'prefix'
}

export interface SearchQueryAnalysis {
  subject: string
  aliases: string[]
  intent: SearchQueryIntent
  timeSensitivity: 'low' | 'medium' | 'high'
  preferredSourceTypes: AuthoritySourceType[]
  deprioritizedSourceTypes: AuthoritySourceType[]
  queryTerms: string[]
}
