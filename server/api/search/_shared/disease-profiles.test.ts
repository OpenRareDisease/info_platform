import { describe, expect, it } from 'vitest'

import {
  findDiseaseProfile,
  getAuthoritySourceTypesForIntent,
  listDiseaseAliases,
} from './disease-profiles'

describe('disease profiles', () => {
  it('resolves every registered disease alias from the shared profile registry', () => {
    expect(findDiseaseProfile('面肩肱型肌营养不良')?.canonical).toBe('FSHD')
    expect(findDiseaseProfile('systemic-onset JIA')?.canonical).toBe('sJIA')
    expect(findDiseaseProfile('血友')?.canonical).toBe('Hemophilia')
    expect(findDiseaseProfile('haemophilia')?.canonical).toBe('Hemophilia')
    expect(findDiseaseProfile('杜氏肌营养不良')?.canonical).toBe('DMD')
    expect(findDiseaseProfile('肢端肥大症')?.canonical).toBe('Acromegaly')
    expect(findDiseaseProfile('发作性睡病')?.canonical).toBe('Narcolepsy')
    expect(listDiseaseAliases('sJIA')).toContain('系统性幼年特发性关节炎')
    expect(listDiseaseAliases('Hemophilia')).toContain('hemophilia B')
  })

  it('uses the profile capability when a disease has a clinical-trial source override', () => {
    expect(getAuthoritySourceTypesForIntent('sJIA', 'clinical_trial')).toEqual(['treatment_update'])
    expect(getAuthoritySourceTypesForIntent('FSHD', 'clinical_trial')).toEqual(['clinical_trial'])
  })
})
