# Delivery tracker

Release identifier: `cf-v1`

Implementation owner: `@yasiel`

| Milestone | Status            | Included work                                                             |
| --------- | ----------------- | ------------------------------------------------------------------------- |
| M0        | `PASSED`          | B9 tooling baseline, source config, source loader, and evidence workspace |
| M1        | `PASSED`          | Model compiler, scalar catalog, model parity, protocol, and SDL evidence  |
| M2        | `PASSED`          | Subgraph compiler, host integration, loaders, and packed consumers        |
| M3        | `PASSED`          | Fixture-family migration tooling and synthetic replay evidence only       |
| M4        | `NOT ESTABLISHED` | Deferred pending approved reference machines and budgets                  |
| M5        | `NOT ESTABLISHED` | No production-family pilot or retirement in this release                  |
| Phase F   | `PASSED`          | Reproducible standalone mixed consumer through Connect and Switchboard    |

## Accepted implementation interpretations

1. `defineSubgraph` ships from `@powerhousedao/reactor-api`. The host-agnostic compiler and
   `createSubgraphDefiner(base)` remain in `document-model`, avoiding a project-reference cycle.
2. Author declarations import the unscoped `document-model` package.
3. A missing `definitionSources` field fails `ph model check` with exit code 2. During the
   compatibility window, `ph build` warns and continues for packages that omit the field. An
   explicit V1 `legacy` configuration produces the closed `skipped` report.
4. The scalar catalog implements the `document-engineering-1.40` validators locally. B14 compares
   them with `@powerhousedao/document-engineering@1.40.5`; the implementation may import those
   schemas only if the comparison finds drift.
5. The scoped deterministic B5 profile depends on B8 and B9 and proves packed-file portability,
   declarations, Node imports, and browser-worker imports. Its original B4 performance-budget
   prerequisite remains `NOT ESTABLISHED`; B5 does not claim or substitute for those deferred
   reference-machine budgets.
6. B2 is established only for the explicit `synthetic-only-v1` profile: 3 committed histories,
   14 raw operations, and 17 prefixes. Its report retains the production stratum as
   `not-established` with zero cases and does not claim the deferred restricted-corpus proof.
7. `defineSubgraph` binds its generated `BaseSubgraph` instance directly into resolver calls as
   `subgraph`, matching current `getResolvers(this)` behavior. Authors do not declare a separate
   `services` factory.
8. Code-first subgraph declarations do not contain an `access` property. Resolver callbacks own
   authorization and call the inherited `BaseSubgraph` helpers at the required point. The compiler
   emits the V1 structured-definition `manual` marker for compatibility and adds no wrapper.

## Evidence scope

The deterministic evidence set is B9, B1, B3, B6, B14, B7, B8, B5, B2 synthetic, and B10
deterministic. B4, B11, B12, B13, and the B2 production corpus remain `NOT ESTABLISHED`. Migration
tests use fixture families. No production document-model package changes in this release.

The standalone mixed legacy and code-first repository was built only after the in-repository
implementation and deterministic gates passed. It is a consumer fixture, not a production-family
pilot, so it does not establish M5.

## Deterministic gate ledger

| Gate              | Evidence status | Current result                                       |
| ----------------- | --------------- | ---------------------------------------------------- |
| B9                | `PASSED`        | 9 assertions across 29 failure injections            |
| B1                | `PASSED`        | 8 assertions across 9 roots and 10 specifications    |
| B3                | `PASSED`        | 8 assertions across 23 protocol-matrix rows          |
| B6                | `PASSED`        | 5 assertions across 4 deterministic SDL cases        |
| B14               | `PASSED`        | 7 assertions across 42 scalar/profile cases          |
| B7                | `PASSED`        | 8 assertions across 7 production-host subgraph cases |
| B8                | `PASSED`        | 11 assertions across 11 current loader/host paths    |
| B5                | `PASSED`        | 6 assertions across 2 isolated packed consumers      |
| B2 synthetic      | `PASSED`        | 9 assertions across 3 histories and 17 prefixes      |
| B10 deterministic | `PASSED`        | 9 lifecycle phases and 9 retirement negative cases   |

B4, B11, B12, B13, and the B2 production corpus remain `NOT ESTABLISHED` by the release scope.

## Standalone mixed-consumer deliverable

The scaffolded repository is at `../cf-mixed-test`, outside the monorepo. The reproducible creator
is `test/code-first-definitions/scripts/scaffold-mixed-repo.mts`; a clean verification run also
completed in a fresh `/tmp/ph-cf-scaffold-proof.final` target.

The consumer contains a JSON/SDL-generated legacy Todo model, an authored code-first Todo V1/V2
family and upgrade, a generated `BaseSubgraph` subclass, and an authored `defineSubgraph` class.
Its deterministic checks pass lint, 100% statement/branch/function/line coverage, TypeScript,
tests, `ph model check`, `ph build`, retained release checking, and Node-condition imports. Live
smokes additionally passed through Switchboard's composed GraphQL supergraph and Connect's worker
reactor, including legacy and code-first create/mutate/read flows and a code-first V1-to-V2 upgrade.

## Regression verification snapshot

- All ten scoped gate reports in `test/code-first-definitions/.evidence/` have
  `evidence.outcome: "pass"` and zero failed, blocked, or cancelled assertions.
- The evidence workspace passes TypeScript and 51 tests, with 5 explicitly deferred tests skipped.
- Full `test:ci` passes after installing its declared Playwright Chromium dependency.
- `test:codegen` passes all 107 tests with the repository's release-age policy disabled for the
  already-installed dependency set; the default invocation's only failure was the time-dependent
  minimum-release-age policy for the current dev release.
- Vetra E2E passes 24 tests with 4 declared skips. Reactor-browser passes all 624 tests.
- Root TypeScript, project-reference checking, the serial workspace lint, Storybook build, and the
  1,194-module circular-import scan pass. The scan reports no circular dependency.
- Package E2E passes against a fresh locally published `dev.69` closure: Docker Connect and
  Switchboard build and become healthy, and Playwright verifies GraphQL- and UI-dispatched
  operations synchronize through the installed package.

## Compatibility observations

- The existing shared reducer rejects source-mode `PRUNE` before commit because its internal
  `LOAD_STATE` action uses the older flattened shape while the current loader expects
  `{ name, data }`. B3 records the rejection identically for legacy and code-first modules; this
  release does not alter that shared-runtime behavior.
- Duplicate persisted action types are now rejected consistently by both definition adapters with
  `PH-DM-DUPLICATE-ACTION`, including collisions across modules in one specification.
- The current host keeps the first duplicate subgraph registration and retains individual routes
  when Apollo composition fails. B7 preserves both outcomes identically for legacy and code-first
  subgraphs; transactional replacement remains a later host contract.
- Runtime package loaders keep their current distinct namespace rules. Node flattening retains
  non-callable subgraph members, HTTP flattening filters them, and Vite requires matching outer and
  inner names. Connect selects the first matching family module while static and worker loaders
  select the latest. B8 records these as compatibility behavior rather than normalizing them.
- The deterministic B5 package fixture bundles its runtime and declaration dependencies into the
  tarball, so fresh offline consumers install one ordinary package rather than workspace links.
  TypeScript resolves both public entries through the packed `types` condition; runtime Node and
  browser-worker imports select the packed node and browser entries respectively.
- Migration apply writes a deterministic candidate only under
  `document-models/.verification/<family>/`, preserving every legacy byte and retaining
  `reduceLegacy` wrappers. Retirement independently requires an exact target set, current evidence
  bytes, matching family and artifact digests, no live imports, a passing masked verification, and a
  recoverable root; all nine rejected fixture variants preserve their attempted input tree.
