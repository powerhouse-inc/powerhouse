## Gap Report: Reference — Document Models

Reviewed: docs/academy/04-Reference/02-DocumentModels (PHDocument Migration Guide — `05-PHDocumentMigrationGuide.md`; `00-DocumentModelTheory/*` are conceptual prose with no exported names and are out of mechanical scope)
Against: packages/document-model (PHDocument types re-exported from `@powerhousedao/shared/document-model`, symlinked at `packages/shared/document-model`)
Focus: PHDocument migration guide — removed or renamed exports, before/after code samples, document model type shapes

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | medium | stale | TypeScript interface, `header` shape (lines 201–222) | `documents.ts:98` | The documented `PHDocumentHeader` shape omits the `protocolVersions?: { [key: string]: number }` field, which exists on the real `PHDocumentHeader` type and is actively used (`versioned-replay.ts:70`, `documents.ts:198`). A developer transcribing this interface gets an incomplete header type. |
| 2 | low | wrong | Revision example value, used throughout (lines 44, 125–128, 320, 329) | `header.ts:173-175` | The guide consistently presents `revision: { global: 5, local: 0 }` as the canonical seeded shape, but `createPresignedHeader` actually seeds `revision: { document: 0 }`. The type is `{ [scope: string]: number }` so `{ global, local }` is type-valid, but the example does not reflect the scope keys the source actually creates, which can mislead a reader probing `header.revision.global` on a fresh document. |
| 3 | low | stale | Step 3 TypeScript interface, `sig` field (lines 211–214) | `signatures.ts:43-51` | Documented as `sig: { nonce: string; publicKey: any }`; source `PHDocumentSignatureInfo` types `publicKey` as `JsonWebKey` (not `any`) and orders the fields `{ publicKey, nonce }`. Field ordering is cosmetic, but `publicKey: any` is looser than the real type. |

### Verified clean

- `header` consolidation — every property in the migration map maps to a real `PHDocumentHeader` field: `id`, `documentType`, `name`, `slug`, `branch`, `meta`, `createdAtUtcIso`, `lastModifiedAtUtcIso`, `revision`, `sig` all exist (`documents.ts:43-101`).
- `created` → `createdAtUtcIso` rename — confirmed; `createdAtUtcIso` is the real field name (`documents.ts:66`), no `created` field exists.
- `lastModified` → `lastModifiedAtUtcIso` rename — confirmed (`documents.ts:88`).
- `revision` is now an object keyed by scope — confirmed; type is `{ [scope: string]: number }` (`documents.ts:81-83`), no longer a number.
- `document.id` characterized as an Ed25519 signature / immutable — matches the source doc-comment (`documents.ts:42-43`).
- `sig` introduced as a new signature-info field — confirmed; `PHDocumentSignatureInfo` exists with `publicKey` + `nonce` (`signatures.ts:43-51`) and is referenced by `PHDocumentHeader.sig` (`documents.ts:50`).
- `meta?: { preferredEditor?: string }` shape (Step 3 interface) — exactly matches `PHDocumentMeta` (`documents.ts:29-32`).
- Property-access before/after samples (`document.header.id`, `.name`, `.documentType`, `.createdAtUtcIso`, `.lastModifiedAtUtcIso`, `.revision.global`) — all reference real header fields and access the consolidated `header` correctly.
- No removed/renamed package exports are referenced incorrectly: the guide contains no `import` statements and names no exported functions/types from `@powerhousedao/document-model`, so there are no export-existence or import-path drifts to report.

### Could not verify

- GraphQL backward-compatibility claim (Step 4, lines 234–250) — that legacy root-level fields (`id`, `name`, `created`, etc.) "still work due to response transformation." This depends on the reactor-api GraphQL resolver layer, which is outside `packages/document-model` and was not loaded; requires runtime verification of the resolver transformation.
- Related-documentation links at the bottom of the guide (lines 338–341) resolve to valid academy routes — not a source-code check.

### Summary

3 findings (2 stale, 0 missing, 1 wrong). The migration guide is structurally accurate — the `header` consolidation, the key renames (`created`/`lastModified` → `*AtUtcIso`), and the revision-as-object change all match the real `PHDocumentHeader`; the only mechanical drift is the omitted `protocolVersions` header field and example-value mismatches (`revision` scope keys, `publicKey: any`) that are type-valid but do not reflect what the source actually emits.
