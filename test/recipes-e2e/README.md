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

## In CI

The `recipes-e2e-tests` job in `.github/workflows/e2e-tests.yml` runs the full
suite on every PR to `main` and on push. It checks out `powerhouse-inc/recipes`
(public, no token) into `recipes-checkout/`, points `RECIPES_DIR` at it, and
raises the per-script timeout to 600s. A failure notifies Discord alongside the
Vetra and Package E2E jobs.

That job tracks the recipes **default branch** rather than a pinned ref, because
the drift this catches runs in both directions. The tradeoff: a push to the
recipes repo can turn this repo's CI red with no change here. If that becomes
disruptive, pin `ref:` on the recipes checkout and bump it deliberately.

The entry point is still named `recipes`, not `test`, so `pnpm -r run test` and
`nx affected --target=test` cannot sweep it up. Only the explicit CI job and a
deliberate `pnpm test:e2e:recipes` run it.

### History

The runner's first sweep found 33 of 52 scripts failing, from two root causes
that had been on `main` for roughly three weeks unnoticed:
`ReactorBuilder.withDocumentModels` renamed to `withDocumentModelSources`
(`61e778a5c`), and `sync-health-monitor` against four sync-surface changes. Both
were fixed in the recipes repo (`6622677`, `556920e`); the suite has been green
since.

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
