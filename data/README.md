# Hand-surgery dictation dataset

`hand-surgery-dictations.json` contains ten synthetic operative reports covering common hand and upper-extremity procedures. Every patient and clinical event is fictional; the text is newly written and is not copied from a source report.

## Schema

Each record contains:

- `id`, `title`, `encounter_type`, and `synthetic`
- `dictation`: the report sections supplied to a coding system
- `billing_candidates.icd10cm`: candidate diagnosis codes and supporting rationale
- `billing_candidates.cpt`: candidate procedure codes, modifiers, units, and supporting rationale
- `coding_notes`: ambiguities and payer-specific checks that a production workflow must resolve

## Important limitations

This is test data, not medical or billing advice. The code lists are plausible candidates, not claim-ready determinations. A qualified coder must review the complete chart, current code books, National Correct Coding Initiative edits, medically unlikely edits, payer policy, global-surgery rules, and modifier requirements before submitting a claim.

ICD-10-CM labels were checked against the CMS April 1, 2026 code-description file, applicable to encounters from April 1 through September 30, 2026. CPT is copyrighted by the American Medical Association. The dataset uses code numbers with short, original summaries rather than reproducing the CPT codebook. Confirm every CPT code against the licensed edition applicable on the date of service.

## Sources

These sources informed report structure and code validation; no source dictation was copied.

- [MTSamples surgery reports](https://www.mtsamples.com/site/pages/browse.asp?type=85-Surgery) — examples of operative-report organization and dictation style.
- [MTSamples carpal tunnel release example](https://www.mtsamples.com/site/pages/sample.asp?Type=85%2DSurgery&Sample=139%252DCarpal%252BTunnel%252BRelease%252B%252D%252B1) — public educational transcription reference.
- [CMS ICD-10 files](https://www.cms.gov/medicare/coding-billing/icd-10-codes) — official FY2026 ICD-10-CM descriptions and guidelines.
- [CMS Physician Fee Schedule search](https://www.cms.gov/medicare/physician-fee-schedule/search) — public procedure-code lookup resource.
- [American Board of Orthopaedic Surgery hand CPT list](https://www.abos.org/wp-content/uploads/2019/12/hand-cpt-updated.pdf) — hand-surgery procedure/code cross-reference; historical, so used only as a secondary check.
- [American Society for Surgery of the Hand coding app](https://coding.assh.org/) — specialty coding reference.

Sources were accessed September 19, 2026.
