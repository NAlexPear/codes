# Hand-surgery dictation dataset

`hand-surgery-dictations.json` contains ten synthetic operative reports covering
common hand and upper-extremity procedures. `hand-surgery-source-evals.json`
contains 36 additional fictional reports grounded in general clinical facts from
12 CC BY 4.0 publications: one complete, one intentionally ambiguous, and one
truncated variant per source. Every patient and clinical event is fictional; all
report text is newly written and is not copied from a source report.

`hand-surgery-sources.json` provides article URLs, authors, identifiers,
licenses, and adaptation notes for the source-grounded cases. It intentionally
excludes restricted clinical-note datasets, unclear web licenses, and
noncommercial or no-derivatives sources.

`billing-codes.json` is the internal candidate catalog used by the CLI. It is a
packaged application asset, not a user-supplied CLI input.

## Schema

Each record contains:

- `id`, `title`, `encounter_type`, and `synthetic`
- `dictation`: the report sections supplied to a coding system
- `billing_candidates.icd10cm`: candidate diagnosis codes and supporting
  rationale
- `billing_candidates.cpt`: candidate procedure codes, modifiers, units, and
  supporting rationale
- optional candidate `accepted_dispositions`: `automatic`, `manualReview`, or
  both; legacy candidates without this field accept either
- optional `provenance`: a `source_id`, variant, and the exact omissions or
  contradictions introduced for an eval
- `coding_notes`: ambiguities and payer-specific checks that a production
  workflow must resolve

Candidates not listed for a case are expected to remain omitted or, when
dubious, to be sent for manual review. An explicitly labeled manual-review
candidate fails the eval if it is automatically accepted or omitted.

## Important limitations

This is test data, not medical or billing advice. The code lists are plausible
candidates, not claim-ready determinations. A qualified coder must review the
complete chart, current code books, National Correct Coding Initiative edits,
medically unlikely edits, payer policy, global-surgery rules, and modifier
requirements before submitting a claim.

ICD-10-CM labels were checked against the CMS April 1, 2026 code-description
file, applicable to encounters from April 1 through September 30, 2026. CPT is
copyrighted by the American Medical Association. The dataset uses code numbers
with short, original summaries rather than reproducing the CPT codebook. Confirm
every CPT code against the licensed edition applicable on the date of service.

## Sources

The full attribution for source-grounded evals is in
`hand-surgery-sources.json`. Each included publication is licensed CC BY 4.0;
the corpus uses only general facts to construct new fictional reports and does
not reproduce source patients or prose.

The following additional sources informed the original synthetic reports and
code validation; no source dictation was copied.

- [MTSamples surgery reports](https://www.mtsamples.com/site/pages/browse.asp?type=85-Surgery)
  — examples of operative-report organization and dictation style.
- [MTSamples carpal tunnel release example](https://www.mtsamples.com/site/pages/sample.asp?Type=85%2DSurgery&Sample=139%252DCarpal%252BTunnel%252BRelease%252B%252D%252B1)
  — public educational transcription reference.
- [CMS ICD-10 files](https://www.cms.gov/medicare/coding-billing/icd-10-codes) —
  official FY2026 ICD-10-CM descriptions and guidelines.
- [CMS Physician Fee Schedule search](https://www.cms.gov/medicare/physician-fee-schedule/search)
  — public procedure-code lookup resource.
- [American Board of Orthopaedic Surgery hand CPT list](https://www.abos.org/wp-content/uploads/2019/12/hand-cpt-updated.pdf)
  — hand-surgery procedure/code cross-reference; historical, so used only as a
  secondary check.
- [American Society for Surgery of the Hand coding app](https://coding.assh.org/)
  — specialty coding reference.

Sources were accessed September 19, 2026.
