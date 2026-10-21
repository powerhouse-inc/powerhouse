import { md } from "@tmpl/core";

export const editorRecipesGuideTemplate = md`
# Editor recipes

Optional patterns for editors. \`AGENTS.md\` holds the rules for every editor.

## Accept dropped files

Use this only when an editor accepts dropped files such as images, PDFs or CSV files. Most editors do not.

Connect wraps each editor in a drop zone that handles only Powerhouse document files (\`.phd\`, \`.phdm\`, \`.zip\`). To accept other files, use the \`useEditorFileDrop\` hook. It adds the drop handlers and a marker attribute that makes the outer drop zone ignore your subtree.

~~~tsx
import { useEditorFileDrop } from "@powerhousedao/reactor-browser";

export default function Editor() {
  const { dragProps, isDragOver } = useEditorFileDrop({
    accept: [".png", ".jpg", ".jpeg", ".pdf"],
    onFiles: (files) => handleFiles(files),
  });

  return (
    <div {...dragProps} className="relative">
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <p className="text-foreground text-base font-medium">
            Drop files to attach
          </p>
        </div>
      )}
      {/* editor content */}
    </div>
  );
}
~~~

The overlay needs \`pointer-events-none\`. Without it, the overlay receives the \`drop\` event and your handler never runs.

If the upload function lives in a child component's React context, such as \`usePromptInputAttachments().add\` inside a \`PromptInput\`, bridge it with a ref. A small bridge component stores the child's function in the ref, and \`onFiles\` calls \`ref.current?.(files)\`.

## Use shadcn and Vercel AI Elements

Use this only when an editor needs components that \`@powerhousedao/design-system\` and \`@powerhousedao/document-engineering\` do not have, usually a chat UI built on Vercel AI Elements (\`Conversation\`, \`Message\`, \`Reasoning\`, \`Tool\`, \`PromptInput\`).

\`shadcn init\` fails here with "could not detect a supported framework", so set up shadcn by hand. Replace \`<name>\` with the editor's name.

1. Install the dependencies: \`pnpm add class-variance-authority clsx tailwind-merge lucide-react tw-animate-css\`.
2. Create \`components.json\` at the project root. Only the shadcn and AI Elements CLIs read its \`@/*\` aliases. Do not add an \`@/*\` alias to \`tsconfig.json\`.

   ~~~json
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
   ~~~

3. Create \`editors/<name>/lib/utils.ts\`. Export the standard \`cn\` helper, \`twMerge(clsx(inputs))\`.
4. Append to \`style.css\`. Do not replace its content. Add \`@import "tw-animate-css";\`, \`@custom-variant dark (&:is(.dark *));\`, a \`@theme inline { ... }\` block that maps \`--color-*\` and \`--radius-*\`, \`:root\` and \`.dark\` blocks with \`oklch(...)\` values, and a \`@layer base\` block. The design-system theme declares its own tokens. Check that the editor and Connect still render correctly in light and dark mode. If they do not, use design-system components instead.
5. Install AI Elements with Vercel's CLI, not shadcn's. Check that each name exists at https://ai-sdk.dev/elements first, because an unknown name stops the install:

   ~~~bash
   npx ai-elements@latest add conversation message reasoning tool prompt-input code-block
   ~~~

   The CLI also installs \`ai\`, \`use-stick-to-bottom\`, \`streamdown\` with \`@streamdown/{cjk,code,math,mermaid}\`, and \`@radix-ui/react-use-controllable-state\`.

6. Move \`components/ai-elements/\` from the project root to \`editors/<name>/components/ai-elements/\`, and delete the empty \`components/\` folder at the root. The files in \`editors/<name>/components/ui/\` are already in the right place.
7. In every file that the CLIs wrote, change the \`@/...\` imports to relative paths with \`.js\`, because \`@/*\` does not resolve under \`nodenext\`. From a file in \`ai-elements/\`, \`@/editors/<name>/components/ui/button\` becomes \`../ui/button.js\`, and \`@/editors/<name>/lib/utils\` becomes \`../../lib/utils.js\`. From a file in \`ui/\`, use \`./button.js\` and \`../../lib/utils.js\`. Also add \`.js\` to sibling imports without an extension, so \`./shimmer\` becomes \`./shimmer.js\`.

### Connect document-model types to AI Elements

AI Elements use the Vercel AI SDK types \`UIMessage\`, \`ToolUIPart\` and \`DynamicToolUIPart\`. Your document model has its own types. Do not convert between them. Use the low-level components that take plain props (\`Message\`, \`MessageContent\`, \`Conversation\`, \`ConversationContent\`, \`Reasoning\`, \`ReasoningTrigger\`, \`ReasoningContent\`, \`Tool\`, \`ToolHeader\`, \`ToolContent\`, \`ToolInput\`, \`ToolOutput\`, \`MessageResponse\`) and write thin wrapper components. For \`ToolHeader\`, pass \`type="dynamic-tool"\` with an explicit \`toolName\` and \`state\`.

| Document-model state         | AI Elements \`ToolPart["state"]\` |
| ---------------------------- | ------------------------------- |
| A tool call without a result | \`"input-available"\`             |
| A tool call with a result    | \`"output-available"\`            |
| A tool call with an error    | \`"output-error"\`                |

If TypeScript reports that your interface has no index signature where \`Record<string, unknown> & { ... }\` is expected, add \`[key: string]: unknown;\` to the interface.

### File layout

~~~
editors/<name>/
  editor.tsx              the editor: edit the generated file
  module.ts               generated: do not edit
  lib/utils.ts            the cn() helper
  components/
    ai-elements/          moved from the project root in step 6
    ui/                   shadcn components from the AI Elements CLI
    <wrappers that connect document-model types to AI Elements>
~~~
`.raw;
