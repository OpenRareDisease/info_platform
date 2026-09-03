import type {
  SearchMessageStatus,
  SearchQueryAnalysis,
  SearchResponse,
  SearchSource,
  SearchTraceEntry,
} from '~/types/search'
import { normalizeSearchQuery } from './query-normalization'
import { searchInternetSupplementSources, searchWhitelistedSources } from './live-search'
import { detectSpecialistTopic, findTrustedAuthoritySource } from './authority-policy'
import type { SearchRepositories } from './repositories'
import type { SourceRegistryEntry } from '~/types/search'
import type { RetrievedEvidenceItem } from './retrieval'

interface SearchFlowDeps {
  query: string
  repositories: Pick<SearchRepositories, 'searchNotes' | 'searchCache' | 'searchKnowledgeBase'>
  registry: SourceRegistryEntry[]
  analyzeQuery: (query: string) => Promise<SearchQueryAnalysis>
  detectSafetyRisk: (query: string) => Promise<{ risky: boolean; response?: string }>
  generateAnswer: (input: { query: string; evidence: RetrievedEvidenceItem[] }) => Promise<{
    content: string
    messageStatus: SearchMessageStatus
  }>
  onTrace?: (trace: SearchTraceEntry[]) => Promise<void> | void
  onSources?: (sources: SearchSource[]) => Promise<void> | void
}

export async function runSearchFlow({
  query,
  repositories,
  registry,
  analyzeQuery,
  detectSafetyRisk,
  generateAnswer,
  onTrace,
  onSources,
}: SearchFlowDeps): Promise<SearchResponse> {
  const safety = await detectSafetyRisk(query)
  if (safety.risky) {
    return {
      query,
      answer: safety.response || '请立刻寻求线下帮助。',
      messageStatus: 'safety_routed',
      sources: [],
      searchTrace: [],
    }
  }

  const normalized = normalizeSearchQuery(query)
  const analysis = await analyzeQuery(query)
  const searchTrace: SearchTraceEntry[] = []
  const knowledgeQuery = normalized.effectiveQuery || query
  const internalKnowledgeEnabled = process.env.ENABLE_INTERNAL_KNOWLEDGE_BASE === 'true'
  const [notesResult, cacheResult, knowledgeResult] = await Promise.allSettled([
    repositories.searchNotes(normalized.localQuery),
    repositories.searchCache(normalized.localQuery),
    internalKnowledgeEnabled
      ? repositories.searchKnowledgeBase(knowledgeQuery, analysis)
      : Promise.resolve([]),
  ])

  const notes = notesResult.status === 'fulfilled' ? notesResult.value : []
  const cache = cacheResult.status === 'fulfilled' ? cacheResult.value : []
  const knowledge = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : []
  const specialistQuery = detectSpecialistTopic(query) !== null
  const localEvidence: RetrievedEvidenceItem[] = [
    ...knowledge,
    ...cache.map(entry => {
      const trustedSource = specialistQuery
        ? findTrustedAuthoritySource({
            rawQuery: query,
            result: {
              url: entry.sourceUrl,
              title: entry.title,
              summary: [entry.snippet, entry.content].filter(Boolean).join('\n'),
            },
            sources: registry,
            requiredSourceTypes: analysis.preferredSourceTypes,
          })
        : null

      return {
        sourceType: trustedSource?.sourceType || entry.sourceType,
        sourceTier: specialistQuery
          ? trustedSource
            ? ('authority' as const)
            : ('internet_supplement' as const)
          : ('authority' as const),
        sourceLabel: trustedSource?.name || entry.sourceDomain,
        sourceUrl: entry.sourceUrl,
        sourceDomain: trustedSource ? getTrustedSourceDomain(trustedSource) : entry.sourceDomain,
        snippet: entry.snippet,
        publishedAt: entry.publishedAt,
        title: entry.title,
        content: entry.content,
      }
    }),
    ...notes.map(note => {
      const noteSource = normalizeSource(note.source)
      const trustedSource = specialistQuery
        ? findTrustedAuthoritySource({
            rawQuery: query,
            result: {
              url: noteSource,
              title: note.title,
              summary: note.content,
            },
            sources: registry,
            requiredSourceTypes: analysis.preferredSourceTypes,
          })
        : null

      return {
        sourceType: trustedSource?.sourceType || ('reference' as const),
        sourceTier: specialistQuery
          ? trustedSource
            ? ('authority' as const)
            : ('internet_supplement' as const)
          : ('authority' as const),
        sourceLabel: trustedSource?.name || noteSource,
        sourceUrl: noteSource,
        sourceDomain: trustedSource
          ? getTrustedSourceDomain(trustedSource)
          : extractDomain(noteSource),
        snippet: note.content.slice(0, 240),
        publishedAt: note.publishedAt,
        title: note.title,
        content: note.content,
      }
    }),
  ]

  if (internalKnowledgeEnabled) {
    searchTrace.push(
      buildLocalTrace(
        notesResult,
        cacheResult,
        knowledgeResult,
        notes.length,
        cache.length,
        knowledge.length
      )
    )
  }
  await onTrace?.([...searchTrace])

  let authorityEvidence: RetrievedEvidenceItem[] = []
  let supplementEvidence: RetrievedEvidenceItem[] = []

  try {
    authorityEvidence = await searchWhitelistedSources(
      normalized.effectiveQuery || query,
      registry,
      analysis
    )
    searchTrace.push({
      key: 'authority-search',
      label: '权威来源搜索',
      status: authorityEvidence.length > 0 ? 'success' : 'empty',
      detail:
        authorityEvidence.length > 0
          ? `命中 ${authorityEvidence.length} 条结果`
          : '未命中可引用权威结果',
    })
  } catch (error: unknown) {
    searchTrace.push({
      key: 'authority-search',
      label: '权威来源搜索',
      status: 'error',
      detail: getErrorMessage(error),
    })
  }
  await onTrace?.([...searchTrace])

  try {
    supplementEvidence = await searchInternetSupplementSources(
      normalized.effectiveQuery || query,
      registry,
      analysis
    )
    searchTrace.push({
      key: 'internet-search',
      label: '互联网补充搜索',
      status: supplementEvidence.length > 0 ? 'success' : 'empty',
      detail:
        supplementEvidence.length > 0
          ? `命中 ${supplementEvidence.length} 条结果`
          : '未命中补充网页结果',
    })
  } catch (error: unknown) {
    searchTrace.push({
      key: 'internet-search',
      label: '互联网补充搜索',
      status: 'error',
      detail: getErrorMessage(error),
    })
  }
  await onTrace?.([...searchTrace])

  const evidence = [
    ...sortEvidenceByPublishedAt(authorityEvidence),
    ...sortEvidenceByPublishedAt(localEvidence.filter(item => !isInternalKnowledgeEvidence(item))),
    ...sortEvidenceByPublishedAt(localEvidence.filter(isInternalKnowledgeEvidence)),
    ...sortEvidenceByPublishedAt(supplementEvidence),
  ]
  const sources = mapEvidenceToSources(evidence)
  await onSources?.(sources)

  const answer = await generateAnswer({
    query,
    evidence,
  })

  return {
    query,
    answer: answer.content,
    messageStatus: answer.messageStatus,
    sources,
    searchTrace,
  }
}

function mapEvidenceToSources(evidence: RetrievedEvidenceItem[]): SearchSource[] {
  return evidence.map((item, index) => ({
    title: item.title,
    sourceType: item.sourceType,
    sourceTier: item.sourceTier || 'authority',
    sourceLabel: item.sourceLabel,
    sourceUrl: item.sourceUrl,
    sourceDomain: item.sourceDomain,
    snippet: item.snippet,
    publishedAt: item.publishedAt,
    rank: index + 1,
  }))
}

function isInternalKnowledgeEvidence(item: RetrievedEvidenceItem) {
  return item.sourceLabel.startsWith('站内内容 ·')
}

function sortEvidenceByPublishedAt(items: RetrievedEvidenceItem[]) {
  return items
    .map((item, index) => ({ item, index, publishedAt: parsePublishedAt(item.publishedAt) }))
    .sort((left, right) => {
      if (left.publishedAt !== null && right.publishedAt !== null) {
        return right.publishedAt - left.publishedAt || left.index - right.index
      }
      if (left.publishedAt !== null) return -1
      if (right.publishedAt !== null) return 1
      return left.index - right.index
    })
    .map(({ item }) => item)
}

function parsePublishedAt(value: string | null) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function buildLocalTrace(
  notesResult: PromiseSettledResult<Array<unknown>>,
  cacheResult: PromiseSettledResult<Array<unknown>>,
  knowledgeResult: PromiseSettledResult<Array<unknown>>,
  notesLength: number,
  cacheLength: number,
  knowledgeLength: number
): SearchTraceEntry {
  if (
    notesResult.status === 'rejected' ||
    cacheResult.status === 'rejected' ||
    knowledgeResult.status === 'rejected'
  ) {
    return {
      key: 'local-notes',
      label: '站内知识库检索',
      status: 'error',
      detail: [notesResult, cacheResult, knowledgeResult]
        .filter(result => result.status === 'rejected')
        .map(result => getErrorMessage((result as PromiseRejectedResult).reason))
        .join(' | '),
    }
  }

  return {
    key: 'local-notes',
    label: '站内知识库检索',
    status: notesLength + cacheLength + knowledgeLength > 0 ? 'success' : 'empty',
    detail:
      notesLength + cacheLength + knowledgeLength > 0
        ? `命中 ${notesLength + cacheLength + knowledgeLength} 条结果`
        : '未命中知识库结果',
  }
}

function extractDomain(value: string) {
  try {
    return new URL(value).hostname
  } catch {
    return value
  }
}

function normalizeSource(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function getTrustedSourceDomain(source: SourceRegistryEntry) {
  try {
    const url = new URL(source.url)
    if (url.protocol !== 'https:') return ''
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '搜索失败'
}
