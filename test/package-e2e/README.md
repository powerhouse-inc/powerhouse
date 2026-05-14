# test-package-e2e

End-to-end test for the Powerhouse package creation flow with a remote Switchboard backend.

## Flow

1. Start local npm registry (`ph-registry`) on host.
2. Scaffold a Powerhouse project in `.project/`, drop in the todo `.zip` spec, run `ph generate` (model + editor), swap the generated reducer/editor stubs for the real implementations from fixtures, then build and `ph publish` to the local registry.
3. `docker compose up` boots Switchboard and Connect containers — each installs the just-published package from the host registry.
4. Playwright drives the Connect UI: adds the remote drive served by Switchboard, creates a todo document, dispatches a few edits.
5. Polls Switchboard's GraphQL API for the document's operations to verify propagation.

## Run

```bash
pnpm test
```

This is currently host-only (no CI wiring). See `scripts/run.ts` for the orchestrator.
