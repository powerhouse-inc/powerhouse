import { generateId } from "document-model";
import type { ContentPartType } from "document-models/chat-session";
import { PlusIcon, TrashIcon } from "lucide-react";
import { cn } from "../../lib/utils.js";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

interface PartData {
  [key: string]: unknown;
  id: string;
  type: ContentPartType;
}

interface ContentPartBuilderProps {
  label: string;
  variant: "user" | "assistant" | "tool-result";
  parts: PartData[];
  onChange: (parts: PartData[]) => void;
}

const USER_TYPES: ContentPartType[] = ["TEXT", "IMAGE", "FILE"];
const ASSISTANT_TYPES: ContentPartType[] = [
  "TEXT",
  "REASONING",
  "TOOL_CALL",
  "ERROR",
];
const TOOL_RESULT_TYPES: ContentPartType[] = ["TOOL_RESULT"];

export function ContentPartBuilder({
  label,
  variant,
  parts,
  onChange,
}: ContentPartBuilderProps) {
  const allowedTypes =
    variant === "user"
      ? USER_TYPES
      : variant === "assistant"
        ? ASSISTANT_TYPES
        : TOOL_RESULT_TYPES;

  const addPart = (type: ContentPartType) => {
    const newPart: PartData = {
      id: generateId(),
      type,
      ...(type === "TOOL_CALL"
        ? { toolCallId: `call_${generateId().slice(0, 8)}` }
        : {}),
      ...(type === "TOOL_RESULT" ? { toolCallId: "", toolName: "" } : {}),
    };
    onChange([...parts, newPart]);
  };

  const updatePart = (index: number, key: string, value: unknown) => {
    const updated = parts.map((p, i) =>
      i === index ? { ...p, [key]: value } : p,
    );
    onChange(updated);
  };

  const removePart = (index: number) => {
    onChange(parts.filter((_, i) => i !== index));
  };

  const inputClass =
    "w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <div className="flex gap-1">
          {allowedTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addPart(type)}
              className="flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground hover:bg-secondary/80"
            >
              <PlusIcon className="size-2.5" />
              {type}
            </button>
          ))}
        </div>
      </div>

      {parts.map((part, index) => (
        <div
          key={part.id}
          className="rounded-md border border-border bg-muted/20 p-2"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium text-primary">
              {part.type}
            </span>
            <button
              type="button"
              onClick={() => removePart(index)}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            >
              <TrashIcon className="size-3" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-6 shrink-0">
                id
              </span>
              <input
                className={cn(inputClass, "font-mono")}
                value={String(part.id)}
                onChange={(e) => updatePart(index, "id", e.target.value)}
              />
            </div>

            {(part.type === "TEXT" || part.type === "REASONING") && (
              <div className="flex gap-1 items-start">
                <span className="text-[10px] text-muted-foreground w-6 shrink-0 pt-1">
                  text
                </span>
                <textarea
                  className={cn(inputClass, "min-h-[60px] resize-y")}
                  value={str(part.text)}
                  onChange={(e) => updatePart(index, "text", e.target.value)}
                />
              </div>
            )}

            {part.type === "TOOL_CALL" && (
              <>
                <PartField
                  label="callId"
                  inputClass={inputClass}
                  value={part.toolCallId}
                  onChange={(v) => updatePart(index, "toolCallId", v)}
                />
                <PartField
                  label="name"
                  inputClass={inputClass}
                  value={part.toolName}
                  onChange={(v) => updatePart(index, "toolName", v)}
                />
                <div className="flex gap-1 items-start">
                  <span className="text-[10px] text-muted-foreground w-6 shrink-0 pt-1">
                    args
                  </span>
                  <textarea
                    className={cn(
                      inputClass,
                      "min-h-[40px] resize-y font-mono",
                    )}
                    placeholder='{"key": "value"}'
                    value={str(part.args)}
                    onChange={(e) => updatePart(index, "args", e.target.value)}
                  />
                </div>
              </>
            )}

            {part.type === "TOOL_RESULT" && (
              <>
                <PartField
                  label="callId"
                  inputClass={inputClass}
                  value={part.toolCallId}
                  onChange={(v) => updatePart(index, "toolCallId", v)}
                />
                <PartField
                  label="name"
                  inputClass={inputClass}
                  value={part.toolName}
                  onChange={(v) => updatePart(index, "toolName", v)}
                />
                <div className="flex gap-1 items-start">
                  <span className="text-[10px] text-muted-foreground w-6 shrink-0 pt-1">
                    result
                  </span>
                  <textarea
                    className={cn(
                      inputClass,
                      "min-h-[40px] resize-y font-mono",
                    )}
                    value={str(part.result)}
                    onChange={(e) =>
                      updatePart(index, "result", e.target.value)
                    }
                  />
                </div>
                <label className="flex items-center gap-1.5 ml-7">
                  <input
                    type="checkbox"
                    checked={!!part.isError}
                    onChange={(e) =>
                      updatePart(index, "isError", e.target.checked)
                    }
                    className="size-3"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    isError
                  </span>
                </label>
              </>
            )}

            {part.type === "ERROR" && (
              <PartField
                label="error"
                inputClass={inputClass}
                value={part.error}
                onChange={(v) => updatePart(index, "error", v)}
              />
            )}

            {(part.type === "IMAGE" || part.type === "FILE") && (
              <>
                <PartField
                  label="url"
                  inputClass={inputClass}
                  value={part.url}
                  onChange={(v) => updatePart(index, "url", v)}
                />
                <PartField
                  label="type"
                  inputClass={inputClass}
                  value={part.mediaType}
                  onChange={(v) => updatePart(index, "mediaType", v)}
                />
                <PartField
                  label="file"
                  inputClass={inputClass}
                  value={part.filename}
                  onChange={(v) => updatePart(index, "filename", v)}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PartField({
  label,
  inputClass,
  value,
  onChange,
}: {
  label: string;
  inputClass: string;
  value: unknown;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 items-center">
      <span className="text-[10px] text-muted-foreground w-6 shrink-0 truncate">
        {label}
      </span>
      <input
        className={inputClass}
        value={str(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
