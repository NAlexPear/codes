import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { BillingCode } from '../src/codes.ts';

import { buildJevRequest, parseCatalog } from '../src/codes.ts';

const EXPECTED_FIXTURES = 10;
const EXPECTED_CODES = 33;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addCandidates = (
  billing: Record<string, unknown>,
  system: string,
  unique: Map<string, BillingCode>,
): void => {
  const candidates = billing[system];
  assert.ok(Array.isArray(candidates));
  for (const candidate of candidates) {
    assert.ok(isRecord(candidate));
    const { code, label } = candidate;
    assert.ok(typeof code === 'string');
    assert.ok(typeof label === 'string');
    unique.set(`${system}:${code}`, { code, description: label, system });
  }
};

const readFixtures = (
  value: unknown,
): { catalog: BillingCode[]; dictations: unknown[] } => {
  assert.ok(Array.isArray(value));
  const dictations: unknown[] = [];
  const unique = new Map<string, BillingCode>();
  for (const fixture of value) {
    assert.ok(isRecord(fixture));
    const billing = fixture['billing_candidates'];
    assert.ok(isRecord(billing));
    dictations.push(fixture['dictation']);
    addCandidates(billing, 'cpt', unique);
    addCandidates(billing, 'icd10cm', unique);
  }
  return { catalog: parseCatalog([...unique.values()]), dictations };
};

await test('all fixture dictations can be evaluated against the combined candidate catalog', async () => {
  const source = await readFile('data/hand-surgery-dictations.json', 'utf8');
  const value: unknown = JSON.parse(source);
  const { catalog, dictations } = readFixtures(value);
  assert.equal(dictations.length, EXPECTED_FIXTURES);
  assert.equal(catalog.length, EXPECTED_CODES);

  for (const dictation of dictations) {
    const encoded = JSON.stringify(dictation);
    assert.ok(encoded);
    const request = buildJevRequest(encoded, catalog, 'jev-latest');
    assert.equal(Object.keys(request.questions).length, catalog.length);
  }
});
