---
name: adr
description: Write a new Architecture Decision Record (ADR) in docs/adr/, or revise an existing one, following this repo's format and a strict technical-writing style. Use when the user asks to "write an ADR", "record this decision", "add an ADR for ...", "/adr", or wants to document an architecture/design decision. Determines the next ADR number, drafts the record with the repo's section structure and status conventions, and enforces consistent terminology, low verbosity, and plain wording (no LLM filler like "load-bearing", "footgun", "delve"). Project-scoped to ph-monorepo.
---

# ADR writer (project-scoped)

Writes and revises Architecture Decision Records under `docs/adr/`. An ADR is a
short document capturing one decision: the context that forced it, the choice
made, the alternatives weighed, and the consequences. Owned by this repo because
the numbering, header block, and section layout are repo-specific.

Two jobs, two purposes: the record explains later *why* the system is built this
way, and writing it forces the decision to be reasoned through before it ships.

## When to run

- A design or architecture decision has been made (or is being finalized) and
  needs a durable record.
- An existing decision is being changed — supersede the old ADR, don't rewrite
  its history (see Status conventions).

## Format (match the existing files)

- **Location:** `docs/adr/NNNN-kebab-slug.md`.
- **Number:** four-digit, zero-padded, monotonic. The next number is one above
  the highest existing file — never reuse or renumber.
- **Slug:** short, descriptive, kebab-case (e.g. `lazy-drive-sync`).
- **Title line:** `# ADR NNNN — <concise title>`.
- **Header block**, immediately under the title, as a bullet list:
  ```markdown
  - **Status:** Proposed
  - **Date:** <YYYY-MM-DD>
  - **Deciders:** <names>
  - **Implements:** <link / ticket / TBD>
  ```

### Section structure

Required, in this order:

1. `## Context` — the forces at play: the problem, the constraints, the current
   state, what makes the decision necessary. State facts, not narrative.
2. `## Decision` — what was chosen, stated plainly. Split into numbered
   subsections when the decision has distinct parts.
3. `## Consequences` — with `### Positive` and `### Negative / risks`
   subsections. Include the confidence level and what would trigger a revisit.
4. `## Alternatives considered` — each serious option with why it was rejected.
   An ADR with no alternatives is a red flag; there is almost always a
   do-nothing option.

Optional, add only when they carry weight (all appear in existing ADRs):
`### Implementation details` (under Context), `## Abstractions: kept, modified,
dropped`, `## Known limitations`, `## Implementation footprint`, `## Testing
strategy`.

## Status conventions

- Values: `Proposed`, `Accepted`, `Superseded by ADR NNNN`.
- New ADRs start `Proposed` unless the user says the decision is already made.
- Never edit the body of an `Accepted` ADR to reflect a changed decision. Write
  a new ADR, set the old one's status to `Superseded by ADR NNNN`, and reference
  the old number in the new ADR's Context.

## Workflow

1. Find the next number: list `docs/adr/`, take the highest `NNNN`, add one.
2. Confirm the slug and title with the user if unclear.
3. Gather the real context — read the code, tickets, or prior ADRs the decision
   touches. Pull facts and code shapes from the source, don't invent them.
4. Draft the file following the format above.
5. Fill `Date` from today's date and `Deciders` from the user (default: the
   current git user).
6. Report the path and the sections written. Do not commit — the user reviews
   and commits.

## Technical-writing style

Follow these for every ADR. They matter more than length; a short ADR that reads
cleanly beats a thorough one that doesn't.

### Consistency

- **One name per concept.** Pick the term and use it everywhere. Don't alternate
  between "the client", "the controller", and "the wrapper" for one thing.
- **Match the codebase's vocabulary.** Use the names that appear in the source
  (`IReactorClient`, `DocumentCache`), not synonyms you prefer.
- **Uniform structure.** Same heading names, same header block, same ordering as
  the other ADRs. A reader who knows one should navigate the next by shape.
- **Consistent formatting.** Code identifiers in backticks, one status
  vocabulary, one date format (`YYYY-MM-DD`).

### Low verbosity

- **Lead with the point.** First sentence of each section states the conclusion;
  detail follows. Don't build up to it.
- **One idea per sentence.** Split compound sentences. Prefer short sentences.
- **Cut filler.** Remove "in order to" (→ "to"), "it is important to note that",
  "basically", "simply", "of course", hedges ("arguably", "somewhat").
- **Active voice, strong verbs.** "The server reconciles writes", not "writes
  are reconciled by the server".
- **Lists for sets and sequences** instead of long comma-chains.
- **No restating.** The Decision doesn't re-narrate the Context.

### Plain wording — avoid LLM filler

These read as machine-written and drift from the team's voice. Do not use them
in ADRs:

- **Metaphor-jargon:** load-bearing, footgun, sharp edge, first-class citizen,
  batteries-included, source of truth (prefer "authoritative" / say what owns
  the data), happy path (say "the normal case"), blast radius, north star.
- **Inflation words:** delve, leverage (→ "use"), utilize (→ "use"), robust,
  seamless, powerful, comprehensive, rich, elegant, crucial, vital, key
  (as filler), significant (unless quantified), notably, importantly.
- **Transition filler:** "It's worth noting that", "It's important to
  understand", "That said", "At the end of the day", "When it comes to".
- **Hype framing:** "game-changer", "under the hood", "the beauty of this",
  "best-in-class", "cutting-edge", "empowers".
- **Hollow closers:** "In summary" / "In conclusion" paragraphs that repeat
  what was said, "This ensures a smooth experience".

Say the concrete thing instead. "A load-bearing assumption" → "the design
depends on X". "This is a footgun" → "callers that do X get Y". Existing ADR
0001 has a `### Load-bearing facts` heading; prefer plain alternatives like
`### Key facts about the current sync stack` going forward.

### Before finishing

Reread the draft and check: one term per concept, no banned phrase slipped in,
every section leads with its point, alternatives are real, and the status matches
whether the decision is proposed or made.
