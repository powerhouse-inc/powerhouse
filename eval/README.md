# Connect evals (temporary, not for merge)

Evals of `fix/connect-field-test`, each run from packages published to a local registry: the first three against 190eb31, the last against f304cbb, after the fixes. Each folder has its own `REPORT.md`.

- `customize-connect/`: the first eval of the customize-connect skill, run by the main session. Its document model and editor came from `ph generate`.
- `customize-connect-blind/`: the same task run by a subagent that saw neither the monorepo nor the first report. It used the `reactor-mcp` path over HTTP. `stock-app/` is its project, which was published as `stock-app@1.0.0`.
- `runtime-package/`: a fresh `ph init` project (`consumer-app/`) that loads `stock-app@1.0.0` at runtime through `hosts/connect` and `hosts/switchboard`. It includes the style screenshots and a comparison of the two customize-connect reports.
- `haiku-after-fixes/`: the same blind task, run by a Haiku subagent against `fix/connect-field-test` @ `f304cbb` (after the fixes), on a fresh `parts-app`. The report ends with the main session's verification: which earlier findings are fixed, which persist (the phone layout is confirmed with its cause in `AppLayout`), and what's new. `verify/` holds the phone-layout check.
- `targeted-recheck/`: re-check of the fixes at `a4abd20` against the findings they target, run by the main session.
- `changes-e51daa8/`: a diff review (not a test) of the force-push to `e51daa8`, and which findings are still open.
- `drive-app-opus/`: a blind drive-app eval by an Opus subagent at `e51daa8` (model, editor, drive app, attaching it to drives), with the main session's verification at the end. `drive-app-haiku/` is its Haiku twin.
- `drive-app-haiku/`: the same drive-app eval by a Haiku subagent at `e51daa8`, with the main session's verification and a comparison with the Opus run at the end.
