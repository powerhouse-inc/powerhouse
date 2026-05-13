# Gap Report: Building User Experiences — Authorization (07)

**Date:** 2026-05-06
**Reviewed:** `apps/academy/docs/academy/02-MasteryTrack/03-BuildingUserExperiences/07-Authorization/`
Files: `01-RenownAuthenticationFlow.md`, `02-DocumentPermissions.md`, `03-Signing.md`, `04-Authorization.md`
**Against:** `packages/document-model` (dist declarations), `packages/renown/src`, `packages/reactor/src`, `clis/ph-cli/src/commands`
**Focus:** Function signatures, import paths, CLI command flags — mechanical drift in the Signing and CLI-facing docs.

**Note:** `_AuthorizationHooksSpecification.md` carries a "WARNING: Not for live publication" header and is prefixed with `_` (not published by Docusaurus). All hooks defined in it (`useCurrentUser`, `useDocumentPermission`, etc.) are a design spec for unimplemented hooks and are correctly absent from source. Not treated as live documentation.

---

## Findings

| #   | Urgency | Type  | Doc location                                                                                                                                   | Source location                                        | Finding                                                                                                                                                                                                                                                                                                                                                |
| --- | ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | high    | wrong | `ISigner` interface snippet (`03-Signing.md`, Action Signing section)                                                                          | `packages/document-model/dist/src/core/types.d.ts:487` | `publicKey: CryptoKey` documented as a property — source defines it as a method: `publicKey(): Promise<JsonWebKey>`. Wrong in two ways: it's callable, and the return type is `Promise<JsonWebKey>` not `CryptoKey`                                                                                                                                    |
| 2   | high    | wrong | `ISigner` interface snippet (`03-Signing.md`, Action Signing section)                                                                          | `packages/document-model/dist/src/core/types.d.ts:487` | `user?: UserActionSigner`, `app?: AppActionSigner`, and `signAction(action, abortSignal?)` are shown as part of `ISigner` — none of these exist in the `ISigner` interface. `signAction` is a method on `RenownCryptoSigner` specifically; `user`/`app` belong to `ActionSigner`. The doc conflates two separate interfaces                            |
| 3   | high    | wrong | `import { ReactorClientBuilder } from "reactor"` (`03-Signing.md`, Wiring a signer section)                                                    | `packages/reactor/package.json`                        | Package name is `@powerhousedao/reactor`, not `reactor`. Copy-paste of this import will fail at build time                                                                                                                                                                                                                                             |
| 4   | high    | wrong | `import { createSignatureVerifier, RenownCryptoSigner } from "renown"` (`03-Signing.md`, Wiring a signer and ISigner implementations sections) | `packages/renown/package.json`                         | Package name is `@renown/sdk`, not `renown`. Copy-paste of this import will fail at build time                                                                                                                                                                                                                                                         |
| 5   | medium  | stale | Key functions tables (`03-Signing.md`, Header Signing and Action Signing sections)                                                             | `packages/document-model/src/`                         | File paths cited — `document-model/src/core/header.ts`, `document-model/src/core/actions.ts`, `document-model/src/core/crypto.ts` — do not exist under `packages/document-model/src/`. Actual source lives in `@powerhousedao/shared`; these paths only appear in the compiled `dist/`. A developer trying to navigate to the source will find nothing |

---

## Verified Clean

- `createPresignedHeader()`, `createSignedHeader()`, `createSignedHeaderForSigner()`, `validateHeader()` — all confirmed in `packages/document-model/dist/src/core/header.d.ts`, signatures match the doc's table
- `buildOperationSignature()`, `buildSignedAction()`, `verifyOperationSignature()` — confirmed in `dist/src/core/actions.d.ts`
- `buildOperationSignatureParams()`, `buildOperationSignatureMessage()` — confirmed in `dist/src/core/crypto.d.ts`
- `RenownCryptoSigner` — confirmed exported from `packages/renown/src/crypto/signer.ts:18`
- `createSignatureVerifier()` — confirmed exported from `packages/renown/src/crypto/signer.ts:159`
- `ReactorClientBuilder.withSigner(config: ISigner | SignerConfig)` — confirmed at `packages/reactor/src/core/reactor-client-builder.ts:83`, signature matches doc
- `PassthroughSigner` — confirmed at `packages/reactor/src/signer/passthrough-signer.ts:7`
- `ph login --logout` — confirmed flag exists at `clis/ph-cli/src/commands/login.ts:50`
- `ph login --status` — confirmed flag exists at `clis/ph-cli/src/commands/login.ts:30`
- `ph access-token --expiry` — confirmed at `clis/ph-cli/src/commands/access-token.ts`
- `document-model/core` subpath import — confirmed as valid export in `packages/document-model/package.json`
- GraphQL mutation/query names in `02-DocumentPermissions.md` (`grantDocumentPermission`, `revokeDocumentPermission`, `grantGroupPermission`, etc.) — structure is internally consistent; cannot verify against live GQL schema statically

---

## Could Not Verify

- Whether `ph switchboard` (used in the Step 1 example in `02-DocumentPermissions.md`) vs `ph reactor` (used in the Starting the Reactor API section of the same doc) refer to the same thing or different commands — both commands exist in source but which is correct for auth-enabled local development requires runtime verification
- Whether `DEFAULT_PROTECTION`, `DOCUMENT_PERMISSIONS_ENABLED` env vars map to actual config reading in `apps/switchboard` — env var consumption is runtime behaviour
- The `doc.name` field access in the `useDocumentsWithPermission` example (spec file, not live) — field shape of `PHDocument` not verified

---

## Summary

5 findings (2 stale, 0 missing, 3 wrong). The Signing page has the most mechanical drift: the `ISigner` interface snippet is materially wrong (wrong field type, extra fields not in the interface), and both import examples use short package aliases that will fail at build time. CLI command references and function existence checks are all clean.
