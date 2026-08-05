# test-recipes-e2e

Runs every recipe in the [powerhouse/recipes](https://github.com/powerhouse-inc/recipes)
repo against the Powerhouse packages in **this** checkout, so an API change here
surfaces as a failing recipe instead of as a bug report weeks later.

```sh
pnpm build                  # linked packages resolve through dist/
pnpm test:e2e:recipes
```

## Why it's needed

The recipes repo is a separate pnpm workspace. It resolves `@powerhousedao/*`,
`document-model` and `@renown/sdk` from npm through a `catalog:` block pinned to
a published dev version. On its own, `pnpm -r test` in that repo tells you
nothing about local code.

This runner mirrors the recipes tree into a scratch directory, rewrites those
specifiers to `link:` paths pointing at this monorepo's package directories,
installs, and runs each recipe's `build`, `test` and `start` scripts with a
per-script timeout.

## What it covers, and what it doesn't

`build` (`tsc`) catches type-level breakage. `test` catches behavioural
regressions in what each recipe unit-tests. `start` runs the demo end to end and
is the broadest signal of the three — it exercises reactor wiring that the unit
tests usually stub out.

**It does not catch packaging regressions.** `link:` is a symlink, so a file
missing from a package's `files` allowlist is still visible through it. For that,
see `test/package-e2e`, which publishes real tarballs to a local Verdaccio
registry.

## Not wired into CI

Deliberately. The recipes repo is currently red against `main` for reasons that
have nothing to do with this runner (see below), so a CI job would fail from its
first commit.

The entry point is `recipes`, not `test`, so `pnpm -r run test` and
`nx affected --target=test` can't sweep it up — running the suite has to be an
explicit choice. Unlike `test/package-e2e`, it isn't protected merely by being
absent from an allowlist in the root `test:ci` filter. When the recipes are green
again, the job to add mirrors the `test:e2e:package` step in
`.github/workflows/e2e-tests.yml`, and needs `RECIPES_DIR` pointing at a checkout
of the recipes repo.

### Known-red as of 2026-08-05

33 of 52 scripts fail from two root causes, both from commits already on `main`:

1. `ReactorBuilder.withDocumentModels` was renamed to `withDocumentModelSources`
   (`61e778a5c`, 2026-07-16). This is ~90% of the failures — 16 builds, 17
   starts, 2 tests — plus a tail of `TS7006` implicit-any errors that are
   downstream of the broken builder chain, not independent breaks.
2. `sync-health-monitor` is broken against four sync-surface changes:
   `driveCollectionId` is no longer exported as a value (only the
   `DriveCollectionId` type), `ConnectionStateSnapshot.requiresAuth` became
   required (`1a6a3e702`), `DeadLetterAddedEvent` changed shape, and the channel
   factory gained `options?: RemoteOptions` while `collectionId` narrowed from
   `string`.

Only `document-versioning`, `role-based-auth` and `signed-operations-verifier`
are fully green.

## Recipe classification

Two recipes are skipped in the `start` phase because their demos are
long-running dashboards by design. The list isn't duplicated here — it's parsed
out of the `--filter '!name'` exclusions in the recipes repo's own root `start`
script, so adding or reclassifying a recipe there is picked up automatically.

`start` scripts run serially. `discord-webhook-processor`'s demo binds a fixed
port (9123), and the PGlite-backed recipes are steadier when they aren't
competing for CPU.

`semantic-search`'s test suite is fully offline (it injects a fake embedder), but
its `start` demo loads a real `Xenova/all-MiniLM-L6-v2` ONNX model. That's a
~23MB download on a cold cache, then cached in `semantic-search/.model-cache`.
The mirror step copies that cache across, so a warm local checkout does no
network I/O; CI will pay the download once per run.

## Options

| Flag | Effect |
| --- | --- |
| `--recipes-dir <path>` | Recipes checkout. Defaults to `$RECIPES_DIR`, else `../recipes` beside the monorepo. |
| `--work-dir <path>` | Scratch copy location. Defaults to `$TMPDIR/ph-recipes-e2e`. |
| `--in-place` | Operate on the recipes checkout directly. Faster (reuses its `node_modules`), but mutates its manifests and lockfile — restored on exit and on `SIGINT`/`SIGTERM`. |
| `--only <phases>` | Comma list of `build`, `test`, `start`. |
| `--filter <substr>` | Only recipes matching the substring, by directory or package name. Repeatable. |
| `--skip <substr>` | Exclude matching recipes. Repeatable. |
| `--timeout <seconds>` | Per-script timeout. Default 300. |
| `--no-install` | Reuse the work dir's existing `node_modules`. |
| `--keep` | Leave the scratch copy for inspection. |
| `--verbose` | Stream each script's output live rather than only on failure. |
| `--list` | Print the resolved plan and exit. |

Fast iteration on one recipe:

```sh
pnpm test:e2e:recipes --filter drive-override --only build,test --verbose
```

## Failure modes worth knowing

A **timeout** is reported distinctly from a **failure**. If a demo that used to
exit starts hanging, you get `⏱` rather than a red herring about the assertion
that never ran.

After installing, the runner asserts that every linked package in every recipe's
`node_modules` really is a symlink into this checkout, and hard-fails if any
resolves elsewhere. Without that check, one unrewritten specifier or stale
lockfile entry would let the suite go green while testing published code.
