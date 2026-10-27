# shadcn and Vercel AI Elements

- [When to use](#when-to-use)
- [Setup](#setup)
- [Bridging document-model types](#bridging-document-model-types)
- [File layout](#file-layout)

## When to use

Only when the editor needs primitives that `@powerhousedao/design-system` and `@powerhousedao/document-engineering` lack, typically a chat UI built on AI Elements (`Conversation`, `Message`, `Reasoning`, `Tool`, `PromptInput`). Otherwise use the design-system and document-engineering components.

## Setup

`shadcn init` fails here ("could not detect a supported framework"), so configure shadcn by hand. Replace `<name>` with the editor's folder name.

1. Install the dependencies:

   ```bash
   pnpm add class-variance-authority clsx tailwind-merge lucide-react tw-animate-css
   ```

2. Create `components.json` at the project root. The `@/*` aliases here are read by the shadcn and AI Elements CLIs at install time only. Don't add a matching alias to `tsconfig.json`.

   ```json
   {
     "$schema": "https://ui.shadcn.com/schema.json",
     "style": "new-york",
     "rsc": false,
     "tsx": true,
     "tailwind": {
       "config": "",
       "css": "style.css",
       "baseColor": "neutral",
       "cssVariables": true
     },
     "aliases": {
       "components": "@/editors/<name>/components",
       "utils": "@/editors/<name>/lib/utils",
       "ui": "@/editors/<name>/components/ui",
       "lib": "@/editors/<name>/lib",
       "hooks": "@/editors/<name>/hooks"
     },
     "iconLibrary": "lucide"
   }
   ```

3. Create `editors/<name>/lib/utils.ts` exporting the standard `cn` helper (`twMerge(clsx(inputs))`).

4. Styles. Add `@import "tw-animate-css";` to `style.css`. Don't copy shadcn's theme: the design system's `theme.css`, which Connect loads, already defines shadcn's tokens (the `:root` and `.dark` values and their `@theme inline` mapping) and the `dark` variant, and the components use them. Delete any `:root`, `.dark`, `@theme inline` or `@custom-variant` block the shadcn CLI wrote. To recolour this project's Connect, override tokens in `hosts/connect/style.css` (see the customize-connect skill's styles-and-branding guide). Tokens in `style.css` would re-theme every Connect that loads the package.

5. Install AI Elements with Vercel's CLI, not shadcn's. Check each name at `https://ai-sdk.dev/elements` first; an unknown name aborts the install.

   ```bash
   npx ai-elements@latest add conversation message reasoning tool prompt-input code-block
   ```

   The CLI also installs `ai`, `use-stick-to-bottom`, `streamdown` (with `@streamdown/{cjk,code,math,mermaid}`) and `@radix-ui/react-use-controllable-state`.

6. Move `components/ai-elements/` from the project root into `editors/<name>/components/ai-elements/`, then delete the empty root `components/`. Files in `editors/<name>/components/ui/` are already in place.

7. Rewrite the `@/...` imports in every CLI-generated file as relative paths with `.js` extensions. `@/*` does not resolve under `nodenext`, and extensionless relative imports fail too.
   - From an `ai-elements/` file: `@/editors/<name>/components/ui/button` becomes `../ui/button.js`; `@/editors/<name>/lib/utils` becomes `../../lib/utils.js`.
   - From a `ui/` file: `./button.js` and `../../lib/utils.js`.
   - Add `.js` to extensionless sibling imports too, e.g. `./shimmer` becomes `./shimmer.js`.

## Bridging document-model types

AI Elements use the Vercel AI SDK types (`UIMessage`, `ToolUIPart`, `DynamicToolUIPart`). The document model has its own. Don't convert between them. Use the plain-prop primitives (`Message`, `MessageContent`, `Conversation`, `ConversationContent`, `Reasoning`, `ReasoningTrigger`, `ReasoningContent`, `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`, `MessageResponse`) inside thin wrapper components. Give `ToolHeader` `type="dynamic-tool"` with explicit `toolName` and `state`.

| Document-model state | AI Elements `ToolPart["state"]` |
| --- | --- |
| Tool call with no result yet | `"input-available"` |
| Tool call with result | `"output-available"` |
| Tool call with error result | `"output-error"` |

If TypeScript says your interface lacks an index signature where `Record<string, unknown> & { ... }` is expected, add `[key: string]: unknown;` to the interface.

## File layout

```
editors/<name>/
  editor.tsx        main editor (edit the codegen output)
  module.ts         codegen; don't edit
  lib/utils.ts      cn() helper
  components/
    ai-elements/    moved from the project root in step 6
    ui/             shadcn primitives installed by the ai-elements CLI
    ...             wrappers from document-model types to AI Elements primitives
```
