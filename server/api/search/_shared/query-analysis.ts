import {
  AUTHORITY_SOURCE_TYPES,
  SEARCH_QUERY_INTENTS,
  type AuthoritySourceType,
  type SearchQueryAnalysis,
  type SearchQueryIntent,
} from '~/types/search'
import {
  findExplicitDiseaseProfile,
  usesClinicalGuidanceForTreatmentQuery,
} from './disease-profiles'
import { getSubjectAliases, normalizeSearchQuery } from './query-normalization'

const RECENCY_PATTERN =
  /最新|进展|近期|更新|研究动态|recent|latest|\bnew\b|\bupdate\b|\bprogress\b/i

export async function analyzeSearchQuery(query: string): Promise<SearchQueryAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.MODEL_NAME || 'gpt-4o-mini'

  if (!apiKey) {
    return fallbackAnalyzeSearchQuery(query)
  }

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You analyze rare-disease search queries. Return only valid JSON with keys: subject, aliases, intent, timeSensitivity, preferredSourceTypes, deprioritizedSourceTypes, queryTerms.',
          },
          {
            role: 'user',
            content: `Query: ${query}

Supported intents: disease_overview, clinical_guidance, treatment_update, clinical_trial, drug_approval, policy_access, patient_support, research_progress.
Supported source types: disease_reference, clinical_guideline, treatment_update, clinical_trial, drug_approval, policy_access, patient_org, research_publication.
Return only compact JSON.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      return fallbackAnalyzeSearchQuery(query)
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    }

    const content = data.choices?.[0]?.message?.content?.trim() || ''
    return normalizeAnalysis(JSON.parse(extractJsonObject(content)), query)
  } catch {
    return fallbackAnalyzeSearchQuery(query)
  }
}

export function fallbackAnalyzeSearchQuery(query: string): SearchQueryAnalysis {
  const normalized = normalizeSearchQuery(query)
  const lowered = query.toLowerCase()
  const subject = normalized.resolvedSubject || query.trim()
  const intent = inferIntent(lowered)
  const timeSensitivity = hasExplicitRecency(lowered) ? 'high' : 'medium'

  return {
    subject,
    aliases: getSubjectAliases(subject),
    intent,
    timeSensitivity,
    preferredSourceTypes: preferredSourceTypesForIntent(intent),
    deprioritizedSourceTypes: deprioritizedSourceTypesForIntent(intent),
    queryTerms: buildQueryTerms(subject, query, intent),
  }
}

function extractJsonObject(content: string) {
  const match = content.match(/\{[\s\S]*\}/)
  return match?.[0] || '{}'
}

function normalizeAnalysis(value: Record<string, unknown>, query: string): SearchQueryAnalysis {
  const fallback = fallbackAnalyzeSearchQuery(query)
  const normalizedQuery = normalizeSearchQuery(query)
  const modelSubject = asString(value.subject)
  const modelAliases = asStringArray(value.aliases)
  const hasExplicitSubject = Boolean(normalizedQuery.resolvedSubject)
  const modelClaimsRegisteredDisease = Boolean(findExplicitDiseaseProfile(modelSubject))
  const explicitIntent = inferExplicitIntent(query.toLowerCase())
  const subject = hasExplicitSubject
    ? normalizedQuery.resolvedSubject
    : modelClaimsRegisteredDisease
      ? fallback.subject
      : modelSubject || fallback.subject
  const intent = explicitIntent || asIntent(value.intent) || fallback.intent

  return {
    subject,
    aliases: hasExplicitSubject
      ? getSubjectAliases(subject)
      : modelClaimsRegisteredDisease
        ? fallback.aliases
        : modelAliases.length
          ? modelAliases.filter(alias => !findExplicitDiseaseProfile(alias))
          : fallback.aliases,
    intent,
    timeSensitivity: hasExplicitRecency(query)
      ? 'high'
      : asTimeSensitivity(value.timeSensitivity) || fallback.timeSensitivity,
    preferredSourceTypes: explicitIntent
      ? preferredSourceTypesForIntent(intent)
      : normalizeSourceTypes(value.preferredSourceTypes, preferredSourceTypesForIntent(intent)),
    deprioritizedSourceTypes: explicitIntent
      ? deprioritizedSourceTypesForIntent(intent)
      : normalizeSourceTypes(
          value.deprioritizedSourceTypes,
          deprioritizedSourceTypesForIntent(intent)
        ),
    queryTerms: buildQueryTerms(subject, query, intent),
  }
}

function inferIntent(query: string): SearchQueryIntent {
  return inferExplicitIntent(query) || 'disease_overview'
}

function inferExplicitIntent(query: string): SearchQueryIntent | null {
  if (hasExplicitRecency(query)) return 'treatment_update'
  if (/trial|临床试验|nct|招募/.test(query)) return 'clinical_trial'
  if (/approval|审批|获批|上市|fda|ema|nmpa/.test(query)) return 'drug_approval'
  if (/医保|报销|援助|政策|准入/.test(query)) return 'policy_access'
  if (/患者支持|患者组织|基金会|协会|support|help/.test(query)) return 'patient_support'
  if (/研究|机制|论文|文献|biomarker|gene/.test(query)) return 'research_progress'
  if (/指南|怎么治疗|如何治疗|治疗指南|guideline|clinical guidance/.test(query)) {
    return 'clinical_guidance'
  }
  if (
    usesClinicalGuidanceForTreatmentQuery(normalizeSearchQuery(query).resolvedSubject) &&
    /用药|治疗|\b(?:treatment|therapy|medications?)\b|\brecommended\s+(?:medications?|drugs?)\b|\bhow\s+to\s+treat\b/.test(
      query
    )
  ) {
    return 'clinical_guidance'
  }
  if (/治疗|\btreatment\b|therapy/.test(query)) return 'treatment_update'
  return null
}

function hasExplicitRecency(query: string) {
  return RECENCY_PATTERN.test(query)
}

function preferredSourceTypesForIntent(intent: SearchQueryIntent): AuthoritySourceType[] {
  switch (intent) {
    case 'clinical_guidance':
      return ['clinical_guideline', 'disease_reference']
    case 'treatment_update':
      return ['treatment_update', 'clinical_trial', 'drug_approval', 'patient_org']
    case 'clinical_trial':
      return ['clinical_trial', 'treatment_update', 'research_publication']
    case 'drug_approval':
      return ['drug_approval', 'treatment_update', 'policy_access']
    case 'policy_access':
      return ['policy_access', 'patient_org', 'drug_approval']
    case 'patient_support':
      return ['patient_org', 'policy_access', 'disease_reference']
    case 'research_progress':
      return ['research_publication', 'clinical_trial', 'treatment_update']
    case 'disease_overview':
    default:
      return ['disease_reference', 'patient_org']
  }
}

function deprioritizedSourceTypesForIntent(intent: SearchQueryIntent): AuthoritySourceType[] {
  if (intent === 'treatment_update') return ['disease_reference']
  if (intent === 'clinical_trial') return ['disease_reference', 'patient_org']
  if (intent === 'drug_approval') return ['disease_reference']
  return []
}

function buildQueryTerms(subject: string, query: string, intent: SearchQueryIntent) {
  const terms = new Set<string>([subject, query.trim()].filter(Boolean))
  switch (intent) {
    case 'clinical_guidance':
      terms.add('guideline')
      terms.add('clinical guidance')
      break
    case 'treatment_update':
      terms.add('treatment')
      terms.add('update')
      break
    case 'clinical_trial':
      terms.add('clinical trial')
      terms.add('recruiting')
      break
    case 'drug_approval':
      terms.add('approval')
      terms.add('FDA')
      break
    case 'policy_access':
      terms.add('policy')
      terms.add('reimbursement')
      break
    case 'research_progress':
      terms.add('research')
      terms.add('publication')
      break
  }

  return [...terms]
}

function normalizeSourceTypes(
  value: unknown,
  fallback: AuthoritySourceType[]
): AuthoritySourceType[] {
  const items = asStringArray(value).filter(isAuthoritySourceType) as AuthoritySourceType[]
  return items.length ? items : fallback
}

function asIntent(value: unknown): SearchQueryIntent | null {
  return typeof value === 'string' && isIntent(value) ? value : null
}

function asTimeSensitivity(value: unknown): SearchQueryAnalysis['timeSensitivity'] | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string').map(item => item.trim())
    : []
}

function isIntent(value: string): value is SearchQueryIntent {
  return (SEARCH_QUERY_INTENTS as readonly string[]).includes(value)
}

function isAuthoritySourceType(value: string): value is AuthoritySourceType {
  return (AUTHORITY_SOURCE_TYPES as readonly string[]).includes(value)
}
