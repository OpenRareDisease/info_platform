import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  loadBundledSourceRegistry,
  loadEnabledSourceRegistry,
  mergeSourceRegistries,
  parseRareInfoList,
} from './source-registry'
import type { SourceRegistryEntry } from '~/types/search'

const enabledDatabaseEntry: SourceRegistryEntry = {
  id: 'enabled-db-source',
  name: 'Enabled database source',
  domain: 'enabled.example.com',
  url: 'https://enabled.example.com',
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
}

function registryEntry(overrides: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    ...enabledDatabaseEntry,
    id: 'registry-entry',
    name: 'Registry entry',
    domain: 'untrusted-domain.example.com',
    url: 'https://registry.example.com/',
    priority: 99,
    ...overrides,
  }
}

function canonicalSourceKey(url: string) {
  const parsedUrl = new URL(url)
  const hostname = parsedUrl.hostname.replace(/^www\./i, '')
  const path = parsedUrl.pathname.replace(/\/+$/, '')
  return `${hostname}${path === '/' ? '' : path}`
}

describe('parseRareInfoList', () => {
  it('merges canonical URL variants while preserving a disabled database tombstone', () => {
    const databaseEntry = registryEntry({
      id: 'db-orphanet-tombstone',
      name: 'Database Orphanet entry',
      domain: 'not-the-real-host.example.com',
      url: 'http://orpha.net/en/disease/detail/85414/?ignored=true#fragment',
      priority: 7,
      enabled: false,
      topics: [],
      topicAliases: [],
      authorityEligible: false,
      pathMatch: 'prefix',
    })
    const bundledEntry = registryEntry({
      id: 'file-orphanet-specialist',
      name: 'Orphanet ORPHA:85414',
      domain: 'orpha.net',
      url: 'https://www.orpha.net/en/disease/detail/85414',
      priority: 1,
      enabled: true,
      topics: ['sJIA'],
      topicAliases: ['sJIA', 'systemic juvenile idiopathic arthritis'],
      authorityEligible: true,
      pathMatch: 'exact',
    })

    const merged = mergeSourceRegistries([databaseEntry], [bundledEntry])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(
      expect.objectContaining({
        id: 'db-orphanet-tombstone',
        url: databaseEntry.url,
        priority: 7,
        enabled: false,
        topics: ['sJIA'],
        topicAliases: ['sJIA', 'systemic juvenile idiopathic arthritis'],
        authorityEligible: true,
        pathMatch: 'exact',
      })
    )
  })

  it('coalesces enabled and disabled database duplicates order-independently', () => {
    const enabledDuplicate = registryEntry({
      id: 'db-enabled-preferred',
      url: 'https://www.orpha.net/en/disease/detail/85414/',
      priority: 2,
      enabled: true,
    })
    const disabledDuplicate = registryEntry({
      id: 'db-disabled-tombstone',
      url: 'http://orpha.net/en/disease/detail/85414?legacy=true#record',
      priority: 8,
      enabled: false,
    })
    const bundledEntry = registryEntry({
      id: 'bundled-orphanet',
      url: 'https://www.orpha.net/en/disease/detail/85414',
      sourceType: 'reference',
      sourceTypes: ['disease_reference'],
      priority: 1,
      topics: ['sJIA'],
      topicAliases: ['sJIA'],
      authorityEligible: true,
      pathMatch: 'exact',
    })

    const forward = mergeSourceRegistries([enabledDuplicate, disabledDuplicate], [bundledEntry])
    const reversed = mergeSourceRegistries([disabledDuplicate, enabledDuplicate], [bundledEntry])

    for (const merged of [forward, reversed]) {
      expect(merged).toHaveLength(1)
      expect(merged[0]).toMatchObject({
        id: 'db-enabled-preferred',
        priority: 2,
        enabled: false,
      })
    }
  })

  it('uses bundled trust metadata and fixed roles for a canonical specialist source', () => {
    const databaseEntry = registryEntry({
      id: 'db-malicious-orphanet',
      url: 'https://orpha.net/en/disease/detail/85414?legacy=true',
      sourceType: 'clinical_trial',
      sourceTypes: ['clinical_trial'],
      priority: 4,
      enabled: true,
      topics: ['AOSD'],
      topicAliases: ['Still disease', 'AOSD'],
      authorityEligible: false,
      pathMatch: 'prefix',
    })
    const bundledEntry = registryEntry({
      id: 'bundled-orphanet',
      url: 'https://www.orpha.net/en/disease/detail/85414',
      sourceType: 'reference',
      sourceTypes: ['disease_reference'],
      priority: 1,
      topics: ['sJIA'],
      topicAliases: ['sJIA', 'systemic juvenile idiopathic arthritis'],
      authorityEligible: true,
      pathMatch: 'exact',
    })

    expect(mergeSourceRegistries([databaseEntry], [bundledEntry])[0]).toMatchObject({
      id: 'db-malicious-orphanet',
      priority: 4,
      enabled: true,
      sourceType: 'reference',
      sourceTypes: ['disease_reference'],
      topics: ['sJIA'],
      topicAliases: ['sJIA', 'systemic juvenile idiopathic arthritis'],
      authorityEligible: true,
      pathMatch: 'exact',
    })
  })

  it('restores fixed FSHD Society roles when a database duplicate has empty roles', () => {
    const databaseEntry = registryEntry({
      id: 'db-fshd-society',
      url: 'https://fshdsociety.org/',
      sourceType: 'patient_support',
      sourceTypes: [],
      priority: 3,
      topics: ['wrong-topic'],
      topicAliases: ['Still disease'],
      authorityEligible: false,
    })
    const bundledEntry = loadBundledSourceRegistry().find(
      entry => entry.url === 'https://www.fshdsociety.org'
    )

    expect(bundledEntry).toBeDefined()
    expect(mergeSourceRegistries([databaseEntry], [bundledEntry!])[0]).toMatchObject({
      id: 'db-fshd-society',
      priority: 3,
      enabled: true,
      sourceType: 'patient_support',
      sourceTypes: ['patient_org', 'treatment_update'],
      topics: ['FSHD'],
      authorityEligible: true,
    })
  })

  it('returns every bundled source when the database is empty', async () => {
    const listRegisteredSources = vi.fn().mockResolvedValue([])

    const registry = await loadEnabledSourceRegistry({ listRegisteredSources })

    expect(listRegisteredSources).toHaveBeenCalledOnce()
    expect(registry).toEqual(loadBundledSourceRegistry())
  })

  it('merges the trusted bundled sJIA sources when the database is nonempty', async () => {
    const listRegisteredSources = vi.fn().mockResolvedValue([enabledDatabaseEntry])
    const ordinaryBundledSource = loadBundledSourceRegistry().find(
      entry => entry.url === 'https://omim.org'
    )

    const registry = await loadEnabledSourceRegistry({ listRegisteredSources })

    expect(ordinaryBundledSource).toEqual(
      expect.objectContaining({
        authorityEligible: false,
        topics: [],
      })
    )
    expect(registry).toEqual(
      expect.arrayContaining([
        enabledDatabaseEntry,
        expect.objectContaining({ url: 'https://www.systemicjia.org/' }),
        expect.objectContaining({
          url: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
        }),
        expect.objectContaining({ url: 'https://www.orpha.net/en/disease/detail/85414' }),
      ])
    )
    expect(registry).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ url: ordinaryBundledSource?.url })])
    )
  })

  it('keeps a disabled canonical Orphanet duplicate disabled after merging trusted bundled sources', async () => {
    const orphanetTombstone = registryEntry({
      id: 'disabled-orphanet-tombstone',
      url: 'http://orpha.net/en/disease/detail/85414/?ignored=true#fragment',
      enabled: false,
    })
    const listRegisteredSources = vi.fn().mockResolvedValue([orphanetTombstone])

    const registry = await loadEnabledSourceRegistry({ listRegisteredSources })

    expect(registry.map(entry => entry.url)).toEqual(
      expect.arrayContaining([
        'https://www.systemicjia.org/',
        'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
      ])
    )
    expect(registry.every(entry => entry.enabled)).toBe(true)
    expect(registry.map(entry => canonicalSourceKey(entry.url))).not.toContain(
      'orpha.net/en/disease/detail/85414'
    )
  })

  it('loads the three sJIA sources from the bundled registry outside the source checkout', () => {
    const cwd = vi
      .spyOn(process, 'cwd')
      .mockReturnValue('/tmp/nitro-runtime-without-source-checkout')

    try {
      const registry = loadBundledSourceRegistry()

      expect(registry.map(entry => entry.url)).toEqual(
        expect.arrayContaining([
          'https://www.systemicjia.org/',
          'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
          'https://www.orpha.net/en/disease/detail/85414',
        ])
      )
    } finally {
      cwd.mockRestore()
    }
  })

  it('parses specialist metadata from an 11-column registry row', () => {
    const content = [
      '分类\t网站名称\t网址\t主要功能\t覆盖范围\t语言\t备注\t适用主题\t主题别名\t可作为权威来源\t路径匹配方式',
      '临床指南\tFSHD 指南\thttps://guidelines.example.com/fshd\t诊疗建议\t全球\t英语\t\tFSHD|肌营养不良\t面肩肱型肌营养不良|facioscapulohumeral muscular dystrophy\ttrue\texact',
    ].join('\n')

    const registry = parseRareInfoList(content)

    expect(registry[0]).toMatchObject({
      sourceType: 'reference',
      sourceTypes: ['clinical_guideline'],
      topics: ['FSHD', '肌营养不良'],
      topicAliases: expect.arrayContaining([
        'FSHD',
        '面肩肱型肌营养不良',
        'facioscapulohumeral muscular dystrophy',
      ]),
      authorityEligible: true,
      pathMatch: 'exact',
    })
  })

  it('inherits topic aliases from the shared disease profile when an authority row only names its topic', () => {
    const content = [
      '分类\t网站名称\t网址\t主要功能\t覆盖范围\t语言\t备注\t适用主题\t主题别名\t可作为权威来源\t路径匹配方式',
      '最新资讯\tFSHD Society\thttps://www.fshdsociety.org\t研究进展\t全球\t英语\t\tFSHD\t\ttrue\tprefix',
    ].join('\n')

    const registry = parseRareInfoList(content)

    expect(registry[0]?.topicAliases).toEqual(
      expect.arrayContaining([
        'FSHD',
        'facioscapulohumeral muscular dystrophy',
        '面肩肱型肌营养不良',
      ])
    )
  })

  it('defaults specialist metadata for legacy registry rows', () => {
    const content = [
      '分类\t网站名称\t网址\t主要功能\t覆盖范围\t语言\t备注',
      '数据库\tLegacy reference\thttps://legacy.example.com\t疾病百科\t全球\t英语\t',
    ].join('\n')

    const registry = parseRareInfoList(content)

    expect(registry[0]).toMatchObject({
      topics: [],
      topicAliases: [],
      authorityEligible: false,
      pathMatch: 'prefix',
    })
  })

  it('prefers reference-style categories over duplicated drug approval rows for the same domain', () => {
    const content = [
      '分类\t名称\tURL\t备注\t区域\t语言\t说明',
      '药物审批\tOrphanet\thttps://www.orpha.net/en\t\tglobal\ten\t审批入口',
      '数据库\tOrphanet\thttps://www.orpha.net/en/disease\t\tglobal\ten\t百科入口',
      '学术\tBioBuzz\thttps://www.biobuzz.io\t\tglobal\ten\t行业资讯',
    ].join('\n')

    const registry = parseRareInfoList(content)
    const orpha = registry.find(entry => entry.url === 'https://www.orpha.net/en/disease')

    expect(orpha?.sourceType).toBe('reference')
    expect(orpha?.url).toBe('https://www.orpha.net/en/disease')
  })

  it('keeps multiple entry paths for the same domain instead of collapsing them into one record', () => {
    const content = [
      '分类\t名称\tURL\t备注\t区域\t语言\t说明',
      '数据库/信息库\tNORD 罕见病数据库\thttps://rarediseases.org/rare-diseases\t\t美国\ten\t疾病百科入口',
      '患者援助\tNORD 患者援助项目\thttps://rarediseases.org/patients/help-now/\t\t美国\ten\t患者援助入口',
      '患者组织/社群\tNORD 会员网络\thttps://rarediseases.org/organizations\t\t美国\ten\t组织目录入口',
    ].join('\n')

    const registry = parseRareInfoList(content)
    const nordEntries = registry.filter(entry => entry.domain === 'rarediseases.org')

    expect(nordEntries).toHaveLength(3)
    expect(nordEntries.map(entry => entry.url)).toEqual(
      expect.arrayContaining([
        'https://rarediseases.org/rare-diseases',
        'https://rarediseases.org/patients/help-now/',
        'https://rarediseases.org/organizations',
      ])
    )
  })

  it('classifies society-style specialist sources as patient organizations and updates', () => {
    const content = [
      '分类\t网站名称\t网址\t主要功能\t覆盖范围\t语言\t备注',
      '最新资讯\tFSHD Society\thttps://www.fshdsociety.org\tFSHD 专病组织新闻、研究资助、临床项目更新\t全球\t英语\t对 FSHD 等专病进展检索更高相关',
    ].join('\n')

    const registry = parseRareInfoList(content)

    expect(registry[0]).toEqual(
      expect.objectContaining({
        sourceType: 'patient_support',
        sourceTypes: ['patient_org', 'treatment_update'],
      })
    )
  })

  it('parses the verified sJIA and FSHD specialist rows from the real registry', async () => {
    const content = await readFile(
      resolve(process.cwd(), 'rare_disease_bot/rare_info_list.txt'),
      'utf-8'
    )
    const registry = parseRareInfoList(content)

    expect(registry.find(entry => entry.url === 'https://www.systemicjia.org/')).toEqual(
      expect.objectContaining({
        name: 'Systemic JIA Foundation',
        sourceTypes: ['patient_org', 'treatment_update'],
        topics: ['sJIA'],
        topicAliases: [
          'sJIA',
          'systemic JIA',
          'systemic-onset JIA',
          'systemic juvenile idiopathic arthritis',
          'systemic-onset juvenile idiopathic arthritis',
          '系统性幼年特发性关节炎',
          '全身型幼年特发性关节炎',
        ],
        authorityEligible: true,
        pathMatch: 'prefix',
      })
    )
    expect(
      registry.find(
        entry => entry.url === 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline'
      )
    ).toEqual(
      expect.objectContaining({
        name: 'American College of Rheumatology JIA Guideline',
        sourceTypes: ['clinical_guideline'],
        topics: ['sJIA'],
        topicAliases: [
          'sJIA',
          'systemic JIA',
          'systemic-onset JIA',
          'systemic juvenile idiopathic arthritis',
          'systemic-onset juvenile idiopathic arthritis',
          '系统性幼年特发性关节炎',
          '全身型幼年特发性关节炎',
        ],
        authorityEligible: true,
        pathMatch: 'exact',
      })
    )
    expect(
      registry.find(entry => entry.url === 'https://www.orpha.net/en/disease/detail/85414')
    ).toEqual(
      expect.objectContaining({
        name: 'Orphanet ORPHA:85414',
        sourceTypes: ['disease_reference'],
        topics: ['sJIA'],
        topicAliases: [
          'sJIA',
          'systemic JIA',
          'systemic-onset JIA',
          'systemic juvenile idiopathic arthritis',
          'systemic-onset juvenile idiopathic arthritis',
          '系统性幼年特发性关节炎',
          '全身型幼年特发性关节炎',
        ],
        authorityEligible: true,
        pathMatch: 'exact',
      })
    )
    expect(registry.find(entry => entry.url === 'https://www.fshdsociety.org')).toEqual(
      expect.objectContaining({
        name: 'FSHD Society',
        sourceTypes: ['patient_org', 'treatment_update'],
        topics: ['FSHD'],
        topicAliases: [
          'FSHD',
          'facioscapulohumeral muscular dystrophy',
          'facioscapulohumeral dystrophy',
          '面肩肱型肌营养不良',
          '面肩肱肌营养不良',
        ],
        authorityEligible: true,
        pathMatch: 'prefix',
      })
    )

    const sjiaEntries = registry.filter(entry => entry.topics.includes('sJIA'))
    expect(sjiaEntries).toHaveLength(3)
    expect(sjiaEntries.flatMap(entry => entry.topicAliases)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/still|aosd|mas/i)])
    )
  })

  it('registers two authority-qualified, role-complementary sources for each added disease', async () => {
    const content = await readFile(
      resolve(process.cwd(), 'rare_disease_bot/rare_info_list.txt'),
      'utf-8'
    )
    const registry = parseRareInfoList(content)

    expect(registry.filter(entry => entry.topics.includes('Hemophilia'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://guidelines.wfh.org/guidelines/',
          sourceTypes: ['clinical_guideline'],
          authorityEligible: true,
          topicAliases: expect.arrayContaining(['血友病', 'hemophilia A', 'hemophilia B']),
        }),
        expect.objectContaining({
          url: 'https://wfh.org/treatment-and-care/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
        expect.objectContaining({
          url: 'https://wfh.org/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
        expect.objectContaining({
          url: 'https://www.bleeding.org/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
      ])
    )
    expect(registry.filter(entry => entry.topics.includes('DMD'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://www.parentprojectmd.org/care/care-guidelines/',
          sourceTypes: ['clinical_guideline'],
          authorityEligible: true,
          topicAliases: expect.arrayContaining(['杜氏肌营养不良', 'Duchenne muscular dystrophy']),
        }),
        expect.objectContaining({
          url: 'https://www.mda.org/disease/duchenne-muscular-dystrophy',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
        expect.objectContaining({
          url: 'https://cureduchenne.org/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
      ])
    )
    expect(registry.filter(entry => entry.topics.includes('Acromegaly'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://pituitarysociety.org/guidelines/',
          sourceTypes: ['clinical_guideline'],
          authorityEligible: true,
          topicAliases: expect.arrayContaining(['肢端肥大症']),
        }),
        expect.objectContaining({
          url: 'https://acromegalycommunity.org/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
        expect.objectContaining({
          url: 'https://pituitary.org/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
        expect.objectContaining({
          url: 'https://www.endocrine.org/journals/endocrine-reviews/medical-treatment-of-acromegaly',
          sourceTypes: ['research_publication', 'treatment_update'],
          authorityEligible: true,
        }),
      ])
    )
    expect(registry.filter(entry => entry.topics.includes('Narcolepsy'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://aasm.org/wp-content/uploads/2022/03/Treatment_Central_Disorders_Hypersomnolence_Guideline_at_a_Glance.pdf',
          sourceTypes: ['clinical_guideline'],
          authorityEligible: true,
          topicAliases: expect.arrayContaining(['发作性睡病']),
        }),
        expect.objectContaining({
          url: 'https://project-sleep.com/',
          sourceTypes: ['patient_org', 'treatment_update'],
          authorityEligible: true,
        }),
      ])
    )
  })
})
