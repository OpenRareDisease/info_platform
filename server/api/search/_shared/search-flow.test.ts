import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSearchFlow } from './search-flow'
import type { SourceRegistryEntry } from '~/types/search'

const registry: SourceRegistryEntry[] = []

function registryEntry(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    id: 'source',
    name: 'Source',
    domain: 'example.com',
    url: 'https://example.com/',
    sourceType: 'reference',
    sourceTypes: ['disease_reference'],
    region: 'global',
    language: 'en',
    priority: 1,
    enabled: true,
    notes: null,
    topics: [],
    topicAliases: [],
    authorityEligible: false,
    pathMatch: 'prefix',
    ...overrides,
  }
}

describe('runSearchFlow', () => {
  afterEach(() => {
    delete process.env.ENABLE_INTERNAL_KNOWLEDGE_BASE
  })
  const analysis = {
    subject: 'Pompe disease',
    aliases: ['Pompe disease'],
    intent: 'treatment_update' as const,
    timeSensitivity: 'medium' as const,
    preferredSourceTypes: ['treatment_update' as const, 'clinical_trial' as const],
    deprioritizedSourceTypes: ['disease_reference' as const],
    queryTerms: ['Pompe disease', 'treatment'],
  }

  it('publishes gathered sources before starting answer generation', async () => {
    const callOrder: string[] = []
    let publishedTitles: string[] = []

    await runSearchFlow({
      query: 'Pompe disease treatment',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([]),
        searchCache: vi.fn().mockResolvedValue([
          {
            id: 'early-source',
            queryHash: 'hash',
            queryText: 'Pompe disease treatment',
            sourceUrl: 'https://example.com/early-source',
            sourceDomain: 'example.com',
            sourceType: 'reference' as const,
            title: 'Early source',
            snippet: 'Evidence available before summary',
            content: 'Evidence available before summary',
            publishedAt: null,
            fetchedAt: '2026-09-03T00:00:00Z',
            expiresAt: '2026-09-04T00:00:00Z',
          },
        ]),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      onSources: sources => {
        publishedTitles = sources.map(source => source.title)
        callOrder.push('sources')
      },
      generateAnswer: vi.fn().mockImplementation(async () => {
        callOrder.push('answer')
        return { content: 'ok', messageStatus: 'completed' as const }
      }),
    })

    expect(publishedTitles).toEqual(['Early source'])
    expect(callOrder).toEqual(['sources', 'answer'])
  })

  it('returns all gathered sources instead of truncating combined evidence to eight items', async () => {
    const localCache = Array.from({ length: 5 }, (_, index) => ({
      id: `${index + 1}`,
      queryHash: 'hash',
      queryText: 'Pompe disease treatment',
      sourceUrl: `https://cache.example.com/${index + 1}`,
      sourceDomain: 'cache.example.com',
      sourceType: 'reference' as const,
      title: `Cache ${index + 1}`,
      snippet: `Cache snippet ${index + 1}`,
      content: `Cache content ${index + 1}`,
      publishedAt: null,
      fetchedAt: '2026-04-11T00:00:00Z',
      expiresAt: '2026-04-12T00:00:00Z',
    }))

    const notes = Array.from({ length: 5 }, (_, index) => ({
      id: `${index + 1}`,
      title: `Note ${index + 1}`,
      content: `Note content ${index + 1}`.repeat(20),
      source: `https://note.example.com/${index + 1}`,
      publishedAt: null,
    }))

    const result = await runSearchFlow({
      query: 'Pompe disease treatment',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue(notes),
        searchCache: vi.fn().mockResolvedValue(localCache),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(result.sources).toHaveLength(10)
  })

  it('keeps only policy-approved specialist cache and note evidence in the authority tier', async () => {
    const specialistRegistry = [
      registryEntry({
        id: 'sjia-foundation',
        name: 'Systemic JIA Foundation',
        domain: 'systemicjia.org',
        url: 'https://www.systemicjia.org/',
        sourceType: 'patient_support',
        sourceTypes: ['patient_org', 'treatment_update'],
        topics: ['sJIA'],
        topicAliases: ['sJIA', 'systemic JIA', 'systemic juvenile idiopathic arthritis'],
        authorityEligible: true,
        pathMatch: 'prefix',
      }),
      registryEntry({
        id: 'sjia-acr',
        name: 'American College of Rheumatology JIA guideline',
        domain: 'rheumatology.org',
        url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
        sourceTypes: ['clinical_guideline'],
        topics: ['sJIA'],
        topicAliases: ['sJIA', 'systemic JIA', 'systemic juvenile idiopathic arthritis'],
        authorityEligible: true,
        pathMatch: 'exact',
      }),
      registryEntry({
        id: 'sjia-orphanet',
        name: 'Orphanet ORPHA:85414',
        domain: 'evil.example.com',
        url: 'https://www.orpha.net/en/disease/detail/85414',
        sourceTypes: ['disease_reference'],
        topics: ['sJIA'],
        topicAliases: ['sJIA', 'systemic JIA', 'systemic juvenile idiopathic arthritis'],
        authorityEligible: true,
        pathMatch: 'exact',
      }),
      registryEntry({
        id: 'registered-media',
        name: 'Registered health media',
        domain: 'media.example.com',
        url: 'https://media.example.com/',
        sourceType: 'news',
        sourceTypes: ['treatment_update'],
      }),
    ]
    const specialistAnalysis = {
      subject: 'sJIA',
      aliases: ['MODEL_ONLY_ALIAS'],
      intent: 'disease_overview' as const,
      timeSensitivity: 'low' as const,
      preferredSourceTypes: ['disease_reference' as const],
      deprioritizedSourceTypes: ['treatment_update' as const],
      queryTerms: ['MODEL_ONLY_ALIAS'],
    }
    const cacheEntries = [
      {
        id: 'trusted-orphanet',
        queryHash: 'trusted',
        queryText: 'sJIA overview',
        sourceUrl: 'https://orpha.net/en/disease/detail/85414?lang=en#overview',
        sourceDomain: 'untrusted-cache-label.example',
        sourceType: 'news' as const,
        title: 'Rare disease detail',
        snippet: 'Clinical overview',
        content: 'Clinical overview',
        publishedAt: null,
        fetchedAt: '',
        expiresAt: '',
      },
      {
        id: 'registered-media',
        queryHash: 'media',
        queryText: 'sJIA overview',
        sourceUrl: 'https://media.example.com/sjia-story',
        sourceDomain: 'media.example.com',
        sourceType: 'news' as const,
        title: 'Registered media cache',
        snippet: 'sJIA feature story',
        content: 'sJIA feature story',
        publishedAt: null,
        fetchedAt: '',
        expiresAt: '',
      },
      {
        id: 'unrelated-orphanet',
        queryHash: 'unrelated',
        queryText: 'sJIA overview',
        sourceUrl: 'https://www.orpha.net/en/disease/detail/85415',
        sourceDomain: 'orpha.net',
        sourceType: 'reference' as const,
        title: 'Unrelated Orphanet cache',
        snippet: 'sJIA appears only in cached search context',
        content: 'Unrelated disease page',
        publishedAt: null,
        fetchedAt: '',
        expiresAt: '',
      },
      {
        id: 'insecure-orphanet',
        queryHash: 'http',
        queryText: 'sJIA overview',
        sourceUrl: 'http://orpha.net/en/disease/detail/85414',
        sourceDomain: 'orpha.net',
        sourceType: 'reference' as const,
        title: 'HTTP Orphanet cache',
        snippet: 'sJIA overview',
        content: 'sJIA overview',
        publishedAt: null,
        fetchedAt: '',
        expiresAt: '',
      },
      {
        id: 'lookalike-orphanet',
        queryHash: 'lookalike',
        queryText: 'sJIA overview',
        sourceUrl: 'https://orpha.net.evil.example/en/disease/detail/85414',
        sourceDomain: 'orpha.net',
        sourceType: 'reference' as const,
        title: 'Lookalike Orphanet cache',
        snippet: 'sJIA overview',
        content: 'sJIA overview',
        publishedAt: null,
        fetchedAt: '',
        expiresAt: '',
      },
    ]
    const notes = [
      {
        title: 'Trusted Orphanet URL note',
        content: 'An exact source note for sJIA clinical overview',
        source: 'https://www.orpha.net/en/disease/detail/85414?lang=en#overview',
        publishedAt: null,
      },
      {
        title: 'Untrusted hospital note',
        content: 'A hospital page discussing sJIA',
        source: 'https://hospital.example.org/sjia',
        publishedAt: null,
      },
      {
        title: 'Missing source note',
        content: 'A local note about sJIA without provenance',
        source: undefined as unknown as string,
        publishedAt: null,
      },
      {
        title: 'Malformed source note',
        content: 'A local note about sJIA with malformed provenance',
        source: 'https://[invalid',
        publishedAt: null,
      },
      {
        title: 'Ordinary text source note',
        content: 'A local note about sJIA with a non-URL citation',
        source: 'internal editorial note',
        publishedAt: null,
      },
      {
        title: 'Role-mismatched ACR note',
        content: 'Systemic JIA guideline landing page',
        source: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
        publishedAt: null,
      },
    ]

    const result = await runSearchFlow({
      query: 'sJIA 是什么',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue(notes),
        searchCache: vi.fn().mockResolvedValue(cacheEntries),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry: specialistRegistry,
      analyzeQuery: vi.fn().mockResolvedValue(specialistAnalysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    const sourceByTitle = new Map(result.sources.map(source => [source.title, source]))
    expect(sourceByTitle.get('Rare disease detail')).toMatchObject({
      sourceTier: 'authority',
      sourceLabel: 'Orphanet ORPHA:85414',
      sourceDomain: 'orpha.net',
      sourceType: 'reference',
    })
    expect(sourceByTitle.get('Trusted Orphanet URL note')).toMatchObject({
      sourceTier: 'authority',
      sourceLabel: 'Orphanet ORPHA:85414',
      sourceDomain: 'orpha.net',
      sourceType: 'reference',
    })
    for (const title of [
      'Registered media cache',
      'Unrelated Orphanet cache',
      'HTTP Orphanet cache',
      'Lookalike Orphanet cache',
      'Untrusted hospital note',
      'Missing source note',
      'Malformed source note',
      'Ordinary text source note',
      'Role-mismatched ACR note',
    ]) {
      expect(sourceByTitle.get(title)?.sourceTier, title).toBe('internet_supplement')
    }
  })

  it('preserves the legacy authority tier for non-specialist local cache and notes', async () => {
    const result = await runSearchFlow({
      query: 'Pompe disease treatment',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([
          {
            title: 'Pompe note',
            content: 'Pompe content',
            source: 'ordinary note source',
            publishedAt: null,
          },
        ]),
        searchCache: vi.fn().mockResolvedValue([
          {
            id: 'pompe-cache',
            queryHash: 'pompe',
            queryText: 'Pompe disease treatment',
            sourceUrl: 'https://cache.example.com/pompe',
            sourceDomain: 'cache.example.com',
            sourceType: 'reference',
            title: 'Pompe cache',
            snippet: 'Pompe snippet',
            content: 'Pompe content',
            publishedAt: null,
            fetchedAt: '',
            expiresAt: '',
          },
        ]),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(result.sources.map(source => source.sourceTier)).toEqual(['authority', 'authority'])
  })

  it('does not upgrade false-positive cache or notes through the sJIA trust policy', async () => {
    const foundation = registryEntry({
      id: 'sjia-foundation',
      name: 'Systemic JIA Foundation',
      domain: 'systemicjia.org',
      url: 'https://www.systemicjia.org/',
      sourceType: 'patient_support',
      sourceTypes: ['patient_org', 'treatment_update'],
      topics: ['sJIA'],
      topicAliases: ['sJIA', 'systemic JIA', 'systemic juvenile idiopathic arthritis'],
      authorityEligible: true,
    })
    const result = await runSearchFlow({
      query: 'non-sJIA research update',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([
          {
            title: 'non-sJIA note',
            content: 'non-sJIA research update',
            source: 'https://www.systemicjia.org/research-update',
            publishedAt: null,
          },
        ]),
        searchCache: vi.fn().mockResolvedValue([
          {
            id: 'non-sjia-cache',
            queryHash: 'non-sjia',
            queryText: 'non-sJIA research update',
            sourceUrl: 'https://www.systemicjia.org/research-update',
            sourceDomain: 'systemicjia.org',
            sourceType: 'news',
            title: 'non-sJIA cache',
            snippet: 'non-sJIA research update',
            content: 'non-sJIA research update',
            publishedAt: null,
            fetchedAt: '',
            expiresAt: '',
          },
        ]),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry: [foundation],
      analyzeQuery: vi.fn().mockResolvedValue({
        subject: 'sJIA',
        aliases: ['sJIA'],
        intent: 'treatment_update',
        timeSensitivity: 'high',
        preferredSourceTypes: ['treatment_update'],
        deprioritizedSourceTypes: ['disease_reference'],
        queryTerms: ['sJIA', 'research update'],
      }),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(result.sources.map(source => source.sourceLabel)).not.toContain(
      'Systemic JIA Foundation'
    )
  })

  it.each([
    ['an empty registry', []],
    [
      'only a disabled matching specialist source',
      [
        registryEntry({
          id: 'disabled-fshd-society',
          name: 'FSHD Society',
          domain: 'fshdsociety.org',
          url: 'https://www.fshdsociety.org/',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org'],
          topics: ['fshd'],
          topicAliases: ['FSHD'],
          authorityEligible: true,
          enabled: false,
        }),
      ],
    ],
  ])('downgrades external FSHD local evidence when registry has %s', async (_, testRegistry) => {
    const result = await runSearchFlow({
      query: 'FSHD treatment',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([
          {
            title: 'FSHD local note',
            content: 'FSHD content',
            source: 'ordinary local source',
            publishedAt: null,
          },
        ]),
        searchCache: vi.fn().mockResolvedValue([
          {
            id: 'fshd-cache',
            queryHash: 'fshd',
            queryText: 'FSHD treatment',
            sourceUrl: 'https://cache.example.com/fshd',
            sourceDomain: 'cache.example.com',
            sourceType: 'reference',
            title: 'FSHD local cache',
            snippet: 'FSHD snippet',
            content: 'FSHD content',
            publishedAt: null,
            fetchedAt: '',
            expiresAt: '',
          },
        ]),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry: testRegistry,
      analyzeQuery: vi.fn().mockResolvedValue({
        subject: 'FSHD',
        aliases: ['FSHD'],
        intent: 'treatment_update',
        timeSensitivity: 'medium',
        preferredSourceTypes: ['treatment_update', 'patient_org'],
        deprioritizedSourceTypes: ['disease_reference'],
        queryTerms: ['FSHD', 'treatment'],
      }),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(result.sources.map(source => source.sourceTier)).toEqual([
      'internet_supplement',
      'internet_supplement',
    ])
  })

  it('adds knowledge base evidence to the local search stage and still records live search stages', async () => {
    process.env.ENABLE_INTERNAL_KNOWLEDGE_BASE = 'true'
    const searchKnowledgeBase = vi.fn().mockResolvedValue([
      {
        title: 'FSHD 麻醉注意事项 - 第 2 页',
        content: 'FSHD 患者手术麻醉前应与神经肌肉专科和麻醉科充分沟通。',
        snippet: '手术麻醉前应与神经肌肉专科和麻醉科充分沟通。',
        sourceUrl: 'https://storage.example.com/fshd-anesthesia.pdf',
        sourceDomain: 'storage.example.com',
        sourceLabel: '站内内容 · 02.临床管理与治疗 · B',
        sourceType: 'reference' as const,
        sourceTier: 'authority' as const,
        publishedAt: null,
      },
    ])

    const result = await runSearchFlow({
      query: 'FSHD 麻醉注意事项',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([]),
        searchCache: vi.fn().mockResolvedValue([]),
        searchKnowledgeBase,
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(searchKnowledgeBase).toHaveBeenCalledWith('FSHD 麻醉注意事项', analysis)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.sourceLabel).toContain('站内内容')
    expect(result.sources[0]?.sourceTier).toBe('authority')
    expect(result.searchTrace).toContainEqual({
      key: 'local-notes',
      label: '站内知识库检索',
      status: 'success',
      detail: '命中 1 条结果',
    })
    expect(result.searchTrace.map(entry => entry.key)).toContain('authority-search')
    expect(result.searchTrace.map(entry => entry.key)).toContain('internet-search')
  })

  it('skips the internal knowledge base and its trace step by default', async () => {
    const searchKnowledgeBase = vi.fn().mockResolvedValue([])
    const result = await runSearchFlow({
      query: 'FSHD 麻醉注意事项',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([]),
        searchCache: vi.fn().mockResolvedValue([]),
        searchKnowledgeBase,
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi
        .fn()
        .mockResolvedValue({ content: 'ok', messageStatus: 'completed' as const }),
    })

    expect(searchKnowledgeBase).not.toHaveBeenCalled()
    expect(result.searchTrace.map(entry => entry.key)).not.toContain('local-notes')
  })

  it('orders dated local evidence from newest to oldest', async () => {
    const result = await runSearchFlow({
      query: 'Pompe disease treatment',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([]),
        searchCache: vi.fn().mockResolvedValue([
          {
            id: 'old',
            queryHash: 'old',
            queryText: 'Pompe',
            sourceUrl: 'https://example.com/old',
            sourceDomain: 'example.com',
            sourceType: 'reference',
            title: 'Old',
            snippet: '',
            content: '',
            publishedAt: '2025-01-01T00:00:00.000Z',
            fetchedAt: '',
            expiresAt: '',
          },
          {
            id: 'new',
            queryHash: 'new',
            queryText: 'Pompe',
            sourceUrl: 'https://example.com/new',
            sourceDomain: 'example.com',
            sourceType: 'reference',
            title: 'New',
            snippet: '',
            content: '',
            publishedAt: '2026-01-01T00:00:00.000Z',
            fetchedAt: '',
            expiresAt: '',
          },
        ]),
        searchKnowledgeBase: vi.fn().mockResolvedValue([]),
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi
        .fn()
        .mockResolvedValue({ content: 'ok', messageStatus: 'completed' as const }),
    })

    expect(result.sources.map(source => source.title)).toEqual(['New', 'Old'])
  })

  it('records knowledge base errors without blocking answer generation', async () => {
    process.env.ENABLE_INTERNAL_KNOWLEDGE_BASE = 'true'
    const result = await runSearchFlow({
      query: 'FSHD 麻醉注意事项',
      repositories: {
        searchNotes: vi.fn().mockResolvedValue([]),
        searchCache: vi.fn().mockResolvedValue([]),
        searchKnowledgeBase: vi.fn().mockRejectedValue(new Error('KB RPC failed')),
      },
      registry,
      analyzeQuery: vi.fn().mockResolvedValue(analysis),
      detectSafetyRisk: vi.fn().mockResolvedValue({ risky: false }),
      generateAnswer: vi.fn().mockResolvedValue({
        content: 'fallback ok',
        messageStatus: 'completed' as const,
      }),
    })

    expect(result.answer).toBe('fallback ok')
    expect(result.searchTrace).toContainEqual({
      key: 'local-notes',
      label: '站内知识库检索',
      status: 'error',
      detail: 'KB RPC failed',
    })
  })
})
