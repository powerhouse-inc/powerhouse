---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import { <%= editNameComponentName %> } from "./components/edit-name.js";

/** Implement your editor behavior here */
export function Editor() {
  return (
    <div className="py-4 px-8">
      <<%= editNameComponentName %> />
    </div>
  );
}
