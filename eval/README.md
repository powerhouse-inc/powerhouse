# Connect evals (temporary, not for merge)

Three evals of `fix/connect-field-test` @ 190eb31, each run from packages published to a local registry. Each folder has its own `REPORT.md`.

- `customize-connect/`: the first eval of the customize-connect skill, run by the main session. Its document model and editor came from `ph generate`.
- `customize-connect-blind/`: the same task run by a subagent that saw neither the monorepo nor the first report. It used the `reactor-mcp` path over HTTP. `stock-app/` is its project, which was published as `stock-app@1.0.0`.
- `runtime-package/`: a fresh `ph init` project (`consumer-app/`) that loads `stock-app@1.0.0` at runtime through `hosts/connect` and `hosts/switchboard`. It includes the style screenshots and a comparison of the two customize-connect reports.
