import {
  AUTHORITY_SOURCE_TYPES,
  type SearchCacheEntry,
  type SearchQueryAnalysis,
  type SourceRegistryEntry,
} from '~/types/search'
import type { Database } from '~/types/database.types'
import type { RetrievedEvidenceItem } from './retrieval'
import { generateKnowledgeEmbedding } from './embeddings'

type DbClient = {
  from: (table: string) => unknown
  rpc?: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  storage?: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data?: { publicUrl?: string | null } | null }
    }
  }
}

export interface SearchRepositories {
  searchNotes(query: string): Promise<
    Array<{
      title: string
      content: string
      source: string
      publishedAt: string
    }>
  >
  searchCache(query: string): Promise<SearchCacheEntry[]>
  searchKnowledgeBase(
    query: string,
    analysis?: SearchQueryAnalysis
  ): Promise<RetrievedEvidenceItem[]>
  listRegisteredSources(): Promise<SourceRegistryEntry[]>
}

export function createSearchRepositories(supabase: DbClient): SearchRepositories {
  return {
    async searchNotes(query) {
      const { data, error } = await (
        supabase.from('notes') as {
          select: (value: string) => {
            or: (value: string) => {
              order: (
                column: string,
                options: { ascending: boolean }
              ) => {
                limit: (
                  count: number
                ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
              }
            }
          }
        }
      )
        .select('title, content, source, published_at')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .order('published_at', { ascending: false })
        .limit(5)

      if (error) {
        if (isMissingRelationError(error)) {
          return []
        }
        throw error
      }

      return ((data || []) as Array<Database['public']['Tables']['notes']['Row']>).map(row => ({
        title: row.title,
        content: row.content,
        source: row.source,
        publishedAt: row.published_at,
      }))
    },

    async searchCache(query) {
      const { data, error } = await (
        supabase.from('search_cache') as {
          select: (value: string) => {
            ilike: (
              column: string,
              value: string
            ) => {
              order: (
                column: string,
                options: { ascending: boolean }
              ) => {
                limit: (
                  count: number
                ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
              }
            }
          }
        }
      )
        .select('*')
        .ilike('query_text', `%${query}%`)
        .order('fetched_at', { ascending: false })
        .limit(5)

      if (error) {
        if (isMissingRelationError(error)) {
          return []
        }
        throw error
      }

      return ((data || []) as Array<Record<string, unknown>>).map(row => ({
        id: asString(row.id),
        queryHash: asString(row.query_hash),
        queryText: asString(row.query_text),
        sourceUrl: asString(row.source_url),
        sourceDomain: asString(row.source_domain),
        sourceType: asSearchSourceType(row.source_type),
        title: asString(row.title),
        snippet: asString(row.snippet),
        content: asString(row.content),
        publishedAt: asNullableString(row.published_at),
        fetchedAt: asString(row.fetched_at),
        expiresAt: asString(row.expires_at),
      }))
    },

    async searchKnowledgeBase(query, analysis) {
      if (!query.trim() || !supabase.rpc) return []
      const queryEmbedding = await generateKnowledgeEmbedding(query).catch(() => null)

      const { data, error } = await supabase.rpc('match_knowledge_chunks', {
        match_query: query,
        query_embedding: queryEmbedding,
        query_intent: analysis?.intent || null,
        query_terms: buildKnowledgeQueryTerms(query, analysis),
        match_count: 8,
      })

      if (error) {
        if (isMissingRelationError(error)) {
          return []
        }
        throw error
      }

      const seenDocuments = new Set<string>()
      return ((data || []) as Array<Record<string, unknown>>)
        .flatMap(row => {
          const documentKey = asString(row.document_id) || asString(row.document_title)
          if (documentKey && seenDocuments.has(documentKey)) return []
          if (documentKey) seenDocuments.add(documentKey)

          const storagePath = asString(row.storage_path)
          const sourceUrl =
            asNullableString(row.source_url) ||
            buildStoragePublicUrl(supabase, storagePath) ||
            storagePath
          const category = asString(row.category)
          const priorityLabel = asString(row.priority_label) || '未分级'
          const title = buildKnowledgeEvidenceTitle(row)

          return [
            {
              sourceType: 'reference' as const,
              sourceTier: 'authority' as const,
              sourceLabel: `站内内容 · ${category || '未分类'} · ${priorityLabel}`,
              sourceUrl,
              sourceDomain: extractDomain(sourceUrl),
              snippet: asString(row.snippet) || asString(row.content).slice(0, 240),
              publishedAt: null,
              title,
              content: asString(row.content),
            },
          ]
        })
        .slice(0, 2)
    },

    async listRegisteredSources() {
      const { data, error } = await (
        supabase.from('source_registry') as {
          select: (value: string) => {
            order: (
              column: string,
              options: { ascending: boolean }
            ) => Promise<{
              data: unknown
              error: { code?: string; message?: string } | null
            }>
          }
        }
      )
        .select('*')
        .order('priority', { ascending: true })

      if (error) {
        if (isMissingRelationError(error)) {
          return []
        }
        throw error
      }

      return ((data || []) as Array<Record<string, unknown>>).map(row => ({
        id: asString(row.id),
        name: asString(row.name),
        domain: asString(row.domain),
        url: asString(row.url) || `https://${asString(row.domain)}`,
        sourceType: asSearchSourceType(row.source_type),
        sourceTypes: asAuthoritySourceTypes(row.source_types, row.source_type),
        region: asString(row.region),
        language: asString(row.language),
        priority: typeof row.priority === 'number' ? row.priority : Number(row.priority || 0),
        enabled: Boolean(row.enabled),
        notes: asNullableString(row.notes),
        topics: asStringList(row.topics),
        topicAliases: asStringList(row.topic_aliases),
        authorityEligible: row.authority_eligible === true,
        pathMatch: row.path_match === 'exact' ? 'exact' : 'prefix',
      }))
    },
  }
}

export function isMissingRelationError(error: { code?: string; message?: string }) {
  return (
    error.code === '42P01' ||
    /does not exist/i.test(error.message || '') ||
    /schema cache/i.test(error.message || '')
  )
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function asNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function buildKnowledgeEvidenceTitle(row: Record<string, unknown>) {
  const documentTitle = asString(row.document_title) || asString(row.title) || '小飞侠知识库资料'
  const pageNumber = asNullableNumber(row.page_number)
  if (pageNumber) return `${documentTitle} - 第 ${pageNumber} 页`

  const sectionIndex = asNullableNumber(row.section_index)
  if (sectionIndex) return `${documentTitle} - 第 ${sectionIndex} 段`

  return documentTitle
}

function buildStoragePublicUrl(supabase: DbClient, storagePath: string) {
  if (!storagePath || !supabase.storage) return ''

  const bucket = process.env.KNOWLEDGE_STORAGE_BUCKET || 'knowledge-files'
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data?.publicUrl || ''
}

function extractDomain(value: string) {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function buildKnowledgeQueryTerms(query: string, analysis?: SearchQueryAnalysis) {
  const terms = [
    query,
    ...(analysis?.queryTerms || []),
    analysis?.subject || '',
    ...(analysis?.aliases || []),
  ]

  return Array.from(
    new Set(
      terms
        .flatMap(term => splitKnowledgeTerm(term))
        .map(term => term.trim())
        .filter(term => term.length >= 2)
    )
  ).slice(0, 16)
}

function splitKnowledgeTerm(term: string) {
  const normalized = term
    .replace(/[，。！？、；：,.!?;:()[\]{}"'“”‘’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return [...normalized, ...extractKnownChineseTerms(term)]
}

function extractKnownChineseTerms(term: string) {
  const knownTerms = [
    '麻醉',
    '手术',
    '治疗',
    '进展',
    '最新',
    '临床',
    '试验',
    '基因',
    '康复',
    '医师',
    '网络',
    '生育',
    '怀孕',
    '遗传',
    '心理',
    '支持',
    '求职',
  ]

  return knownTerms.filter(knownTerm => term.includes(knownTerm))
}

function asSearchSourceType(value: unknown): SearchCacheEntry['sourceType'] {
  return typeof value === 'string' ? (value as SearchCacheEntry['sourceType']) : 'reference'
}

function asAuthoritySourceTypes(
  sourceTypes: unknown,
  sourceType: unknown
): SourceRegistryEntry['sourceTypes'] {
  if (Array.isArray(sourceTypes)) {
    const parsed = sourceTypes.filter(
      (item): item is SourceRegistryEntry['sourceTypes'][number] =>
        typeof item === 'string' && (AUTHORITY_SOURCE_TYPES as readonly string[]).includes(item)
    )
    if (parsed.length > 0) return parsed
  }

  const normalized = typeof sourceType === 'string' ? sourceType : 'reference'
  switch (normalized) {
    case 'clinical_trial':
      return ['clinical_trial']
    case 'drug_approval':
      return ['drug_approval']
    case 'policy':
      return ['policy_access']
    case 'patient_support':
      return ['patient_org']
    case 'news':
      return ['treatment_update']
    case 'reference':
    case 'disease_database':
    default:
      return ['disease_reference']
  }
}
