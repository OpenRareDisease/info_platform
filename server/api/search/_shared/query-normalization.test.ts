import { describe, expect, it } from 'vitest'

import { getSubjectAliases, normalizeSearchQuery } from './query-normalization'

describe('sJIA query normalization', () => {
  it.each([
    'sJIA',
    'SJIA 最新研究',
    'systemic JIA treatment',
    'Systemic-Onset JIA guideline',
    'systemic juvenile idiopathic arthritis',
    'systemic-onset juvenile idiopathic arthritis',
    '请介绍系统性幼年特发性关节炎',
    '全身型幼年特发性关节炎怎么治疗',
  ])('normalizes %s to sJIA', query => {
    expect(normalizeSearchQuery(query).resolvedSubject).toBe('sJIA')
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
  ])('does not normalize prohibited term %s to sJIA', query => {
    expect(normalizeSearchQuery(query).resolvedSubject).not.toBe('sJIA')
  })

  it("uses an explicit sJIA name when Still's disease is also present", () => {
    expect(normalizeSearchQuery("sJIA（Still's disease）").resolvedSubject).toBe('sJIA')
  })

  it.each([
    'nonsJIA research',
    'non-sJIA research',
    'non sJIA research',
    'nonsystemic JIA overview',
    'non-systemic JIA overview',
    'non systemic JIA overview',
    '非系统性幼年特发性关节炎研究',
    '非全身型幼年特发性关节炎研究',
  ])('rejects negated or embedded sJIA lookalike %s', query => {
    expect(normalizeSearchQuery(query).resolvedSubject).not.toBe('sJIA')
  })

  it('still resolves a separate positive alias when a negated occurrence also exists', () => {
    expect(normalizeSearchQuery('非系统性幼年特发性关节炎，而是 sJIA').resolvedSubject).toBe('sJIA')
  })

  it('returns only approved aliases for sJIA', () => {
    expect(getSubjectAliases('sJIA')).toEqual([
      'sJIA',
      'systemic JIA',
      'systemic-onset JIA',
      'systemic juvenile idiopathic arthritis',
      'systemic-onset juvenile idiopathic arthritis',
      '系统性幼年特发性关节炎',
      '全身型幼年特发性关节炎',
    ])
  })
})
