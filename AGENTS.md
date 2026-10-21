# Repository instructions

Read `AGENTS.local.md` when present and not already loaded. Give delegates explicit paths to applicable local instructions; Git does not copy ignored files.

- Find owners and checks in the [source map](docs/development/source-map.md). Read only task-relevant references.
- Change generated output through its generator in `packages/codegen/src/file-builders/` or `src/templates/`.
- Follow [testing prerequisites](CONTRIBUTING.md#package-prerequisites). Node and Vitest can consume workspace `dist`; finish producer builds before consumer checks.
- For CLI compiler/loader changes, build `ph-cli` and its dependencies, then run `loader-node.test.ts` and `built-cli.test.ts` in `clis/ph-cli/test/`.
- For checkout transfer, bounded consumer checks and retained evidence, use the [verification guide](docs/development/verification.md).
- Search the owning directory first. Exclude dependencies, build outputs and nested worktrees from recursive searches. Integration projects live in root `test/`.
- Read `tools/doc-harness/README.md` only for harness changes or explicitly requested documentation evaluation. It tests Academy recipes against published packages.
