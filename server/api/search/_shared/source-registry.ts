import rareInfoListContent from '../../../../rare_disease_bot/rare_info_list.txt?raw'
import type { AuthoritySourceType, SourceRegistryEntry } from '~/types/search'
import { listDiseaseAliases } from './disease-profiles'
import type { SearchRepositories } from './repositories'

export async function loadEnabledSourceRegistry(
  repositories: Pick<SearchRepositories, 'listRegisteredSources'>
): Promise<SourceRegistryEntry[]> {
  const databaseRegistry = await repositories.listRegisteredSources()
  const bundledRegistry = loadBundledSourceRegistry()

  if (databaseRegistry.length === 0) {
    return bundledRegistry.filter(entry => entry.enabled)
  }

  const trustedBundledRegistry = bundledRegistry.filter(isTrustedSpecialistSource)
  return mergeSourceRegistries(databaseRegistry, trustedBundledRegistry).filter(
    entry => entry.enabled
  )
}

export function loadBundledSourceRegistry(): SourceRegistryEntry[] {
  return parseRareInfoList(rareInfoListContent)
}

export function mergeSourceRegistries(
  databaseRegistry: SourceRegistryEntry[],
  bundledRegistry: SourceRegistryEntry[]
): SourceRegistryEntry[] {
  const mergedBySourceKey = new Map<string, SourceRegistryEntry>()

  for (const entry of databaseRegistry) {
    const sourceKey = buildCanonicalSourceRegistryKey(entry.url, entry.id)
    const existing = mergedBySourceKey.get(sourceKey)
    mergedBySourceKey.set(sourceKey, existing ? coalesceDatabaseEntries(existing, entry) : entry)
  }

  for (const bundledEntry of bundledRegistry) {
    const sourceKey = buildCanonicalSourceRegistryKey(bundledEntry.url, bundledEntry.id)
    const databaseEntry = mergedBySourceKey.get(sourceKey)

    if (!databaseEntry) {
      mergedBySourceKey.set(sourceKey, bundledEntry)
      continue
    }

    mergedBySourceKey.set(
      sourceKey,
      mergeDatabaseEntryWithBundledMetadata(databaseEntry, bundledEntry)
    )
  }

  return [...mergedBySourceKey.values()]
}

export function parseRareInfoList(content: string): SourceRegistryEntry[] {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const bySourceKey = new Map<string, SourceRegistryEntry>()

  for (const line of lines.slice(1)) {
    const columns = line.split('\t')
    if (columns.length < 6) continue

    const [
      category,
      name,
      url,
      description = '',
      region,
      language,
      notes = '',
      topics = '',
      topicAliases = '',
      authorityEligible = '',
      pathMatch = '',
    ] = columns
    if (!url.startsWith('http')) continue

    let domain = ''
    try {
      domain = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }

    const nextSourceTypes = mapCategoryToAuthoritySourceTypes(category, name, description, notes)
    const nextType = mapAuthoritySourceTypesToPrimary(nextSourceTypes)
    const sourceKey = buildCanonicalSourceRegistryKey(url, domain)
    const existing = bySourceKey.get(sourceKey)

    if (existing) {
      const mergedSourceTypes = [...new Set([...existing.sourceTypes, ...nextSourceTypes])]
      const preferredType = mapAuthoritySourceTypesToPrimary(mergedSourceTypes)
      bySourceKey.set(sourceKey, {
        ...existing,
        name: pickPreferredValue(existing.name, name),
        url: pickPreferredUrl(existing.url, url),
        sourceType: preferredType,
        sourceTypes: mergedSourceTypes,
        region: pickPreferredValue(existing.region, region),
        language: pickPreferredValue(existing.language, language),
        notes: pickPreferredNotes(existing.notes, notes),
      })
      continue
    }

    const parsedTopics = splitMetadataList(topics)
    bySourceKey.set(sourceKey, {
      id: sourceKey,
      name,
      domain,
      url,
      sourceType: nextType,
      sourceTypes: nextSourceTypes,
      region,
      language,
      priority: bySourceKey.size + 1,
      enabled: true,
      notes: notes || null,
      topics: parsedTopics,
      topicAliases: buildTopicAliases(parsedTopics, topicAliases),
      authorityEligible: authorityEligible === 'true',
      pathMatch: pathMatch === 'exact' ? 'exact' : 'prefix',
    })
  }

  return [...bySourceKey.values()]
}

function mapCategoryToAuthoritySourceTypes(
  category: string,
  name: string,
  description: string,
  notes: string
) {
  const combined = `${category} ${name} ${description} ${notes}`
  const sourceTypes = new Set<AuthoritySourceType>()

  if (/临床试验|trial/i.test(combined)) sourceTypes.add('clinical_trial')
  if (/临床指南|clinical guideline/i.test(combined)) sourceTypes.add('clinical_guideline')
  if (/药物|审批|prime|fda|ema|nmpa/i.test(combined)) sourceTypes.add('drug_approval')
  if (/政策|法规|医保|准入/i.test(combined)) sourceTypes.add('policy_access')
  if (/患者|社群|组织|协会|联盟|基金会|援助|society|association|foundation|support/i.test(combined))
    sourceTypes.add('patient_org')
  if (/期刊|文献|学术|journal|pubmed|gene/i.test(combined)) sourceTypes.add('research_publication')
  if (/资讯|新闻|progress|update|news/i.test(combined)) sourceTypes.add('treatment_update')
  if (/数据库|信息库|百科|omim|gard|orphanet|genereviews/i.test(combined))
    sourceTypes.add('disease_reference')

  if (sourceTypes.size === 0) {
    sourceTypes.add('treatment_update')
  }

  return [...sourceTypes]
}

function mapAuthoritySourceTypesToPrimary(
  sourceTypes: AuthoritySourceType[]
): SourceRegistryEntry['sourceType'] {
  if (sourceTypes.includes('clinical_guideline')) return 'reference'
  if (sourceTypes.includes('disease_reference')) return 'reference'
  if (sourceTypes.includes('research_publication')) return 'reference'
  if (sourceTypes.includes('clinical_trial')) return 'clinical_trial'
  if (sourceTypes.includes('drug_approval')) return 'drug_approval'
  if (sourceTypes.includes('policy_access')) return 'policy'
  if (sourceTypes.includes('patient_org')) return 'patient_support'
  return 'news'
}

function splitMetadataList(value: string) {
  return value
    .split('|')
    .map(item => item.trim())
    .filter(Boolean)
}

function buildTopicAliases(topics: string[], configuredAliases: string) {
  return [
    ...new Set([
      ...topics.flatMap(topic => listDiseaseAliases(topic)),
      ...splitMetadataList(configuredAliases),
    ]),
  ]
}

function pickPreferredValue(current: string, next: string) {
  return current || next
}

function pickPreferredNotes(current: string | null, next: string) {
  return current || next || null
}

function pickPreferredUrl(current: string, next: string) {
  const currentPath = safePathname(current)
  const nextPath = safePathname(next)
  if (currentPath === '/' && nextPath !== '/') return next
  if (nextPath.length > currentPath.length) return next
  return current
}

function safePathname(value: string) {
  try {
    return new URL(value).pathname || '/'
  } catch {
    return '/'
  }
}

function mergeDatabaseEntryWithBundledMetadata(
  databaseEntry: SourceRegistryEntry,
  bundledEntry: SourceRegistryEntry
): SourceRegistryEntry {
  if (!isTrustedSpecialistSource(bundledEntry)) return databaseEntry

  return {
    ...databaseEntry,
    sourceType: bundledEntry.sourceType,
    sourceTypes: [...bundledEntry.sourceTypes],
    topics: [...bundledEntry.topics],
    topicAliases: [...bundledEntry.topicAliases],
    authorityEligible: bundledEntry.authorityEligible,
    pathMatch: bundledEntry.pathMatch,
  }
}

function coalesceDatabaseEntries(
  left: SourceRegistryEntry,
  right: SourceRegistryEntry
): SourceRegistryEntry {
  const preferred = compareDatabaseEntries(left, right) <= 0 ? left : right
  return {
    ...preferred,
    priority: Math.min(left.priority, right.priority),
    enabled: left.enabled && right.enabled,
  }
}

function compareDatabaseEntries(left: SourceRegistryEntry, right: SourceRegistryEntry) {
  return (
    left.priority - right.priority ||
    left.id.localeCompare(right.id) ||
    left.url.localeCompare(right.url)
  )
}

function isTrustedSpecialistSource(entry: SourceRegistryEntry) {
  return entry.authorityEligible && entry.topics.length > 0
}

function buildCanonicalSourceRegistryKey(url: string, fallback: string) {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.replace(/^www\./i, '')
    const path = normalizeSourcePath(parsedUrl.pathname)
    return `${hostname}${path === '/' ? '' : path}`
  } catch {
    return `invalid:${fallback}`
  }
}

function normalizeSourcePath(pathname: string) {
  if (pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}
