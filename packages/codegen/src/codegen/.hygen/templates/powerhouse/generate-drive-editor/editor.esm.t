---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import { withDropZone } from "@powerhousedao/design-system";
import { DriveExplorer } from "./components/DriveExplorer.js";

export const Editor = withDropZone(DriveExplorer);