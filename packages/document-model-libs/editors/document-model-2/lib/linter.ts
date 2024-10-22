import { syntaxTree } from "@codemirror/language";
import { linter, Diagnostic } from "@codemirror/lint";
import { EditorView } from "codemirror";

export const standardLibraryLinter = linter(function standardLibraryLinter(
  view: EditorView,
) {
  const diagnostics: Diagnostic[] = [];
  syntaxTree(view.state)
    .cursor()
    .iterate((node) => {
      if (node.name === "ObjectTypeDefinition") {
        let scalarName = "";
        // Iterate deeper into child nodes to find the name of the scalar
        node.node.cursor().iterate((child) => {
          if (child.name === "Name") {
            // Assuming "Name" is the identifier node
            scalarName = view.state.doc.sliceString(child.from, child.to + 1);
            if (scalarName.includes("OID") && !scalarName.endsWith("!")) {
              diagnostics.push({
                from: child.from,
                to: child.to,
                message: `OID cannot be null.`,
                severity: "error",
              });
            }
          }
        });
      }
    });

  return diagnostics;
});
