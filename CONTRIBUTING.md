# Contributing evidence and corrections

Contributions should make the record more precise without weakening its provenance.

## Before proposing a change

Provide the goal ID, affected year, current value, proposed value, rationale, primary-source URL
or document reference, page or section, event date, and whether attribution is permitted. Use
`data/osr-review-template.csv` or the GitHub issue template.

## Evidence requirements

- Goal commitments come from the adopted SEP.
- Annual reporting states come from the applicable annual report.
- External verification should use a primary government, grant, contract, permit, or legislative record.
- Derived conclusions must name their inputs and calculation.
- Cancellation, pause, supersession, and completion require explicit source language.

## Publishing workflow

```text
python scripts/generate_goal_transitions.py
python build.py
python scripts/validate_data.py
```

Do not hand-edit `data/goal-transitions.json`; it is generated. Proposed changes remain in
`data/review-proposals.json` until reviewed. Accepted terminal events belong in
`data/reviewed-events.json`, with reviewer and citation metadata.

## Corrections and disagreements

Corrections must preserve the previous value in the change log. When credible sources conflict,
record a contradiction rather than selecting the more convenient claim. Reviewer comments are
not public by default unless the reviewer grants attribution permission.
