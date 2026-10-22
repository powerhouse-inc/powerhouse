# customize-connect eval (temporary)

Output of an end-to-end eval of the `customize-connect` skill on `fix/connect-field-test` @ 190eb31, run from packages published to a local registry. Not for merging.

- `REPORT.md`: the findings.
- `inventory-app/`: the project scaffolded with `ph init inventory-app --pnpm --dev`, as left at the end of the eval. `node_modules`, `dist`, `.ph` and the registry auth token in `.npmrc` are left out. What the eval wrote:
  - `inventory-item.json`: the document-model spec, fed to `ph generate doc --document`;
  - `document-models/inventory-item/v1/tests/scenario.test.ts`;
  - `editors/inventory-item-editor/`;
  - `hosts/connect/routes/`, `hosts/connect/style.css`, `hosts/connect/icon.svg`;
  - `connect.branding` in `powerhouse.config.json`.
- `scripts/`:
  - `registry.mts`, `auth.mts`, `npmrc.mts`: the local-registry setup.
  - `gen-spec.mjs`: writes the spec.
  - `seed.mjs`: creates documents through the reactor's GraphQL API.
  - The rest: the Playwright checks run against Studio (`lib.mjs` holds the shared launcher).
