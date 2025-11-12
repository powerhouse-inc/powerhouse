---
to: "<%= editorDir %>/editor.tsx"
unless_exists: true
---
import { <%= editNameComponentName %> } from "./components/EditName.js";

/** Implement your editor behavior here */
export default function Editor() {
  return (
    <div className="py-4 px-8">
      <<%= editNameComponentName %> />
    </div>
  );
}
