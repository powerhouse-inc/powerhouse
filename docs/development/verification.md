# Verify a source snapshot and its consumers

Requires Node 24 and Git. The helper tests exercise POSIX process behavior and
need no workspace installation:

```sh
node --test scripts/test/agent-workflow.test.mjs
```

## Capture and transfer

Keep evidence outside Git checkouts and disposable consumer directories. Capture
source before setup; `scripts/new-worktree.sh` runs setup immediately.

```sh
node scripts/agent-context.mjs capture \
  --root /absolute/source-checkout \
  --input . --untracked . \
  --out /absolute/persistent-evidence/source.json \
  --evidence-dir /absolute/persistent-evidence
```

- Repeat `--input` to narrow source/config scopes. Explicit `--untracked` paths
  must fall within them. Ignored preferences and outputs are excluded.
- `--target <file>` requires a captured input. `--required-output <file>` requires
  a consumer output before checks.
- Identity includes commit, selected membership, bytes, executable bits, tracked
  deletions and symlink identities. Capture internal symlink targets separately;
  target bytes are not followed. Escaping symlinks fail.
- Transfer the tracked binary diff and declared new files into a checkout at the
  captured commit. Staging, branch and checkout location may differ. No commit is
  required. The helper does not transfer files or prepare checkouts.

Validate transferred inputs before installing or building:

```sh
node /absolute/tools-checkout/scripts/agent-context.mjs check \
  --root /absolute/destination-checkout \
  --context /absolute/persistent-evidence/source.json
```

Wrong commits, changed inputs and undeclared new source fail.

## Run a profile

```sh
node /absolute/tools-checkout/scripts/verify-task.mjs run \
  --root /absolute/destination-checkout \
  --context /absolute/persistent-evidence/source.json \
  --profile cli-runtime --label candidate \
  --evidence-dir /absolute/persistent-evidence
```

| Profile       | Checks and prerequisites                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `tooling`     | Helper subprocess tests. Capture the four inputs in `scripts/verification-profiles.mjs` or a broader scope.                                    |
| `cli-runtime` | Installed workspace tools, pnpm and Bun; builds the CLI dependency closure, then actual-Node and built-CLI tests.                              |
| `subgraph`    | Builds the reactor-api dependency closure before its `define-subgraph` suite.                                                                  |
| `reactor-pg`  | Explicit `REACTOR_TEST_PG_URL` and a CREATEDB-capable role. Probes connectivity/privileges before builds and the reactor-workflow purge suite. |

Other than `tooling`, profiles require whole-checkout inputs and installed workspace
tools. They do not install dependencies or start services. The workflow PG suite
requires its URL; separate reactor factories default to localhost:5433. Hub-spoke
integration has additional prerequisites and is not selected.

The pnpm/Bun profiles currently require POSIX. For CLI command/help edits,
regenerate tracked `clis/ph-cli/COMMANDS.md` before capture; postbuild rewrites it.

Commands run serially, with producer builds before outputs and consumer checks.
Coordination covers this invocation, not other threads. Source is checked before
steps and after checks; accepted source edits require a new snapshot.

`--deadline-ms` covers source validation and commands; each command also has a deadline. Child
failures retain their exit code. Setup errors exit 2; timeouts exit 124. Reports
distinguish timeouts from ordinary exit 124 and prerequisites from product failures.
Logs use direct file output, without shell pipelines or GNU `timeout`. POSIX timeout
cleanup kills the process group. Operator signals during a command report
`interrupted` and retain their exit code. Each step's `process.json` records its PID and process group.
SIGKILL cannot be trapped; inspect that process information before retrying a
killed run. Interrupts outside command execution can leave incomplete evidence.
Windows command shims and process-tree cleanup are unsupported.

## Custom consumer checks

Reuse `clis/ph-cli/test/helpers/workspace.ts` and `declarations.ts` for compiler
fixtures. Reserve `test/e2e-utils` workspace publishing for explicit registry tests;
it publishes all packages and rewrites `.npmrc`.

Pass `--plan /absolute/plan.json` instead of a profile for an existing consumer:

```json
{
  "name": "consumer-smoke",
  "inputs": ["."],
  "preflight": [],
  "builds": [],
  "outputs": ["clis/ph-cli/dist/cli.mjs"],
  "checks": [
    {
      "argv": ["node", "clis/ph-cli/dist/cli.mjs", "build", "--help"],
      "cwd": ".",
      "timeoutMs": 30000
    }
  ]
}
```

Add producer commands to `builds` when outputs need rebuilding. Plans require
covered `inputs`, argument arrays, relative working directories, positive deadlines
and nonempty `checks`. Optional `prerequisites` list files needed before builds;
command `env` entries override inherited variables.

## Evidence and comparison

Each run prints a unique final report path. Retained files include context, plan,
commands, logs, output hashes and outcomes. No final report means incomplete.
Environment overrides are redacted in the saved plan; restore them before rerunning,
or use the built-in profile with the same environment. Inherited environment is not
recorded.

Run baseline and candidate separately with their own roots, snapshots and labels,
then compare saved reports:

```sh
node scripts/verify-task.mjs compare \
  --root /absolute/tools-checkout \
  --baseline /absolute/persistent-evidence/baseline-run/report.json \
  --candidate /absolute/persistent-evidence/candidate-run/report.json \
  --evidence-dir /absolute/persistent-evidence
```

Comparison requires the same resolved plan and exits zero only when both passed.
It retains both outcomes without inferring causality. Evidence survives consumer
removal; retain the controlling scripts and source-transfer instructions too.
