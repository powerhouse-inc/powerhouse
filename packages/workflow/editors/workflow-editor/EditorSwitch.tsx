// Per-document editor picker: writes header.meta.preferredEditor so Connect
// remounts the open workflow with the chosen editor module.
import { useSelectedDocument } from "@powerhousedao/reactor-browser";
import { setPreferredEditor } from "@powerhousedao/shared/document-model";

const EDITORS = [
  { id: "workflow-editor", label: "Classic" },
  { id: "workflow-editor-ap", label: "Activepieces" },
];

export function EditorSwitch(props: { active: string }) {
  const [, dispatch] = useSelectedDocument();
  return (
    <div className="flex items-center gap-0.5 rounded border border-solid border-slate-200 p-0.5">
      {EDITORS.map((editor) => {
        const active = editor.id === props.active;
        return (
          <button
            key={editor.id}
            type="button"
            disabled={active}
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              active
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
            onClick={() => dispatch(setPreferredEditor(editor.id))}
          >
            {editor.label}
          </button>
        );
      })}
    </div>
  );
}
