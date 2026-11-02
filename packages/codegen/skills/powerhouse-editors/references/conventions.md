# Editor code conventions

These apply to every editor and drive app. The project's `tsconfig` (`module: nodenext`, `strict`, `verbatimModuleSyntax`) and oxlint config enforce most type and import rules; `npm run tsc` and `npm run lint:fix` report them. This page covers what they don't catch.

## Import document-model symbols from the barrel

Each document model has one public surface, its top-level barrel `document-models/<name>`. It always points at the latest version. Import every document-model symbol from it: types, `actions.<actionName>` creators, the generated hooks and `utils`.

```typescript
// Good
import { actions, useSelectedTodoDocument } from "document-models/todo";
import type { TodoAction, TodoDocument } from "document-models/todo";

// Bad: deep paths bypass the barrel and break when the version changes
import { addTodo } from "../../document-models/todo/gen/creators.js";
import type { Todo } from "document-models/todo/v1/gen/schema/types.js";
```

The generated hooks are `useSelected<Name>Document`, `use<Name>DocumentById`, `use<Name>DocumentsInSelectedDrive` and `use<Name>DocumentsInSelectedFolder`. There is no `editors/hooks/` folder.

## Path aliases

The project `tsconfig.json` defines these aliases. Use them directly:

- `document-models`, `document-models/<name>`
- `editors`, `editors/<name>`
- `pieces`, `pieces/<name>`
- `processors/<name>`
- `subgraphs`, `subgraphs/<name>`

Don't add an `@/*` alias. The project sets no `baseUrl`, and `@/...` imports don't resolve under `nodenext`.

## Relative imports

Every relative import ends in `.js`, even when the source file is `.ts` or `.tsx`: `./components/ui/button.js`, `../lib/utils.js`. When a third-party CLI writes extensionless imports, add `.js` to every relative path in its files after the install.

## Types

- Avoid `any` and type casts. The lint config does not flag `any`.
- Keep business logic out of presentation components.

## Styling and components

- Style with Tailwind classes or a `<style>` tag. Scope a style tag's selectors to the editor's own elements.
- Split the UI into components, one per file, under the editor's `components/`.
- Prefer the React components of `@powerhousedao/design-system` and `@powerhousedao/document-engineering`. Reach for shadcn or AI Elements only when they lack a primitive; see [shadcn-ai-elements.md](shadcn-ai-elements.md).
