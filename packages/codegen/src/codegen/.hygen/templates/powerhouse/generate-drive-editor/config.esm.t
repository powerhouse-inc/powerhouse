---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/config.ts"
unless_exists: true
---
import type { PHGlobalEditorConfig } from "@powerhousedao/reactor-browser";

export const editorConfig: PHGlobalEditorConfig = {};