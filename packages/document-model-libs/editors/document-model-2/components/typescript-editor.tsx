import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import {
  tsAutocomplete,
  tsFacet,
  tsHover,
  tsLinter,
  tsSync,
} from "@valtown/codemirror-ts";
import ts from "typescript";
import {
  createDefaultMapFromCDN,
  createSystem,
  createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import lzstring from "lz-string";

type Props = {
  doc?: string;
};
export function TypescriptEditor(props: Props) {
  const { doc } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const stateRef = useRef<EditorState | null>(null);
  const path = "/index.ts";
  useEffect(() => {
    init();
    async function init() {
      if (!stateRef.current) {
        // Fetch zod type definitions

        const compilerOptions: ts.CompilerOptions = {
          allowJs: true,
          esModuleInterop: true,
          strict: true,
        };
        const fsMap = await createDefaultMapFromCDN(
          compilerOptions,
          ts.version,
          false,
          ts,
          lzstring,
        );

        fsMap.set(path, " ");
        const system = createSystem(fsMap);
        const env = createVirtualTypeScriptEnvironment(
          system,
          [path],
          ts,
          compilerOptions,
        );

        stateRef.current = EditorState.create({
          doc: doc ?? "",
          extensions: [
            basicSetup,
            javascript({
              typescript: true,
              jsx: true,
            }),
            tsFacet.of({ env, path }),
            tsSync(),
            tsLinter(),
            autocompletion({
              override: [tsAutocomplete()],
            }),
            tsHover(),
            oneDark,
            EditorView.lineWrapping,
            EditorView.theme({
              "&": {
                fontSize: "18px",
              },
            }),
          ],
        });
      }

      if (!viewRef.current) {
        const view = new EditorView({
          state: stateRef.current,
          parent: editorRef.current!,
        });

        viewRef.current = view;
      }
    }

    return () => {
      viewRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!doc || !viewRef.current) return;
    const view = viewRef.current!;
    const currentDoc = view.state.doc;
    const currentDocString = currentDoc.toString();
    if (currentDocString !== doc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: doc,
        },
      });
    }
  }, [doc]);

  return <div ref={editorRef} className="my-2" />;
}
