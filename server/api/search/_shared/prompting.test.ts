import { describe, expect, it } from 'vitest'
import { buildSearchPrompt } from './prompting'

describe('buildSearchPrompt', () => {
  it('deduplicates identical snippets and content while limiting evidence sent to the model', () => {
    const authorityEvidence = Array.from({ length: 5 }, (_, index) => ({
      sourceType: 'reference' as const,
      sourceTier: 'authority' as const,
      sourceLabel: `Authority ${index + 1}`,
      sourceUrl: `https://authority.example.com/${index + 1}`,
      sourceDomain: 'authority.example.com',
      snippet: `authority-evidence-${index + 1}`,
      publishedAt: null,
      title: `Authority title ${index + 1}`,
      content: `authority-evidence-${index + 1}`,
    }))
    const supplementEvidence = Array.from({ length: 3 }, (_, index) => ({
      sourceType: 'reference' as const,
      sourceTier: 'internet_supplement' as const,
      sourceLabel: `Supplement ${index + 1}`,
      sourceUrl: `https://supplement.example.com/${index + 1}`,
      sourceDomain: 'supplement.example.com',
      snippet: `supplement-evidence-${index + 1}`,
      publishedAt: null,
      title: `Supplement title ${index + 1}`,
      content: `supplement-evidence-${index + 1}`,
    }))

    const prompt = buildSearchPrompt({
      query: 'FSHD 最新治疗情况',
      evidence: [...authorityEvidence, ...supplementEvidence],
    })

    expect(prompt.match(/authority-evidence-1/g)).toHaveLength(1)
    expect(prompt).toContain('authority-evidence-4')
    expect(prompt).not.toContain('authority-evidence-5')
    expect(prompt).toContain('supplement-evidence-2')
    expect(prompt).not.toContain('supplement-evidence-3')
    expect(prompt).toMatch(/500\s*(?:到|至|–|-)\s*800/)
  })

  it('bounds treatment conclusions from a guideline landing page without recommendation text', () => {
    const prompt = buildSearchPrompt({
      query: 'sJIA 用药指南',
      evidence: [
        {
          sourceType: 'reference',
          sourceTier: 'authority',
          sourceLabel: 'American College of Rheumatology',
          sourceUrl: 'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline',
          sourceDomain: 'rheumatology.org',
          snippet: 'Official juvenile idiopathic arthritis guideline landing page.',
          publishedAt: null,
          title: 'Juvenile Idiopathic Arthritis Guideline',
          content: 'This page provides access to an official guideline.',
        },
      ],
    })

    const authorityEvidenceSection =
      prompt.split('权威来源证据：')[1]?.split('互联网补充：')[0] || ''
    const internetSupplementSection = prompt.split('互联网补充：')[1] || ''

    expect(authorityEvidenceSection).toContain('American College of Rheumatology')
    expect(authorityEvidenceSection).toContain('Juvenile Idiopathic Arthritis Guideline')
    expect(authorityEvidenceSection).toContain(
      'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline'
    )
    expect(authorityEvidenceSection).toContain(
      'This page provides access to an official guideline.'
    )
    expect(internetSupplementSection).not.toContain(
      'https://rheumatology.org/juvenile-idiopathic-arthritis-guideline'
    )
    const treatmentBoundaryRule = prompt.split('\n').find(line => /不得仅凭/.test(line)) || ''

    expect(prompt).toMatch(/指南落地页|仅说明指南存在/)
    expect(prompt).toMatch(/只能证明.*(?:存在|官方属性)/)
    expect(treatmentBoundaryRule).toMatch(/不得仅凭/)
    expect(treatmentBoundaryRule).toContain('具体药物')
    expect(treatmentBoundaryRule).toContain('剂量')
    expect(treatmentBoundaryRule).toContain('推荐强度')
    expect(treatmentBoundaryRule).toContain('治疗结论')
    expect(prompt).toMatch(/除非.*具体推荐文本/)
  })

  it('keeps distinct snippet and content evidence within the prompt budget', () => {
    const prompt = buildSearchPrompt({
      query: 'FSHD 最新治疗情况',
      evidence: [
        {
          sourceType: 'news',
          sourceTier: 'authority',
          sourceLabel: 'FSHD Society',
          sourceUrl: 'https://www.fshdsociety.org/update',
          sourceDomain: 'fshdsociety.org',
          snippet: '关键命中摘要：一项新的临床研究已经启动。',
          publishedAt: null,
          title: 'FSHD research update',
          content: '网页背景内容：本页面汇总机构的研究新闻和活动。',
        },
      ],
    })

    expect(prompt).toContain('关键命中摘要：一项新的临床研究已经启动。')
    expect(prompt).toContain('网页背景内容：本页面汇总机构的研究新闻和活动。')
  })
})
