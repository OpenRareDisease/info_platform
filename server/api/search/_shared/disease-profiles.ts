import type { AuthoritySourceType, SearchQueryIntent } from '~/types/search'

interface DiseaseProfile {
  canonical: string
  aliases: readonly string[]
  authoritySourceTypeOverrides?: Partial<Record<SearchQueryIntent, readonly AuthoritySourceType[]>>
  treatmentQueriesUseClinicalGuidance?: boolean
}

export const DISEASE_PROFILES: readonly DiseaseProfile[] = [
  {
    canonical: 'FSHD',
    aliases: [
      'FSHD',
      'facioscapulohumeral muscular dystrophy',
      'facioscapulohumeral dystrophy',
      '面肩肱型肌营养不良',
      '面肩肱肌营养不良',
    ],
  },
  {
    canonical: 'sJIA',
    aliases: [
      'sJIA',
      'systemic JIA',
      'systemic-onset JIA',
      'systemic juvenile idiopathic arthritis',
      'systemic-onset juvenile idiopathic arthritis',
      '系统性幼年特发性关节炎',
      '全身型幼年特发性关节炎',
    ],
    authoritySourceTypeOverrides: {
      clinical_trial: ['treatment_update'],
    },
    treatmentQueriesUseClinicalGuidance: true,
  },
  {
    canonical: 'Hemophilia',
    aliases: [
      'hemophilia',
      'haemophilia',
      'hemophilia A',
      'hemophilia B',
      '血友病',
      '血友病A',
      '血友病B',
      '血友',
    ],
  },
  {
    canonical: 'DMD',
    aliases: [
      'DMD',
      'Duchenne muscular dystrophy',
      'Duchenne dystrophy',
      '杜氏肌营养不良',
      '杜氏肌营养不良症',
    ],
  },
  {
    canonical: 'Acromegaly',
    aliases: ['acromegaly', '肢端肥大症'],
  },
  {
    canonical: 'Narcolepsy',
    aliases: ['narcolepsy', '发作性睡病'],
  },
]

export function findDiseaseProfile(value: string): DiseaseProfile | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined

  return DISEASE_PROFILES.find(
    profile =>
      profile.canonical.toLowerCase() === normalized ||
      profile.aliases.some(alias => alias.toLowerCase() === normalized)
  )
}

export function findExplicitDiseaseProfile(value: string): DiseaseProfile | undefined {
  return DISEASE_PROFILES.find(profile =>
    profile.aliases.some(alias => containsExplicitDiseaseAlias(value, alias))
  )
}

export function listDiseaseAliases(subject: string) {
  return findDiseaseProfile(subject)?.aliases.slice() || (subject.trim() ? [subject.trim()] : [])
}

export function getAuthoritySourceTypesForIntent(
  subject: string | null | undefined,
  intent: SearchQueryIntent | undefined
): AuthoritySourceType[] {
  const override =
    subject && intent
      ? findDiseaseProfile(subject)?.authoritySourceTypeOverrides?.[intent]
      : undefined

  if (override) return [...override]
  return defaultAuthoritySourceTypesForIntent(intent)
}

export function usesClinicalGuidanceForTreatmentQuery(subject: string) {
  return Boolean(findDiseaseProfile(subject)?.treatmentQueriesUseClinicalGuidance)
}

export function containsExplicitDiseaseAlias(value: string, alias: string) {
  const normalizedValue = value.toLowerCase()
  const normalizedAlias = alias.trim().toLowerCase()
  if (!normalizedAlias) return false

  let matchIndex = normalizedValue.indexOf(normalizedAlias)
  while (matchIndex >= 0) {
    const before = normalizedValue[matchIndex - 1] || ''
    const after = normalizedValue[matchIndex + normalizedAlias.length] || ''
    const hasTokenBoundary =
      containsCjk(normalizedAlias) ||
      (!isAsciiWordCharacter(before) && !isAsciiWordCharacter(after))

    if (hasTokenBoundary && !isNegatedOccurrence(normalizedValue, matchIndex)) return true
    matchIndex = normalizedValue.indexOf(normalizedAlias, matchIndex + 1)
  }

  return false
}

function defaultAuthoritySourceTypesForIntent(
  intent: SearchQueryIntent | undefined
): AuthoritySourceType[] {
  if (intent === 'clinical_guidance') return ['clinical_guideline']
  if (intent === 'treatment_update' || intent === 'research_progress') return ['treatment_update']
  if (intent === 'clinical_trial') return ['clinical_trial']
  if (intent === 'drug_approval') return ['drug_approval']
  if (intent === 'policy_access') return ['policy_access']
  if (intent === 'patient_support') return ['patient_org']
  return ['disease_reference']
}

function isNegatedOccurrence(value: string, matchIndex: number) {
  const prefix = value.slice(0, matchIndex)
  return /(?:^|[^a-z0-9_])non(?:[\s-]*)$/i.test(prefix) || /非\s*$/u.test(prefix)
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value)
}

function isAsciiWordCharacter(value: string) {
  return /^[a-z0-9_]$/i.test(value)
}
