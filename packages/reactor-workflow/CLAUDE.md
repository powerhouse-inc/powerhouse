# reactor-workflow

- Read `README.md` first.
- Nothing under `src/pieces` imports `src/reactor` or any `@powerhousedao/*` package except `@powerhousedao/pieces-framework` (lint-enforced).
- Take piece types, props processors, SSRF classification and error formatting from `@powerhousedao/pieces-framework` (and `/host`). Don't restate them here.
- Compare framework enums (`PropertyType`, `TriggerStrategy`) as strings. A bundle inlines its own framework copy, so `instanceof` and enum identity don't hold.
- Piece code is untrusted: it only runs in the worker (`src/pieces/activepieces/worker`), never in the reactor process.
- Prefer an existing Activepieces hook over a Powerhouse-only addition on pieces.
- A piece feature the engine can't run should fail when the piece is described or enabled, naming the feature. Never ignore it silently.
- Implementing, rejecting or stubbing a piece feature: update "Known missing features" in `README.md`, and the issue it names, in the same PR.
- Tests: `pnpm build` first (suites fork `dist/worker-entry.js`), then `pnpm test`. Prefer real pieces and services over mocks.
