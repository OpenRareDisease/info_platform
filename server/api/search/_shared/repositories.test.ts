import { describe, expect, it, vi } from 'vitest'
import { createSearchRepositories } from './repositories'

describe('createSearchRepositories', () => {
  it('lists enabled and disabled registered sources without database filtering', async () => {
    const rows = [
      {
        id: 'enabled-source',
        name: 'Enabled source',
        domain: 'enabled.example.com',
        url: 'https://enabled.example.com',
        source_type: 'reference',
        source_types: ['disease_reference'],
        region: 'global',
        language: 'en',
        priority: 1,
        enabled: true,
        notes: null,
        topics: ['sJIA'],
        topic_aliases: ['systemic JIA'],
        authority_eligible: true,
        path_match: 'exact',
      },
      {
        id: 'disabled-source',
        name: 'Disabled source',
        domain: 'disabled.example.com',
        url: 'https://disabled.example.com',
        source_type: 'news',
        source_types: ['treatment_update'],
        region: 'global',
        language: 'en',
        priority: 2,
        enabled: false,
        notes: 'Retained as a tombstone',
      },
      {
        id: 'legacy-empty-roles',
        name: 'FSHD Society legacy row',
        domain: 'fshdsociety.org',
        url: 'https://www.fshdsociety.org',
        source_type: 'patient_support',
        source_types: [],
        region: 'global',
        language: 'en',
        priority: 3,
        enabled: true,
        notes: null,
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq, order }))
    const from = vi.fn(() => ({ select }))

    const result = await createSearchRepositories({ from }).listRegisteredSources()

    expect(order).toHaveBeenCalledWith('priority', { ascending: true })
    expect(eq).not.toHaveBeenCalled()
    expect(result.map(row => row.enabled)).toEqual([true, false, true])
    expect(result[0]).toMatchObject({
      topics: ['sJIA'],
      topicAliases: ['systemic JIA'],
      authorityEligible: true,
      pathMatch: 'exact',
    })
    expect(result[1]).toMatchObject({
      topics: [],
      topicAliases: [],
      authorityEligible: false,
      pathMatch: 'prefix',
    })
    expect(result[2]).toMatchObject({
      sourceType: 'patient_support',
      sourceTypes: ['patient_org'],
    })
  })
})
