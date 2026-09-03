import {
  containsExplicitDiseaseAlias,
  findExplicitDiseaseProfile,
  listDiseaseAliases,
} from './disease-profiles'

export { containsExplicitDiseaseAlias }

export function normalizeSearchQuery(query: string) {
  const trimmed = query.trim()
  const subject = findSubject(trimmed)

  return {
    resolvedSubject: subject,
    localQuery: subject || trimmed,
    effectiveQuery: trimmed,
  }
}

export function getSubjectAliases(subject: string) {
  return listDiseaseAliases(subject)
}

export function matchExplicitDiseaseSubject(message: string) {
  return findExplicitDiseaseProfile(message)?.canonical || ''
}

function findSubject(message: string) {
  return matchExplicitDiseaseSubject(message)
}
