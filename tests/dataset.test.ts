import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildJevRequest, parseCatalog } from "../src/codes.ts";

type Candidate = {
  code: string;
  label: string;
};

type DictationFixture = {
  dictation: unknown;
  billing_candidates: {
    cpt: Candidate[];
    icd10cm: Candidate[];
  };
};

test("all fixture dictations can be evaluated against the combined candidate catalog", async () => {
  const fixtures = JSON.parse(
    await readFile("data/hand-surgery-dictations.json", "utf8"),
  ) as DictationFixture[];
  const unique = new Map<string, { code: string; system: string; description: string }>();

  for (const fixture of fixtures) {
    for (const system of ["cpt", "icd10cm"] as const) {
      for (const candidate of fixture.billing_candidates[system]) {
        unique.set(`${system}:${candidate.code}`, {
          code: candidate.code,
          system,
          description: candidate.label,
        });
      }
    }
  }

  const catalog = parseCatalog([...unique.values()]);
  assert.equal(fixtures.length, 10);
  assert.equal(catalog.length, 33);

  for (const fixture of fixtures) {
    const request = buildJevRequest(
      JSON.stringify(fixture.dictation),
      catalog,
      "jev-latest",
    );
    assert.equal(Object.keys(request.questions).length, catalog.length);
  }
});
