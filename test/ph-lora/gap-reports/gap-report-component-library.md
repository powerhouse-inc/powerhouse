## Gap Report: Component Library

Reviewed: `docs/academy/06-ComponentLibrary`
Against: `packages/design-system`, `packages/reactor-browser`, `packages/codegen`
Focus: Component names, scalar types, prop interfaces

### Findings

| #   | Urgency | Type  | Doc location                                                                                              | Source location                                                                             | Finding                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------- | ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | high    | wrong | `import { FormInput } from "@powerhousedao/design-system"` — `03-IntegrateIntoAReactComponent.md` line 28 | `packages/design-system/src/index.ts:1–4` and `packages/design-system/package.json` exports | `FormInput` is a value export in the `./connect` subpath (`packages/design-system/src/connect/components/form-input/form-input.tsx:17`). The root package export (`src/index.ts`) only does `export type * from "./connect/types.js"` — types only, no values. Importing `FormInput` from `@powerhousedao/design-system` will resolve to an undefined export. Correct path: `@powerhousedao/design-system/connect` |

### Verified clean

- `FormInput` component exists at `packages/design-system/src/connect/components/form-input/form-input.tsx:17` — name is correct ✅
- `@powerhousedao/design-system/connect` is a named subpath export in `packages/design-system/package.json` ✅
- `FormInput` props used in the doc example (`id`, `value`, `onChange`, `placeholder`, `aria-label`) — all are valid HTML input props inherited through `ComponentPropsWithRef<"input">` in `FormInputProps` ✅
- `@powerhousedao/design-system/connect` barrel re-exports `FormInput` via `connect/index.ts` → `connect/components/index.ts` → `form-input/form-input.tsx` ✅

### Could not verify

All of the following are part of `@powerhousedao/document-engineering`, an external package hosted at `github.com/powerhouse-inc/document-engineering` that is **not present in this monorepo**. The mapped source (`packages/design-system/src`) does not contain any of these exports. They fall within the doc's checkFocus scope but cannot be mechanically verified against the monorepo source:

- `Form` and `BooleanField` from `@powerhousedao/document-engineering/scalars` — components referenced in `00-DocumentEngineering.md` line 127–129
- `BooleanField` props (`name`, `description`, `value`, `onChange`) — documented in `00-DocumentEngineering.md` lines 154–159; external package
- `EthereumAddress` scalar and its `.schema.safeParse()` method — referenced in `03-IntegrateIntoAReactComponent.md` lines 26, 56; external package
- `customScalars`, `resolvers`, `typeDefs`, `generatorTypeDefs`, `validationSchema` exports described in `02-CreateCustomScalars.md` — all internal to the external `document-engineering` repo (`src/scalars/graphql/scalars.ts`)
- `BasePHScalar<T>` type — referenced in `02-CreateCustomScalars.md` line 132; external package
- Import map aliases `#assets`, `#scalars`, `#ui`, `#graphql` — described in `00-DocumentEngineering.md` lines 246–251; external package
- `@powerhousedao/document-engineering`, `/ui`, `/graphql`, `/style.css` subpath imports — cannot verify subpath exports exist without the external package's `package.json`

### Summary

1 finding (0 stale, 0 missing, 1 wrong). The section's single verifiable drift against the mapped packages is that `FormInput` is imported from the wrong path (`@powerhousedao/design-system` root instead of `@powerhousedao/design-system/connect`). The vast majority of the doc's content — component names, scalar types, and prop interfaces — documents the external `@powerhousedao/document-engineering` package which is not part of this monorepo and could not be verified against mapped source files.
