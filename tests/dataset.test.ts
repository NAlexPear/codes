import assert from 'node:assert/strict';
import test from 'node:test';

import catalogData from '../data/billing-codes.json' with { type: 'json' };
import syntheticCasesData from '../data/hand-surgery-dictations.json' with { type: 'json' };
import sourceCasesData from '../data/hand-surgery-source-evals.json' with { type: 'json' };
import sourcesData from '../data/hand-surgery-sources.json' with { type: 'json' };
import { buildJevRequest, parseCatalog } from '../src/codes.ts';

const EXPECTED_FIXTURES = 46;
const EXPECTED_CATALOG_CODES = 91;
const EXPECTED_CORPUS_CODES = 45;
const EXPECTED_CPT_CODES = 51;
const EXPECTED_ICD10_CODES = 40;
const EXPECTED_SOURCES = 12;
const CORE_FAMILIES = [
  {
    codes: ['25600', '25605', '25606', '25607', '25608', '25609'],
    name: 'CPT distal radius treatment',
    system: 'CPT',
  },
  {
    codes: ['26608', '26615', '26727', '26735'],
    name: 'CPT hand fracture fixation',
    system: 'CPT',
  },
  {
    codes: ['20550', '20600', '20605'],
    name: 'CPT office procedures',
    system: 'CPT',
  },
  {
    codes: [
      '26055',
      '26350',
      '26356',
      '26410',
      '26418',
      '26433',
      '26440',
      '26445',
    ],
    name: 'CPT tendon surgery',
    system: 'CPT',
  },
  {
    codes: [
      '25215',
      '25320',
      '25440',
      '25447',
      '25800',
      '25820',
      '29840',
      '29846',
    ],
    name: 'CPT wrist reconstruction',
    system: 'CPT',
  },
  {
    codes: [
      'G56.01',
      'G56.02',
      'M18.11',
      'M18.12',
      'M25.531',
      'M25.532',
      'M67.431',
      'M67.432',
      'M77.11',
      'M77.12',
    ],
    name: 'ICD-10-CM common paired diagnoses',
    system: 'ICD-10-CM',
  },
  {
    codes: [
      'M65.311',
      'M65.312',
      'M65.321',
      'M65.322',
      'M65.331',
      'M65.332',
      'M65.341',
      'M65.342',
      'M65.351',
      'M65.352',
    ],
    name: 'ICD-10-CM trigger digits',
    system: 'ICD-10-CM',
  },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const candidateIdentity = (system: string, code: string): string =>
  `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

const assertFamilyCoverage = (
  identities: ReadonlySet<string>,
  family: (typeof CORE_FAMILIES)[number],
): void => {
  for (const code of family.codes) {
    assert.ok(
      identities.has(candidateIdentity(family.system, code)),
      `${family.name} is missing ${code}`,
    );
  }
};

const fixtureSystem = (fixtureKey: 'cpt' | 'icd10cm'): string => {
  if (fixtureKey === 'cpt') {
    return 'CPT';
  }
  return 'ICD-10-CM';
};

const addCandidateIdentities = (
  billing: Record<string, unknown>,
  fixtureKey: 'cpt' | 'icd10cm',
  unique: Set<string>,
): void => {
  const candidates = billing[fixtureKey];
  const system = fixtureSystem(fixtureKey);
  assert.ok(Array.isArray(candidates));
  for (const candidate of candidates) {
    assert.ok(isRecord(candidate));
    const { code } = candidate;
    assert.ok(typeof code === 'string');
    unique.add(candidateIdentity(system, code));
  }
};

const readFixtures = (
  value: unknown,
): { candidateIdentities: Set<string>; dictations: unknown[] } => {
  assert.ok(Array.isArray(value));
  const dictations: unknown[] = [];
  const candidateIdentities = new Set<string>();
  for (const fixture of value) {
    assert.ok(isRecord(fixture));
    const billing = fixture['billing_candidates'];
    assert.ok(isRecord(billing));
    dictations.push(fixture['dictation']);
    addCandidateIdentities(billing, 'cpt', candidateIdentities);
    addCandidateIdentities(billing, 'icd10cm', candidateIdentities);
  }
  return { candidateIdentities, dictations };
};

await test('internal catalog covers every fixture candidate and dictation', () => {
  const catalog = parseCatalog(catalogData);
  const { candidateIdentities, dictations } = readFixtures([
    ...syntheticCasesData,
    ...sourceCasesData,
  ]);
  assert.equal(dictations.length, EXPECTED_FIXTURES);
  assert.equal(catalog.length, EXPECTED_CATALOG_CODES);
  assert.equal(candidateIdentities.size, EXPECTED_CORPUS_CODES);
  const catalogIdentities = new Set(
    catalog.map(({ code, system }) => candidateIdentity(system, code)),
  );
  for (const identity of candidateIdentities) {
    assert.ok(catalogIdentities.has(identity));
  }

  for (const dictation of dictations) {
    const encoded = JSON.stringify(dictation);
    assert.ok(encoded);
    const request = buildJevRequest(encoded, catalog, 'jev-latest');
    assert.equal(Object.keys(request.questions).length, catalog.length);
  }
});

await test('internal catalog covers core hand-surgery code families', () => {
  const catalog = parseCatalog(catalogData);
  const bySystem = Map.groupBy(catalog, ({ system }) => system);
  const identities = new Set(
    catalog.map(({ code, system }) => candidateIdentity(system, code)),
  );

  assert.equal(bySystem.get('CPT')?.length, EXPECTED_CPT_CODES);
  assert.equal(bySystem.get('ICD-10-CM')?.length, EXPECTED_ICD10_CODES);
  for (const family of CORE_FAMILIES) {
    assertFamilyCoverage(identities, family);
  }
});

await test('source-grounded variants reference attributed CC BY sources', () => {
  assert.equal(sourcesData.length, EXPECTED_SOURCES);
  const sourceIds = new Set(sourcesData.map(({ id }) => id));
  const variants = Map.groupBy(
    sourceCasesData,
    ({ provenance }) => provenance.source_id,
  );
  assert.deepEqual(new Set(variants.keys()), sourceIds);
  for (const [sourceId, cases] of variants) {
    assert.deepEqual(
      new Set(cases.map(({ provenance }) => provenance.variant)),
      new Set(['complete', 'ambiguous', 'truncated']),
      sourceId,
    );
  }
  for (const source of sourcesData) {
    assert.equal(source.accessed_at, '2026-09-19');
    assert.equal(source.license, 'CC BY 4.0');
    assert.equal(
      source.license_url,
      'https://creativecommons.org/licenses/by/4.0/',
    );
    assert.ok(source.authors.length > 0);
  }
});
