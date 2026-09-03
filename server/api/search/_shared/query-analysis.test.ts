import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeSearchQuery, fallbackAnalyzeSearchQuery } from './query-analysis'
import { getSubjectAliases } from './query-normalization'

const originalOpenAiApiKey = process.env.OPENAI_API_KEY
const originalFetch = globalThis.fetch

function mockModelAnalysis(analysis: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: JSON.stringify(analysis) },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
  )
}

describe('fallbackAnalyzeSearchQuery', () => {
  it('maps latest treatment questions to treatment-update oriented source types', () => {
    const analysis = fallbackAnalyzeSearchQuery('FSHD最新治疗进展')

    expect(analysis.subject).toBe('FSHD')
    expect(analysis.aliases).toEqual(
      expect.arrayContaining([
        'FSHD',
        'facioscapulohumeral muscular dystrophy',
        'facioscapulohumeral dystrophy',
      ])
    )
    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.timeSensitivity).toBe('high')
    expect(analysis.preferredSourceTypes).toContain('treatment_update')
    expect(analysis.preferredSourceTypes).toContain('clinical_trial')
    expect(analysis.deprioritizedSourceTypes).toContain('disease_reference')
  })

  it('distinguishes clinical guidance from treatment updates', () => {
    expect(fallbackAnalyzeSearchQuery('sJIA 最新用药进展').intent).toBe('treatment_update')
    expect(fallbackAnalyzeSearchQuery('sJIA 用药指南').intent).toBe('clinical_guidance')
    expect(fallbackAnalyzeSearchQuery('sJIA 怎么治疗').intent).toBe('clinical_guidance')
    expect(fallbackAnalyzeSearchQuery('sJIA 用药指南').preferredSourceTypes).toContain(
      'clinical_guideline'
    )
    expect(fallbackAnalyzeSearchQuery('sJIA 最新用药进展').preferredSourceTypes).not.toContain(
      'clinical_guideline'
    )
  })

  it.each([
    'sJIA 用药',
    'sJIA 推荐用药',
    'sJIA 用药指南',
    'sJIA 怎么治疗',
    'sJIA 如何治疗',
    'sJIA 治疗',
    'sJIA treatment',
    'sJIA medication',
    'sJIA medications',
    'sJIA recommended medication',
    'sJIA recommended medications',
    'sJIA recommended drug',
    'sJIA recommended drugs',
    'sJIA how to treat',
    'SJIA RECOMMENDED MEDICATION',
  ])('classifies explicit treatment guidance query %s as clinical guidance', query => {
    expect(fallbackAnalyzeSearchQuery(query).intent).toBe('clinical_guidance')
  })

  it.each([
    'FSHD treatment',
    'Pompe disease treatment',
    'rare inflammatory syndrome treatment',
    'FSHD therapy',
  ])('preserves legacy treatment-update intent outside sJIA for %s', query => {
    expect(fallbackAnalyzeSearchQuery(query).intent).toBe('treatment_update')
  })

  it('does not match medication vocabulary inside a larger word', () => {
    expect(fallbackAnalyzeSearchQuery('sJIA premedication history').intent).toBe('disease_overview')
  })

  it('does not match plural medication vocabulary inside a larger word', () => {
    expect(fallbackAnalyzeSearchQuery('sJIA medicationss history').intent).toBe('disease_overview')
  })

  it('keeps explicit recency ahead of an sJIA medication guidance phrase', () => {
    const analysis = fallbackAnalyzeSearchQuery('sJIA latest recommended medication')

    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.timeSensitivity).toBe('high')
  })

  it('classifies Chinese patient support vocabulary deterministically', () => {
    expect(fallbackAnalyzeSearchQuery('sJIA 患者支持').intent).toBe('patient_support')
  })

  it('lets an explicit Chinese update term win over general treatment guidance', () => {
    const analysis = fallbackAnalyzeSearchQuery('sJIA 治疗更新')

    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.timeSensitivity).toBe('high')
  })

  it.each([
    'Still disease',
    "Still's disease",
    'Still’s disease',
    'Still 病',
    '斯蒂尔病',
    '成人斯蒂尔病',
    "adult-onset Still's disease",
    'AOSD',
    'MAS',
    '巨噬细胞活化综合征',
    'non-sJIA research',
    'non systemic JIA overview',
    '非系统性幼年特发性关节炎研究',
  ])('does not identify prohibited term %s as sJIA', query => {
    const analysis = fallbackAnalyzeSearchQuery(query)

    expect(analysis.subject).not.toBe('sJIA')
    expect(analysis.aliases).not.toContain('sJIA')
  })
})

describe('analyzeSearchQuery model output safeguards', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey
    }
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it.each([
    { query: 'AOSD treatment', modelSubject: 'systemic JIA' },
    { query: 'Still disease treatment', modelSubject: 'SJIA' },
    { query: 'MAS treatment', modelSubject: 'sJIA' },
    { query: 'non-sJIA research', modelSubject: 'sJIA' },
    { query: '非全身型幼年特发性关节炎研究', modelSubject: 'systemic JIA' },
  ])(
    'rejects every registered sJIA alias injected by the model for $query',
    async ({ query, modelSubject }) => {
      mockModelAnalysis({
        subject: modelSubject,
        aliases: ['sJIA', 'SYSTEMIC JIA', 'systemic-onset JIA'],
        intent: 'treatment_update',
        timeSensitivity: 'medium',
        preferredSourceTypes: ['treatment_update'],
        deprioritizedSourceTypes: [],
        queryTerms: ['SJIA', 'systemic JIA', 'systemic-onset juvenile idiopathic arthritis'],
      })

      const analysis = await analyzeSearchQuery(query)
      const approvedAliases = new Set(getSubjectAliases('sJIA').map(alias => alias.toLowerCase()))
      const outputTerms = [analysis.subject, ...analysis.aliases, ...analysis.queryTerms]

      expect(outputTerms.some(term => approvedAliases.has(term.toLowerCase()))).toBe(false)
    }
  )

  it('rejects every registered FSHD alias injected by the model when the query does not name FSHD', async () => {
    mockModelAnalysis({
      subject: 'facioscapulohumeral muscular dystrophy',
      aliases: ['FSHD', 'facioscapulohumeral muscular dystrophy'],
      intent: 'treatment_update',
      timeSensitivity: 'medium',
      preferredSourceTypes: ['treatment_update'],
      deprioritizedSourceTypes: [],
      queryTerms: ['FSHD'],
    })

    const analysis = await analyzeSearchQuery('Pompe disease treatment')

    expect(analysis.subject).not.toBe('FSHD')
    expect(analysis.aliases).not.toContain('FSHD')
    expect(analysis.queryTerms).not.toContain('FSHD')
  })

  it('replaces an incorrect model subject and aliases with the explicit canonical sJIA set', async () => {
    mockModelAnalysis({
      subject: 'AOSD',
      aliases: ['AOSD', 'Still disease'],
      intent: 'disease_overview',
      timeSensitivity: 'low',
      preferredSourceTypes: ['disease_reference'],
      deprioritizedSourceTypes: [],
      queryTerms: ['AOSD', 'Still disease'],
    })

    const analysis = await analyzeSearchQuery('systemic JIA treatment')

    expect(analysis.subject).toBe('sJIA')
    expect(analysis.aliases).toEqual([
      'sJIA',
      'systemic JIA',
      'systemic-onset JIA',
      'systemic juvenile idiopathic arthritis',
      'systemic-onset juvenile idiopathic arthritis',
      '系统性幼年特发性关节炎',
      '全身型幼年特发性关节炎',
    ])
    expect(analysis.queryTerms).toEqual(expect.arrayContaining(['sJIA', 'systemic JIA treatment']))
    expect(analysis.queryTerms).not.toEqual(expect.arrayContaining(['AOSD', 'Still disease']))
  })

  it('preserves valid non-default clinical guidance source arrays returned by the model', async () => {
    mockModelAnalysis({
      subject: 'rare inflammatory syndrome',
      aliases: ['rare inflammatory syndrome'],
      intent: 'clinical_guidance',
      timeSensitivity: 'medium',
      preferredSourceTypes: ['research_publication', 'clinical_guideline'],
      deprioritizedSourceTypes: ['patient_org'],
      queryTerms: ['rare inflammatory syndrome', 'clinical guidance'],
    })

    const analysis = await analyzeSearchQuery('rare inflammatory syndrome specialist care')

    expect(analysis.intent).toBe('clinical_guidance')
    expect(analysis.preferredSourceTypes).toEqual(['research_publication', 'clinical_guideline'])
    expect(analysis.deprioritizedSourceTypes).toEqual(['patient_org'])
  })

  it('overrides model guidance with update intent and source types for an sJIA progress query', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'clinical_guidance',
      timeSensitivity: 'low',
      preferredSourceTypes: ['clinical_guideline', 'disease_reference'],
      deprioritizedSourceTypes: ['treatment_update'],
      queryTerms: ['sJIA', 'guideline'],
    })

    const analysis = await analyzeSearchQuery('sJIA 最新用药进展')

    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.preferredSourceTypes).toEqual([
      'treatment_update',
      'clinical_trial',
      'drug_approval',
      'patient_org',
    ])
    expect(analysis.deprioritizedSourceTypes).toEqual(['disease_reference'])
    expect(analysis.queryTerms).toEqual(expect.arrayContaining(['treatment', 'update']))
    expect(analysis.preferredSourceTypes).not.toContain('clinical_guideline')
  })

  it('overrides model update intent with guidance source types for an sJIA guideline query', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'treatment_update',
      timeSensitivity: 'high',
      preferredSourceTypes: ['treatment_update', 'clinical_trial'],
      deprioritizedSourceTypes: ['disease_reference'],
      queryTerms: ['sJIA', 'treatment', 'update'],
    })

    const analysis = await analyzeSearchQuery('sJIA 用药指南')

    expect(analysis.intent).toBe('clinical_guidance')
    expect(analysis.preferredSourceTypes).toEqual(['clinical_guideline', 'disease_reference'])
    expect(analysis.deprioritizedSourceTypes).toEqual([])
    expect(analysis.queryTerms).toEqual(expect.arrayContaining(['guideline', 'clinical guidance']))
  })

  it('treats English treatment as an explicit guidance override after model parsing', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'clinical_guidance',
      timeSensitivity: 'medium',
      preferredSourceTypes: ['clinical_guideline'],
      deprioritizedSourceTypes: ['patient_org'],
      queryTerms: ['sJIA', 'guideline'],
    })

    const analysis = await analyzeSearchQuery('sJIA treatment options')

    expect(analysis.intent).toBe('clinical_guidance')
    expect(analysis.preferredSourceTypes).toEqual(['clinical_guideline', 'disease_reference'])
    expect(analysis.deprioritizedSourceTypes).toEqual([])
  })

  it('forces high time sensitivity when explicit recency overrides the model', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'clinical_guidance',
      timeSensitivity: 'low',
      preferredSourceTypes: ['clinical_guideline'],
      deprioritizedSourceTypes: [],
      queryTerms: ['sJIA', 'guideline'],
    })

    const analysis = await analyzeSearchQuery('sJIA recent treatment progress')

    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.timeSensitivity).toBe('high')
  })

  it('forces Chinese update intent and high sensitivity over model guidance', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'clinical_guidance',
      timeSensitivity: 'medium',
      preferredSourceTypes: ['clinical_guideline'],
      deprioritizedSourceTypes: [],
      queryTerms: ['sJIA', 'guideline'],
    })

    const analysis = await analyzeSearchQuery('sJIA 治疗更新')

    expect(analysis.intent).toBe('treatment_update')
    expect(analysis.timeSensitivity).toBe('high')
  })

  it('does not treat new inside an English word as a recency override', async () => {
    mockModelAnalysis({
      subject: 'sJIA',
      aliases: ['sJIA'],
      intent: 'clinical_guidance',
      timeSensitivity: 'medium',
      preferredSourceTypes: ['research_publication'],
      deprioritizedSourceTypes: ['patient_org'],
      queryTerms: ['sJIA', 'clinical guidance'],
    })

    const analysis = await analyzeSearchQuery('sJIA renewal paperwork')

    expect(analysis.intent).toBe('clinical_guidance')
    expect(analysis.preferredSourceTypes).toEqual(['research_publication'])
    expect(analysis.deprioritizedSourceTypes).toEqual(['patient_org'])
  })
})
