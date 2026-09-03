import { describe, expect, it } from 'vitest'
import type { AuthoritySourceType, SearchQueryAnalysis, SourceRegistryEntry } from '~/types/search'
import {
  detectSpecialistTopic,
  findTrustedAuthoritySource,
  isSecureSourceUrlMatch,
  isSpecialistResultRelevant,
} from './authority-policy'

function sourceEntry(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    id: 'sjia-orphanet',
    name: 'Orphanet ORPHA:85414',
    domain: 'orpha.net',
    url: 'https://www.orpha.net/en/disease/detail/85414',
    sourceType: 'reference',
    sourceTypes: ['disease_reference'],
    region: 'global',
    language: 'en',
    priority: 1,
    enabled: true,
    notes: null,
    topics: ['sJIA'],
    topicAliases: [
      'sJIA',
      'systemic JIA',
      'systemic juvenile idiopathic arthritis',
      '系统性幼年特发性关节炎',
    ],
    authorityEligible: true,
    pathMatch: 'exact',
    ...overrides,
  }
}

function trustedLookup(
  rawQuery: string,
  result: { url: string; title?: string; summary?: string },
  sources: SourceRegistryEntry[],
  requiredSourceTypes?: AuthoritySourceType[]
) {
  return findTrustedAuthoritySource({
    rawQuery,
    result,
    sources,
    requiredSourceTypes,
  })
}

describe('detectSpecialistTopic', () => {
  it.each([
    ['请介绍系统性幼年特发性关节炎', 'sJIA'],
    ['SYSTEMIC JIA treatment', 'sJIA'],
    ['Systemic-Onset JIA guideline', 'sJIA'],
    ['What is systemic-onset juvenile idiopathic arthritis today?', 'sJIA'],
    ['FSHD latest research', 'FSHD'],
  ])('derives the specialist topic from raw query %s', (query, expected) => {
    expect(detectSpecialistTopic(query)).toBe(expected)
  })

  it.each(['AOSD treatment', "Still's disease", 'MAS', '其他 JIA 亚型'])(
    'does not infer sJIA from ambiguous raw query %s',
    query => {
      expect(detectSpecialistTopic(query)).toBeNull()
    }
  )

  it.each([
    'nonsJIA research',
    'non-sJIA research',
    'non sJIA research',
    'nonsystemic JIA overview',
    'non-systemic JIA overview',
    'non systemic JIA overview',
    '非系统性幼年特发性关节炎研究',
    '非全身型幼年特发性关节炎研究',
  ])(
    'does not infer sJIA when an approved alias is embedded in a larger English token: %s',
    query => {
      expect(detectSpecialistTopic(query)).toBeNull()
    }
  )
})

describe('isSecureSourceUrlMatch', () => {
  const exactSource = sourceEntry()

  it.each([
    'https://orpha.net/en/disease/detail/85414',
    'https://www.orpha.net/en/disease/detail/85414/',
    'https://orpha.net/en/disease/detail/85414?language=en',
    'https://www.orpha.net/en/disease/detail/85414/#overview',
  ])('accepts the exact registered HTTPS page with safe URL variation: %s', resultUrl => {
    expect(isSecureSourceUrlMatch(resultUrl, exactSource)).toBe(true)
  })

  it.each([
    'http://orpha.net/en/disease/detail/85414',
    'https://orpha.net.evil.example/en/disease/detail/85414',
    'https://child.orpha.net/en/disease/detail/85414',
    'https://orpha.net/en/disease/detail/85415',
    'https://orpha.net/en/disease/detail/85414/child',
    'https://orpha.net/?next=/en/disease/detail/85414',
    'https://orpha.net/#/en/disease/detail/85414',
    'not a URL',
  ])('rejects an insecure or non-matching exact URL: %s', resultUrl => {
    expect(isSecureSourceUrlMatch(resultUrl, exactSource)).toBe(false)
  })

  it('requires the registered source itself to use HTTPS', () => {
    expect(
      isSecureSourceUrlMatch(
        'https://orpha.net/en/disease/detail/85414',
        sourceEntry({ url: 'http://orpha.net/en/disease/detail/85414' })
      )
    ).toBe(false)
  })

  it.each([
    ['https://example.org/resources', true],
    ['https://www.example.org/resources/', true],
    ['https://example.org/resources/article', true],
    ['https://example.org/resources/article?q=anything#part', true],
    ['https://example.org/resources-lookalike', false],
    ['https://example.org/resource', false],
    ['https://news.example.org/resources/article', false],
  ])('enforces prefix path-segment and hostname boundaries for %s', (resultUrl, expected) => {
    const prefixSource = sourceEntry({
      domain: 'example.org',
      url: 'https://example.org/resources',
      pathMatch: 'prefix',
    })

    expect(isSecureSourceUrlMatch(resultUrl, prefixSource)).toBe(expected)
  })
})

describe('isSpecialistResultRelevant', () => {
  it('matches only aliases configured on the registered source', () => {
    const source = sourceEntry({
      url: 'https://systemicjia.org/',
      domain: 'systemicjia.org',
      sourceTypes: ['patient_org', 'treatment_update'],
      pathMatch: 'prefix',
    })

    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://systemicjia.org/research/update',
          title: 'New sJIA research update',
          summary: 'Foundation news',
        },
        source
      )
    ).toBe(true)
    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://systemicjia.org/unrelated?q=sJIA#systemic%20JIA',
          title: 'Unrelated article',
          summary: 'No matching disease name here',
        },
        source
      )
    ).toBe(false)
  })

  it.each([
    {
      title: 'nonsJIA research update',
      summary: 'Foundation news',
    },
    {
      title: 'nonsystemic JIA overview',
      summary: 'Foundation news',
    },
    {
      title: 'non-sJIA research update',
      summary: 'Foundation news',
    },
    {
      title: 'non systemic JIA overview',
      summary: 'Foundation news',
    },
    {
      title: '非系统性幼年特发性关节炎研究',
      summary: '基金会新闻',
    },
    {
      title: 'Systemic',
      summary: 'JIA guideline',
    },
  ])('rejects boundary and cross-field alias lookalikes: $title / $summary', result => {
    const source = sourceEntry({
      url: 'https://systemicjia.org/',
      domain: 'systemicjia.org',
      sourceTypes: ['patient_org'],
      pathMatch: 'prefix',
    })

    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://systemicjia.org/research/update',
          ...result,
        },
        source
      )
    ).toBe(false)
  })

  it('keeps Chinese aliases matchable inside a sentence', () => {
    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://systemicjia.org/zh/research',
          title: '基金会发布系统性幼年特发性关节炎研究动态',
          summary: '患者支持信息',
        },
        sourceEntry({
          url: 'https://systemicjia.org/',
          domain: 'systemicjia.org',
          sourceTypes: ['patient_org'],
          pathMatch: 'prefix',
        })
      )
    ).toBe(true)
  })

  it('accepts the exact Orphanet disease page via its registered fixed identifier', () => {
    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://orpha.net/en/disease/detail/85414',
          title: 'Rare disease detail',
          summary: 'Clinical overview',
        },
        sourceEntry()
      )
    ).toBe(true)
  })

  it('does not make the fixed Orphanet identifier a disease alias', () => {
    const source = sourceEntry({
      url: 'https://www.orpha.net/en/disease/detail/99999',
      sourceTypes: ['clinical_guideline'],
    })

    expect(
      isSpecialistResultRelevant(
        {
          url: 'https://www.orpha.net/en/disease/detail/99999?query=85414',
          title: '85414 appears in text but is not a configured alias',
          summary: '',
        },
        source
      )
    ).toBe(false)
  })

  it('requires a registered alias for an exact clinical-guideline landing page', () => {
    const source = sourceEntry({
      id: 'sjia-acr',
      name: 'American College of Rheumatology JIA guideline',
      domain: 'rheumatology.org',
      url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
      sourceTypes: ['clinical_guideline'],
    })

    expect(
      isSpecialistResultRelevant(
        {
          url: source.url,
          title: 'Juvenile Idiopathic Arthritis Guideline',
          summary: 'Official guideline landing page',
        },
        source
      )
    ).toBe(false)
    expect(
      isSpecialistResultRelevant(
        {
          url: `${source.url}?ref=home#recommendations`,
          title: 'Systemic JIA guideline',
          summary: 'Official guideline landing page',
        },
        source
      )
    ).toBe(true)
  })
})

describe('findTrustedAuthoritySource', () => {
  const acrSource = sourceEntry({
    id: 'sjia-acr',
    name: 'American College of Rheumatology JIA guideline',
    domain: 'rheumatology.org',
    url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
    sourceTypes: ['clinical_guideline'],
  })

  const acrResult = {
    url: 'https://www.rheumatology.org/juvenile-idiopathic-arthritis-guideline?ref=search',
    title: 'Systemic JIA guideline',
    summary: 'Guidance for systemic juvenile idiopathic arthritis',
  }

  it('requires enabled authority eligibility, deterministic topic, secure URL, role, and relevance', () => {
    expect(trustedLookup('sJIA 用药指南', acrResult, [acrSource], ['clinical_guideline'])).toBe(
      acrSource
    )
    expect(
      trustedLookup(
        'sJIA 用药指南',
        acrResult,
        [{ ...acrSource, enabled: false }],
        ['clinical_guideline']
      )
    ).toBeNull()
    expect(
      trustedLookup('sJIA 用药指南', acrResult, [{ ...acrSource, authorityEligible: false }])
    ).toBeNull()
    expect(
      trustedLookup('sJIA 用药指南', acrResult, [{ ...acrSource, topics: ['FSHD'] }])
    ).toBeNull()
    expect(trustedLookup('AOSD treatment', acrResult, [acrSource])).toBeNull()
    expect(trustedLookup('sJIA 用药指南', acrResult, [acrSource], ['treatment_update'])).toBeNull()
    expect(
      trustedLookup('sJIA 用药指南', { ...acrResult, url: 'https://rheumatology.org/unrelated' }, [
        acrSource,
      ])
    ).toBeNull()
  })

  it('does not trust an adversarial model alias absent from source.topicAliases', () => {
    const forgedAnalysis: SearchQueryAnalysis = {
      subject: 'sJIA',
      aliases: ['MODEL_ONLY_TOPIC_TOKEN'],
      intent: 'clinical_guidance',
      timeSensitivity: 'low',
      preferredSourceTypes: ['clinical_guideline'],
      deprioritizedSourceTypes: [],
      queryTerms: ['MODEL_ONLY_TOPIC_TOKEN'],
    }

    expect(
      trustedLookup(
        'sJIA 用药指南',
        {
          url: acrSource.url,
          title: forgedAnalysis.aliases[0]!,
          summary: 'Official guideline landing page',
        },
        [acrSource],
        forgedAnalysis.preferredSourceTypes
      )
    ).toBeNull()
  })
})
