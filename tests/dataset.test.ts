import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildJevRequest, parseCatalog } from '../src/codes.ts';

const EXPECTED_FIXTURES = 10;
const EXPECTED_CODES = 33;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const candidateIdentity = (system: string, code: string): string =>
  `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

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

await test('internal catalog covers every fixture candidate and dictation', async () => {
  const [catalogSource, fixtureSource] = await Promise.all([
    readFile('data/billing-codes.json', 'utf8'),
    readFile('data/hand-surgery-dictations.json', 'utf8'),
  ]);
  const catalog = parseCatalog(JSON.parse(catalogSource) as unknown);
  const { candidateIdentities, dictations } = readFixtures(
    JSON.parse(fixtureSource) as unknown,
  );
  assert.equal(dictations.length, EXPECTED_FIXTURES);
  assert.equal(catalog.length, EXPECTED_CODES);
  assert.equal(candidateIdentities.size, EXPECTED_CODES);
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
