# OSR Sidequest Collaboration Guide

## Purpose

This is a civic sidequest: a small, useful collaboration between the independent dashboard and
Greensboro's Office of Sustainability and Resilience. It is designed for Shree, OSR staff,
department implementers, community reviewers, and the project maintainer to improve the public
record without turning the dashboard into an official City publication.

The shared objective is simple: make annual progress, reporting gaps, milestones, funding, and
unresolved questions easier to review and correct.

## Independence and roles

- **OSR and department reviewers** supply context, primary records, corrections, and milestone
  confirmations. Participation does not imply City endorsement of the dashboard.
- **Project maintainer** checks evidence, records decisions, runs validation, and publishes changes.
- **Community reviewers** may identify omissions or submit public primary sources.
- **The dashboard** distinguishes City-reported information, external verification, derived
  analysis, proposals, and unresolved disagreements.

No contributor is asked to approve the dashboard as a whole. Review can be limited to a single
goal, year, funding record, or source.

## A lightweight review cycle

1. Export `data/osr-review-template.csv` and assign goal rows to the relevant team.
2. Review the goal text, annual status, milestones, funding links, target date, and citations.
3. Add a primary source for every proposed factual change.
4. Submit the workbook or open a structured GitHub issue using the OSR review template.
5. The maintainer records the proposal in `data/review-proposals.json`.
6. Accepted proposals are promoted to the appropriate authoritative JSON file. Explicit pause,
   cancellation, supersession, or completion events go into `data/reviewed-events.json`.
7. Regenerate transitions, rebuild, validate, and publish a dated change-log entry.

## Suggested 45-minute working session

- 5 minutes: confirm the evidence rules and independence statement.
- 15 minutes: review goals that went silent or passed a target year.
- 10 minutes: identify missing milestones and funding records.
- 10 minutes: assign source-finding follow-ups.
- 5 minutes: confirm what can be attributed and what remains off the record.

## Decision states

- `pending`: received but not evaluated.
- `needs_information`: plausible, but a primary source or detail is missing.
- `accepted`: evidence supports publication.
- `declined`: evidence does not support the proposed change; rationale is retained.
- `disputed`: credible reviewers disagree; both interpretations remain visible.

## Guardrails

- Silence never means abandonment.
- Email or verbal context may guide research but is not published as fact without permission and
  a citable record.
- Personal contact information, draft procurement material, security-sensitive facility details,
  and resident-level data are not collected.
- Reviewers can be attributed by name, role only, or anonymously.
- Corrections retain the previous value and a dated rationale rather than silently rewriting history.

## A good first sidequest

Start with the three 2025 reporting drop-offs (TR-GAS-G1, FO-G1, and CI-G1) and the four goals
whose target year has passed without a verified outcome. The question is not “were these
abandoned?” It is “what is the latest citable milestone, and what should the public understand?”
