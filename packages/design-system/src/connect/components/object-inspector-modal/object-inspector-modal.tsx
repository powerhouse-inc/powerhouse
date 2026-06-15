import { Icon, Modal } from "#design-system";
import { JsonViewer } from "#design-system/ui";

/**
 * Converts an object to a JSON-serializable form by handling
 * non-serializable values like functions, symbols, and errors.
 */
function toSerializableObject(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value: unknown) => {
      if (typeof value === "function") return "[Function]";
      if (typeof value === "symbol") return "[Symbol]";
      if (value instanceof Error)
        return { name: value.name, message: value.message };
      return value;
    }),
  );
}

export type ObjectInspectorModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly object: unknown;
};

export function ObjectInspectorModal({
  open,
  onOpenChange,
  title,
  object,
}: ObjectInspectorModalProps) {
  const serializableObject = object ? toSerializableObject(object) : null;

  return (
    <Modal
      contentProps={{
        className: "rounded-2xl",
        style: { height: "80vh", width: "80vw", maxWidth: "900px" },
      }}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      <div className="flex size-full flex-col bg-background">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:hover-effect"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {serializableObject ? (
            <JsonViewer data={serializableObject} />
          ) : (
            <p className="text-muted-foreground">No data to display</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
