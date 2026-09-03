import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchInternetSupplementSources, searchWhitelistedSources } from './live-search'
import { fallbackAnalyzeSearchQuery } from './query-analysis'
import type { SearchQueryAnalysis, SourceRegistryEntry } from '~/types/search'

function registryEntry(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    id: 'source',
    name: 'Source',
    domain: 'source.example.com',
    url: 'https://source.example.com/',
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

const registry: SourceRegistryEntry[] = [
  registryEntry({
    id: 'nord',
    name: 'NORD',
    domain: 'rarediseases.org',
    url: 'https://rarediseases.org/',
    sourceType: 'reference',
    sourceTypes: ['disease_reference'],
    region: 'global',
    language: 'en',
    priority: 1,
    enabled: true,
    notes: null,
  }),
]

const sjiaTopicAliases = [
  'sJIA',
  'systemic JIA',
  'systemic juvenile idiopathic arthritis',
  '系统性幼年特发性关节炎',
]

const specialistRegistry: SourceRegistryEntry[] = [
  registryEntry({
    id: 'sjia-foundation',
    name: 'Systemic JIA Foundation',
    domain: 'systemicjia.org',
    url: 'https://www.systemicjia.org/',
    sourceType: 'patient_support',
    sourceTypes: ['patient_org', 'treatment_update'],
    topics: ['sJIA'],
    topicAliases: sjiaTopicAliases,
    authorityEligible: true,
    pathMatch: 'prefix',
  }),
  registryEntry({
    id: 'sjia-acr',
    name: 'American College of Rheumatology JIA Guideline',
    domain: 'rheumatology.org',
    url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
    sourceTypes: ['clinical_guideline'],
    topics: ['sJIA'],
    topicAliases: sjiaTopicAliases,
    authorityEligible: true,
    pathMatch: 'exact',
  }),
  registryEntry({
    id: 'sjia-orphanet',
    name: 'Orphanet ORPHA:85414',
    domain: 'orpha.net',
    url: 'https://www.orpha.net/en/disease/detail/85414',
    sourceTypes: ['disease_reference'],
    topics: ['sJIA'],
    topicAliases: sjiaTopicAliases,
    authorityEligible: true,
    pathMatch: 'exact',
  }),
  registryEntry({
    id: 'generic-orphanet',
    name: 'Generic Orphanet',
    domain: 'orpha.net',
    url: 'https://www.orpha.net/',
    sourceTypes: ['disease_reference', 'treatment_update'],
  }),
  registryEntry({
    id: 'rare-disease-media',
    name: 'Rare Disease Media',
    domain: 'media.example.com',
    url: 'https://media.example.com/',
    sourceType: 'news',
    sourceTypes: ['treatment_update', 'research_publication'],
  }),
  registryEntry({
    id: 'disabled-sjia-update',
    name: 'Disabled sJIA Update Source',
    domain: 'disabled.example.com',
    url: 'https://disabled.example.com/',
    sourceType: 'news',
    sourceTypes: ['treatment_update'],
    enabled: false,
    topics: ['sJIA'],
    topicAliases: sjiaTopicAliases,
    authorityEligible: true,
  }),
]

function specialistAnalysis(
  intent: SearchQueryAnalysis['intent'],
  preferredSourceTypes: SearchQueryAnalysis['preferredSourceTypes']
): SearchQueryAnalysis {
  return {
    subject: 'sJIA',
    aliases: ['sJIA', 'systemic juvenile idiopathic arthritis'],
    intent,
    timeSensitivity:
      intent === 'treatment_update' || intent === 'research_progress' ? 'high' : 'low',
    preferredSourceTypes,
    deprioritizedSourceTypes: [],
    queryTerms: ['sJIA'],
  }
}

function requestedAuthorityDomains(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url]) => {
    const providerQuery = new URL(url as string).searchParams.get('q') || ''
    return providerQuery.match(/site:([^\s]+)/)?.[1] || ''
  })
}

function requestedAuthorityQueries(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams.get('q') || '')
}

function specialistFetchMock() {
  return vi.fn().mockImplementation(async (url: string) => {
    const providerQuery = new URL(url).searchParams.get('q') || ''
    const domain = providerQuery.match(/site:([^\s]+)/)?.[1] || ''
    const result =
      domain === 'orpha.net'
        ? {
            title: 'Orphanet disease page',
            url: 'https://www.orpha.net/en/disease/detail/85414',
            description: 'Rare disease reference',
          }
        : domain === 'rheumatology.org'
          ? {
              title: 'Systemic JIA clinical guideline',
              url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
              description: 'Official sJIA guidance',
            }
          : domain === 'systemicjia.org'
            ? {
                title: 'sJIA research and patient update',
                url: 'https://www.systemicjia.org/research-update',
                description: 'Systemic JIA Foundation support and research',
              }
            : {
                title: 'sJIA media story',
                url: `https://${domain}/sjia-story`,
                description: 'Media coverage',
              }

    return new Response(JSON.stringify({ web: { results: [result] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('searchWhitelistedSources', () => {
  const treatmentUpdateAnalysis: SearchQueryAnalysis = {
    subject: 'FSHD',
    aliases: ['FSHD'],
    intent: 'treatment_update',
    timeSensitivity: 'high',
    preferredSourceTypes: ['treatment_update', 'clinical_trial', 'drug_approval', 'patient_org'],
    deprioritizedSourceTypes: ['disease_reference'],
    queryTerms: ['FSHD', 'treatment', 'update'],
  }
  const pompeTreatmentAnalysis: SearchQueryAnalysis = {
    subject: 'Pompe disease',
    aliases: ['Pompe disease'],
    intent: 'treatment_update',
    timeSensitivity: 'high',
    preferredSourceTypes: ['treatment_update', 'clinical_trial', 'drug_approval', 'patient_org'],
    deprioritizedSourceTypes: ['disease_reference'],
    queryTerms: ['Pompe disease', 'treatment', 'update'],
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SERPAPI_KEY
    delete process.env.BRAVE_API_KEY
  })

  it('requests no authority sources for an explicit specialist query when the registry is empty', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'sJIA 最新研究进展',
      [],
      specialistAnalysis('treatment_update', ['treatment_update'])
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(results).toEqual([])
  })

  it('does not generic-backfill when every matching specialist source is disabled', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = specialistFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'sJIA 最新研究进展',
      [
        registryEntry({
          id: 'disabled-sjia-foundation',
          name: 'Disabled Systemic JIA Foundation',
          domain: 'systemicjia.org',
          url: 'https://www.systemicjia.org/',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org', 'treatment_update'],
          enabled: false,
          topics: ['sJIA'],
          topicAliases: sjiaTopicAliases,
          authorityEligible: true,
        }),
        registryEntry({
          id: 'generic-update',
          name: 'Generic Update Source',
          domain: 'generic.example.com',
          url: 'https://generic.example.com/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
        }),
      ],
      specialistAnalysis('treatment_update', ['treatment_update'])
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(results).toEqual([])
  })

  it.each([
    ['disease_overview', ['disease_reference'], 'orpha.net', 'Orphanet ORPHA:85414'],
    [
      'clinical_guidance',
      ['clinical_guideline'],
      'rheumatology.org',
      'American College of Rheumatology JIA Guideline',
    ],
    ['treatment_update', ['treatment_update'], 'systemicjia.org', 'Systemic JIA Foundation'],
    [
      'research_progress',
      ['research_publication', 'treatment_update'],
      'systemicjia.org',
      'Systemic JIA Foundation',
    ],
    ['patient_support', ['patient_org'], 'systemicjia.org', 'Systemic JIA Foundation'],
  ] as const)(
    'routes the sJIA %s intent only to its trusted specialist role',
    async (intent, preferredSourceTypes, expectedDomain, expectedLabel) => {
      process.env.BRAVE_API_KEY = 'test-key'
      const fetchMock = specialistFetchMock()
      vi.stubGlobal('fetch', fetchMock)

      const results = await searchWhitelistedSources(
        'sJIA 专病检索',
        specialistRegistry,
        specialistAnalysis(intent, [...preferredSourceTypes])
      )

      expect(requestedAuthorityDomains(fetchMock)).toEqual([expectedDomain])
      expect(results.map(result => result.sourceLabel)).toEqual([expectedLabel])
    }
  )

  it.each([
    ['sJIA 用药', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 推荐用药', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 用药指南', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 怎么治疗', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 如何治疗', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 治疗', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA treatment', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA medication', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA medications', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA recommended medication', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA recommended medications', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA recommended drug', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA recommended drugs', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA how to treat', 'clinical_guidance', 'rheumatology.org'],
    ['sJIA 最新用药', 'treatment_update', 'systemicjia.org'],
    ['sJIA 治疗更新', 'treatment_update', 'systemicjia.org'],
    ['sJIA 患者支持', 'patient_support', 'systemicjia.org'],
    ['sJIA 临床试验', 'clinical_trial', 'systemicjia.org'],
  ] as const)(
    'routes analyzer output for %s as %s to %s',
    async (query, expectedIntent, expectedDomain) => {
      process.env.BRAVE_API_KEY = 'test-key'
      const fetchMock = specialistFetchMock()
      vi.stubGlobal('fetch', fetchMock)
      const analysis = fallbackAnalyzeSearchQuery(query)

      await searchWhitelistedSources(query, specialistRegistry, analysis)

      expect(analysis.intent).toBe(expectedIntent)
      expect(requestedAuthorityDomains(fetchMock)).toEqual([expectedDomain])
    }
  )

  it('uses real FSHD analysis to select FSHD Society for bare treatment', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'FSHD treatment update',
                url: 'https://www.fshdsociety.org/fshd-treatment-update',
                description: 'Facioscapulohumeral muscular dystrophy treatment research',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    const analysis = fallbackAnalyzeSearchQuery('FSHD treatment')

    const results = await searchWhitelistedSources(
      'FSHD treatment',
      [
        registryEntry({
          id: 'fshd-society',
          name: 'FSHD Society',
          domain: 'fshdsociety.org',
          url: 'https://www.fshdsociety.org/',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org', 'treatment_update'],
          topics: ['FSHD'],
          topicAliases: ['FSHD', 'facioscapulohumeral muscular dystrophy'],
          authorityEligible: true,
        }),
      ],
      analysis
    )

    expect(analysis.intent).toBe('treatment_update')
    expect(requestedAuthorityDomains(fetchMock)).toEqual(['fshdsociety.org'])
    expect(results.map(result => result.sourceLabel)).toEqual(['FSHD Society'])
  })

  it.each(['Pompe disease treatment', 'rare inflammatory syndrome treatment'])(
    'uses real generic analysis to keep treatment-update buckets for %s',
    async query => {
      process.env.BRAVE_API_KEY = 'test-key'
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        const providerQuery = new URL(url).searchParams.get('q') || ''
        const domain = providerQuery.match(/site:([^\s]+)/)?.[1] || ''
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: `${query} update`,
                  url: `https://${domain}/treatment-update`,
                  description: `Latest ${query} research update`,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      })
      vi.stubGlobal('fetch', fetchMock)
      const analysis = fallbackAnalyzeSearchQuery(query)

      const results = await searchWhitelistedSources(
        query,
        [
          registryEntry({
            id: 'generic-update',
            name: 'Generic Update Source',
            domain: 'updates.example.com',
            url: 'https://updates.example.com/',
            sourceType: 'news',
            sourceTypes: ['treatment_update'],
          }),
          registryEntry({
            id: 'generic-reference',
            name: 'Generic Reference Source',
            domain: 'reference.example.com',
            url: 'https://reference.example.com/',
            sourceType: 'reference',
            sourceTypes: ['disease_reference'],
            priority: 2,
          }),
        ],
        analysis
      )

      expect(analysis.intent).toBe('treatment_update')
      expect(requestedAuthorityDomains(fetchMock)).toEqual(['updates.example.com'])
      expect(results.map(result => result.sourceDomain)).toEqual(['updates.example.com'])
    }
  )

  it.each([
    [
      'disease_overview',
      ['disease_reference'],
      'https://www.orpha.net/en/disease/detail/85414',
      [
        {
          title: 'Orphanet rare disease record',
          url: 'https://www.orpha.net/en/disease/detail/85414',
          description: 'ORPHA record',
        },
        {
          title: 'Systemic JIA overview for the wrong record',
          url: 'https://www.orpha.net/en/disease/detail/99999',
          description: 'sJIA disease reference',
        },
      ],
    ],
    [
      'clinical_guidance',
      ['clinical_guideline'],
      'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
      [
        {
          title: 'Systemic JIA clinical guideline',
          url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
          description: 'Official sJIA guidance',
        },
        {
          title: 'General guideline landing page',
          url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline?topic=sJIA#sJIA',
          description: 'General rheumatology guidance',
        },
        {
          title: 'Systemic JIA guidance on a sibling page',
          url: 'https://rheumatology.org/other-guideline',
          description: 'Official sJIA guidance',
        },
      ],
    ],
    [
      'treatment_update',
      ['treatment_update'],
      'https://www.systemicjia.org/sjia-research-update',
      [
        {
          title: 'sJIA research update',
          url: 'https://www.systemicjia.org/sjia-research-update',
          description: 'Systemic juvenile idiopathic arthritis research',
        },
        {
          title: 'Foundation annual report',
          url: 'https://www.systemicjia.org/annual-report',
          description: 'General organization news',
        },
        {
          title: 'sJIA update over HTTP',
          url: 'http://www.systemicjia.org/sjia-update',
          description: 'Systemic JIA research',
        },
        {
          title: 'sJIA lookalike host',
          url: 'https://systemicjia.org.evil.example/sjia-update',
          description: 'Systemic JIA research',
        },
      ],
    ],
    [
      'research_progress',
      ['research_publication', 'treatment_update'],
      'https://www.systemicjia.org/sjia-research-progress',
      [
        {
          title: 'sJIA research progress',
          url: 'https://www.systemicjia.org/sjia-research-progress',
          description: 'Systemic juvenile idiopathic arthritis research publication',
        },
        {
          title: 'Foundation governance update',
          url: 'https://www.systemicjia.org/governance-update',
          description: 'General organization information',
        },
      ],
    ],
    [
      'patient_support',
      ['patient_org'],
      'https://www.systemicjia.org/sjia-patient-support',
      [
        {
          title: 'sJIA patient support',
          url: 'https://www.systemicjia.org/sjia-patient-support',
          description: 'Support for systemic juvenile idiopathic arthritis families',
        },
        {
          title: 'Foundation donation page',
          url: 'https://www.systemicjia.org/donate',
          description: 'General donation information',
        },
      ],
    ],
  ] as const)(
    'keeps only locally trusted sJIA %s results from the selected official source',
    async (intent, preferredSourceTypes, expectedUrl, providerResults) => {
      process.env.BRAVE_API_KEY = 'test-key'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ web: { results: providerResults } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )

      const results = await searchWhitelistedSources(
        '系统性幼年特发性关节炎专病检索',
        specialistRegistry,
        specialistAnalysis(intent, [...preferredSourceTypes])
      )

      expect(results.map(result => result.sourceUrl)).toEqual([expectedUrl])
      expect(results.every(result => result.sourceTier === 'authority')).toBe(true)
    }
  )

  it('does not trust a model-injected alias that is absent from registered topic metadata', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: 'Juvenile fever syndrome patient support',
                  url: 'https://www.systemicjia.org/fever-support',
                  description: 'Resources for juvenile fever syndrome families',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    const analysis = specialistAnalysis('patient_support', ['patient_org'])
    analysis.aliases = ['sJIA', 'juvenile fever syndrome']
    analysis.queryTerms = ['juvenile fever syndrome']

    const results = await searchWhitelistedSources(
      '系统性幼年特发性关节炎患者支持',
      specialistRegistry,
      analysis
    )

    expect(results).toEqual([])
  })

  it.each([
    [
      'disease_overview',
      ['disease_reference'],
      'orpha.net',
      ['ORPHA:85414', '/en/disease/detail/85414'],
    ],
    [
      'clinical_guidance',
      ['clinical_guideline'],
      'rheumatology.org',
      ['/juvenile-idiopathic-arthritis-guideline'],
    ],
    ['treatment_update', ['treatment_update'], 'systemicjia.org', []],
    ['research_progress', ['research_publication', 'treatment_update'], 'systemicjia.org', []],
    ['patient_support', ['patient_org'], 'systemicjia.org', []],
  ] as const)(
    'builds the sJIA %s provider query from trusted specialist metadata',
    async (intent, preferredSourceTypes, expectedDomain, extraTerms) => {
      process.env.BRAVE_API_KEY = 'test-key'
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ web: { results: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      vi.stubGlobal('fetch', fetchMock)
      const analysis = specialistAnalysis(intent, [...preferredSourceTypes])
      analysis.aliases = ['sJIA', 'model invented syndrome']
      analysis.queryTerms = ['model-injected-only']

      await searchWhitelistedSources('系统性幼年特发性关节炎专病检索', specialistRegistry, analysis)

      expect(requestedAuthorityDomains(fetchMock)).toEqual([expectedDomain])
      const providerQuery = requestedAuthorityQueries(fetchMock)[0] || ''
      expect(providerQuery).toContain('sJIA')
      expect(providerQuery).toContain('systemic juvenile idiopathic arthritis')
      expect(providerQuery).not.toContain('model-injected-only')
      expect(providerQuery).not.toContain('model invented syndrome')
      for (const term of extraTerms) expect(providerQuery).toContain(term)
    }
  )

  it('uses the trusted registered URL host when source.domain is stale or malicious', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Orphanet ORPHA record',
                url: 'https://www.orpha.net/en/disease/detail/85414',
                description: 'Systemic juvenile idiopathic arthritis reference',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      '系统性幼年特发性关节炎是什么',
      [
        {
          ...specialistRegistry[2]!,
          domain: 'evil.example.com',
        },
      ],
      specialistAnalysis('disease_overview', ['disease_reference'])
    )

    expect(requestedAuthorityDomains(fetchMock)).toEqual(['orpha.net'])
    expect(requestedAuthorityQueries(fetchMock)[0]).not.toContain('evil.example.com')
    expect(results).toHaveLength(1)
    expect(results[0]?.sourceDomain).toBe('orpha.net')
  })

  it('does not query or grant authority for a specialist source with an invalid registered URL', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'sJIA research update',
                url: 'https://www.systemicjia.org/sjia-research-update',
                description: 'Systemic juvenile idiopathic arthritis research',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'sJIA 最新研究进展',
      [
        {
          ...specialistRegistry[0]!,
          domain: 'systemicjia.org',
          url: 'not a registered URL',
        },
      ],
      specialistAnalysis('research_progress', ['research_publication', 'treatment_update'])
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(results).toEqual([])
  })

  it('derives specialist routing from the raw query instead of forged analysis fields', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = specialistFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    await searchWhitelistedSources(
      'AOSD treatment',
      [
        ...specialistRegistry.slice(0, 3),
        registryEntry({
          id: 'generic-update',
          name: 'Generic Update Source',
          domain: 'generic.example.com',
          url: 'https://generic.example.com/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
        }),
      ],
      specialistAnalysis('treatment_update', ['treatment_update'])
    )

    expect(requestedAuthorityDomains(fetchMock)).toEqual(['generic.example.com'])
  })

  it.each([
    'non-sJIA research update',
    'non systemic JIA research update',
    '非系统性幼年特发性关节炎研究进展',
  ])(
    'does not activate sJIA authority routing for the false-positive raw query %s',
    async query => {
      process.env.BRAVE_API_KEY = 'test-key'
      const fetchMock = specialistFetchMock()
      vi.stubGlobal('fetch', fetchMock)

      await searchWhitelistedSources(
        query,
        [
          specialistRegistry[0]!,
          registryEntry({
            id: 'generic-update',
            name: 'Generic Update Source',
            domain: 'generic.example.com',
            url: 'https://generic.example.com/',
            sourceType: 'news',
            sourceTypes: ['treatment_update'],
          }),
        ],
        specialistAnalysis('treatment_update', ['treatment_update'])
      )

      expect(requestedAuthorityDomains(fetchMock)).toEqual(['generic.example.com'])
    }
  )

  it('keeps FSHD Society specialist routing and rejects generic, media, and unrelated Society results', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Community annual report',
                url: 'https://www.fshdsociety.org/community-annual-report',
                description: 'General organization news',
              },
              {
                title: 'FSHD research update',
                url: 'https://www.fshdsociety.org/fshd-research-update',
                description: 'Latest facioscapulohumeral muscular dystrophy research',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'FSHD latest research update',
      [
        registryEntry({
          id: 'fshd-society-specialist',
          name: 'FSHD Society',
          domain: 'fshdsociety.org',
          url: 'https://www.fshdsociety.org/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
          topics: ['FSHD'],
          topicAliases: ['FSHD', 'facioscapulohumeral muscular dystrophy'],
          authorityEligible: true,
        }),
        registryEntry({
          id: 'fshd-generic',
          name: 'Generic Rare Disease Reference',
          domain: 'generic.example.com',
          sourceTypes: ['treatment_update'],
        }),
        registryEntry({
          id: 'fshd-media',
          name: 'Rare Disease Media',
          domain: 'media.example.com',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
        }),
      ],
      {
        ...treatmentUpdateAnalysis,
        intent: 'research_progress',
        preferredSourceTypes: ['research_publication', 'treatment_update'],
      }
    )

    expect(requestedAuthorityDomains(fetchMock)).toEqual(['fshdsociety.org'])
    expect(results.map(result => result.sourceUrl)).toEqual([
      'https://www.fshdsociety.org/fshd-research-update',
    ])
  })

  it('maps Brave API web results into authority evidence items', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Working result',
                url: 'https://rarediseases.org/working-result',
                description: 'Useful summary',
                page_age: '2026-07-01',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources('Pompe disease treatment', registry)

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Working result')
    expect(results[0]?.sourceDomain).toBe('rarediseases.org')
    expect(results[0]?.snippet).toBe('Useful summary')
    expect(results[0]?.publishedAt).toBe('2026-07-01T00:00:00.000Z')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.search.brave.com/res/v1/web/search?'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-Subscription-Token': 'test-key',
        }),
      })
    )
  })

  it('uses a one-year freshness filter only for high time-sensitivity queries', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await searchWhitelistedSources('Pompe disease treatment', registry, {
      ...pompeTreatmentAnalysis,
      preferredSourceTypes: ['disease_reference'],
      deprioritizedSourceTypes: [],
    })

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(requestUrl.searchParams.get('freshness')).toBe('py')
  })

  it('uses the freshness filter for high-sensitivity supplement searches', async () => {
    process.env.BRAVE_API_KEY = 'test-key'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await searchInternetSupplementSources('FSHD treatment', registry, treatmentUpdateAnalysis)

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(requestUrl.searchParams.get('freshness')).toBe('py')
  })

  it('includes clinical sources for treatment queries instead of only early drug sites', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const mixedRegistry: SourceRegistryEntry[] = [
      ...Array.from(
        { length: 8 },
        (_, index): SourceRegistryEntry =>
          registryEntry({
            id: `drug-${index + 1}`,
            name: `Drug ${index + 1}`,
            domain: `drug${index + 1}.example.com`,
            url: `https://drug${index + 1}.example.com/`,
            sourceType: 'drug_approval',
            sourceTypes: ['drug_approval'],
            region: 'global',
            language: 'en',
            priority: index + 1,
            enabled: true,
            notes: null,
          })
      ),
      registryEntry({
        id: 'reference-1',
        name: 'Reference Source',
        domain: 'reference.example.com',
        url: 'https://reference.example.com/',
        sourceType: 'reference',
        sourceTypes: ['disease_reference'],
        region: 'global',
        language: 'en',
        priority: 9,
        enabled: true,
        notes: null,
      }),
      registryEntry({
        id: 'clinical-1',
        name: 'Clinical Source',
        domain: 'clinical.example.com',
        url: 'https://clinical.example.com/',
        sourceType: 'clinical_trial',
        sourceTypes: ['clinical_trial', 'treatment_update'],
        region: 'global',
        language: 'en',
        priority: 10,
        enabled: true,
        notes: null,
      }),
    ]

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const query = new URL(url).searchParams.get('q') || ''
      const domain = query.match(/site:([^\s]+)/)?.[1] || 'unknown.example.com'
      const subject = query.includes('Pompe disease') ? 'Pompe disease' : 'FSHD'

      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: `${subject} treatment update for ${domain}`,
                url: `https://${domain}/result`,
                description: `Latest ${subject} treatment update from ${domain}`,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease treatment progress',
      mixedRegistry,
      pompeTreatmentAnalysis
    )

    expect(results.some(item => item.sourceDomain === 'clinical.example.com')).toBe(true)
    expect(results.some(item => item.sourceDomain === 'drug1.example.com')).toBe(true)
    expect(results.some(item => item.sourceDomain === 'reference.example.com')).toBe(false)
  })

  it('deprioritizes registry-like authority pages for treatment-update searches', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Orphanet: Pompe disease patient registry',
                url: 'https://orpha.net/en/research-trials/registry/123',
                description: 'Further information on this patient registry',
              },
              {
                title: 'Pompe disease treatment update 2026',
                url: 'https://orpha.net/en/news/pompe-treatment-update',
                description: 'Latest treatment update for Pompe disease',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease 最新治疗进展',
      [
        {
          id: 'orpha',
          name: 'Orphanet',
          domain: 'orpha.net',
          url: 'https://orpha.net/en/',
          sourceType: 'reference',
          sourceTypes: ['disease_reference', 'treatment_update'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      pompeTreatmentAnalysis
    )

    expect(results[0]?.sourceUrl).toBe('https://orpha.net/en/news/pompe-treatment-update')
  })

  it('prioritizes disease-specific authority sources ahead of generic update sites', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const query = new URL(url).searchParams.get('q') || ''
      const domain = query.match(/site:([^\s]+)/)?.[1] || 'unknown.example.com'

      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title:
                  domain === 'fshdsociety.org'
                    ? 'Facioscapulohumeral muscular dystrophy treatment update 2026'
                    : `FSHD treatment update on ${domain}`,
                url: `https://${domain}/fshd-treatment-update`,
                description:
                  domain === 'fshdsociety.org'
                    ? 'Latest facioscapulohumeral muscular dystrophy clinical update'
                    : `Latest FSHD treatment update on ${domain}`,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'FSHD最新治疗进展',
      [
        {
          id: 'orpha',
          name: 'OrphaNet',
          domain: 'orpha.net',
          url: 'https://www.orpha.net/',
          sourceType: 'reference',
          sourceTypes: ['treatment_update', 'disease_reference'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: 'rare disease updates',
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
        {
          id: 'ddw',
          name: 'DDW-Online',
          domain: 'ddw-online.com',
          url: 'https://www.ddw-online.com/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
          region: 'global',
          language: 'en',
          priority: 2,
          enabled: true,
          notes: 'rare disease industry news',
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
        {
          id: 'biobuzz',
          name: 'BioBuzz',
          domain: 'news.biobuzz.io',
          url: 'https://news.biobuzz.io/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
          region: 'global',
          language: 'en',
          priority: 3,
          enabled: true,
          notes: 'biotech program progress',
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
        {
          id: 'fshd-society',
          name: 'FSHD Society',
          domain: 'fshdsociety.org',
          url: 'https://www.fshdsociety.org/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
          region: 'global',
          language: 'en',
          priority: 20,
          enabled: true,
          notes: 'FSHD news and clinical program updates',
          topics: ['FSHD'],
          topicAliases: ['FSHD', 'facioscapulohumeral muscular dystrophy'],
          authorityEligible: true,
          pathMatch: 'prefix',
        },
      ],
      treatmentUpdateAnalysis
    )

    expect(fetchMock.mock.calls.some(([url]) => url.includes('site%3Afshdsociety.org'))).toBe(true)
    expect(results.some(item => item.sourceDomain === 'fshdsociety.org')).toBe(true)
  })

  it('keeps authority results within a configured source path when the registry entry points to a subdirectory', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'General NORD page',
                url: 'https://rarediseases.org/rare-diseases/pompe-disease/',
                description: 'Broad disease overview',
              },
              {
                title: 'Help now Pompe disease support',
                url: 'https://rarediseases.org/patients/help-now/pompe-support/',
                description: 'Program update',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease support update',
      [
        {
          id: 'nord-help',
          name: 'NORD Help Now',
          domain: 'rarediseases.org',
          url: 'https://rarediseases.org/patients/help-now/',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org'] as const,
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      {
        subject: 'Pompe disease',
        aliases: ['Pompe disease'],
        intent: 'patient_support',
        timeSensitivity: 'medium',
        preferredSourceTypes: ['patient_org'],
        deprioritizedSourceTypes: [],
        queryTerms: ['Pompe disease', 'support'],
      }
    )

    expect(results).toHaveLength(1)
    expect(results[0]?.sourceUrl).toContain('/patients/help-now/')
  })

  it('filters out authority pages that do not mention the subject for treatment-update queries', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Orphanet',
                url: 'https://www.orpha.net/',
                description: 'Inventory and encyclopaedia of rare diseases',
              },
              {
                title: 'Orphanet: BAXALTA US, INC.',
                url: 'https://www.orpha.net/en/institutions/legal-entity/440990',
                description: 'Search for a Legal Entity',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'FSHD最新治疗进展',
      [
        {
          id: 'orpha',
          name: 'Orphanet',
          domain: 'orpha.net',
          url: 'https://www.orpha.net/',
          sourceType: 'reference',
          sourceTypes: ['disease_reference', 'treatment_update'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      treatmentUpdateAnalysis
    )

    expect(results).toHaveLength(0)
  })

  it('filters out generic authority entries even when they mention the subject', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Pompe disease clinical overview',
                url: 'https://omim.org/entry/158900',
                description: 'Clinical synopsis and gene-phenotype overview for Pompe disease',
              },
              {
                title: 'Pompe disease treatment update 2026',
                url: 'https://omim.org/news/pompe-treatment-update-2026',
                description: 'Latest Pompe disease clinical and treatment progress update',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease 最新治疗进展',
      [
        {
          id: 'omim',
          name: 'OMIM',
          domain: 'omim.org',
          url: 'https://omim.org/',
          sourceType: 'reference',
          sourceTypes: ['disease_reference', 'treatment_update'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      pompeTreatmentAnalysis
    )

    expect(results).toHaveLength(1)
    expect(results[0]?.sourceUrl).toBe('https://omim.org/news/pompe-treatment-update-2026')
  })

  it('does not backfill unrelated authority buckets for treatment-update queries', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const query = new URL(url).searchParams.get('q') || ''
      const domain = query.match(/site:([^\s]+)/)?.[1] || 'unknown.example.com'

      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: `Pompe disease result for ${domain}`,
                url: `https://${domain}/pompe-update`,
                description: `Latest Pompe disease treatment update on ${domain}`,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease 最新治疗进展',
      [
        {
          id: 'update-1',
          name: 'Update Source',
          domain: 'updates.example.com',
          url: 'https://updates.example.com/',
          sourceType: 'news',
          sourceTypes: ['treatment_update'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
        {
          id: 'omim',
          name: 'OMIM',
          domain: 'omim.org',
          url: 'https://omim.org/',
          sourceType: 'reference',
          sourceTypes: ['disease_reference'],
          region: 'global',
          language: 'en',
          priority: 2,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      pompeTreatmentAnalysis
    )

    expect(results).toHaveLength(1)
    expect(results[0]?.sourceDomain).toBe('updates.example.com')
  })

  it('searches multiple paths from the same domain when they are distinct authority entries', async () => {
    process.env.BRAVE_API_KEY = 'test-key'

    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: 'Pompe disease support update',
                  url: 'https://rarediseases.org/patients/help-now/pompe-support-update',
                  description: 'Latest Pompe disease support update',
                },
              ],
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      }

      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Pompe disease organization page',
                url: 'https://rarediseases.org/organizations/pompe',
                description: 'Pompe disease community organization',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const results = await searchWhitelistedSources(
      'Pompe disease support update',
      [
        {
          id: 'nord-help',
          name: 'NORD Help Now',
          domain: 'rarediseases.org',
          url: 'https://rarediseases.org/patients/help-now/',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org'],
          region: 'global',
          language: 'en',
          priority: 1,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
        {
          id: 'nord-org',
          name: 'NORD Organizations',
          domain: 'rarediseases.org',
          url: 'https://rarediseases.org/organizations',
          sourceType: 'patient_support',
          sourceTypes: ['patient_org'],
          region: 'global',
          language: 'en',
          priority: 2,
          enabled: true,
          notes: null,
          topics: [],
          topicAliases: [],
          authorityEligible: false,
          pathMatch: 'prefix',
        },
      ],
      {
        subject: 'Pompe disease',
        aliases: ['Pompe disease'],
        intent: 'patient_support',
        timeSensitivity: 'medium',
        preferredSourceTypes: ['patient_org'],
        deprioritizedSourceTypes: [],
        queryTerms: ['Pompe disease', 'support'],
      }
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(results.map(item => item.sourceUrl)).toEqual(
      expect.arrayContaining([
        'https://rarediseases.org/patients/help-now/pompe-support-update',
        'https://rarediseases.org/organizations/pompe',
      ])
    )
  })
})
