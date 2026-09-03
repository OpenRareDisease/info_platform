import type { AuthoritySourceType, SourceRegistryEntry } from '~/types/search'
import { containsExplicitDiseaseAlias, matchExplicitDiseaseSubject } from './query-normalization'

export interface AuthorityResultCandidate {
  url: string
  title?: string
  summary?: string
}

export interface TrustedAuthorityLookup {
  rawQuery: string
  result: AuthorityResultCandidate
  sources: readonly SourceRegistryEntry[]
  requiredSourceTypes?: readonly AuthoritySourceType[]
}

export function detectSpecialistTopic(rawQuery: string): string | null {
  return matchExplicitDiseaseSubject(rawQuery) || null
}

export function isSecureSourceUrlMatch(
  resultUrl: string,
  source: Pick<SourceRegistryEntry, 'url' | 'pathMatch'>
): boolean {
  const result = parseUrl(resultUrl)
  const registered = parseUrl(source.url)
  if (!result || !registered) return false
  if (result.protocol !== 'https:' || registered.protocol !== 'https:') return false
  if (normalizeHostname(result.hostname) !== normalizeHostname(registered.hostname)) return false

  const resultPath = normalizePathname(result.pathname)
  const registeredPath = normalizePathname(registered.pathname)

  if (source.pathMatch === 'exact') return resultPath === registeredPath
  if (registeredPath === '/') return true
  return resultPath === registeredPath || resultPath.startsWith(`${registeredPath}/`)
}

export function isSpecialistResultRelevant(
  result: AuthorityResultCandidate,
  source: Pick<SourceRegistryEntry, 'url' | 'sourceTypes' | 'topicAliases' | 'pathMatch'>
): boolean {
  const resultUrl = parseUrl(result.url)
  if (!resultUrl) return false

  const relevantFields = [
    result.title || '',
    result.summary || '',
    decodePathname(resultUrl.pathname),
  ]
  const hasRegisteredAlias = relevantFields.some(field =>
    source.topicAliases.some(alias => containsExplicitDiseaseAlias(field, alias))
  )
  if (hasRegisteredAlias) return true

  const fixedIdentifier = getExactDiseaseReferenceIdentifier(source)
  return (
    fixedIdentifier !== null &&
    isSecureSourceUrlMatch(result.url, source) &&
    normalizePathname(resultUrl.pathname).split('/').at(-1) === fixedIdentifier
  )
}

export function findTrustedAuthoritySource({
  rawQuery,
  result,
  sources,
  requiredSourceTypes,
}: TrustedAuthorityLookup): SourceRegistryEntry | null {
  const topic = detectSpecialistTopic(rawQuery)
  if (!topic) return null

  return (
    sources.find(source => {
      if (!source.enabled || !source.authorityEligible) return false
      if (!source.topics.some(sourceTopic => sameText(sourceTopic, topic))) return false
      if (
        requiredSourceTypes?.length &&
        !source.sourceTypes.some(type => requiredSourceTypes.includes(type))
      ) {
        return false
      }
      if (!isSecureSourceUrlMatch(result.url, source)) return false
      return isSpecialistResultRelevant(result, source)
    }) || null
  )
}

function getExactDiseaseReferenceIdentifier(
  source: Pick<SourceRegistryEntry, 'url' | 'sourceTypes' | 'pathMatch'>
): string | null {
  if (source.pathMatch !== 'exact' || !source.sourceTypes.includes('disease_reference')) return null

  const registeredUrl = parseUrl(source.url)
  if (!registeredUrl || registeredUrl.protocol !== 'https:') return null

  const identifier = normalizePathname(registeredUrl.pathname).split('/').at(-1) || ''
  return /^\d+$/.test(identifier) ? identifier : null
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '')
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}
