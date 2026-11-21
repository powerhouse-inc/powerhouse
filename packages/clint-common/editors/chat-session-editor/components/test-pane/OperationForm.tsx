import { generateId } from "document-model";
import type { ContentPartType } from "document-models/chat-session";
import { useState, useCallback } from "react";
import { cn } from "../../lib/utils.js";
import { useAttachmentService } from "../ContentPartRenderer.js";
import { ContentPartBuilder } from "./ContentPartBuilder.js";
import type { OperationDef } from "./operations.js";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

interface OperationFormProps {
  operation: OperationDef;
  onDispatch: (input: Record<string, unknown>) => void;
}

export function OperationForm({ operation, onDispatch }: OperationFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildDefaults(operation),
  );

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Flatten composite fields (e.g. _image → { attachment })
    const output: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (
        k.startsWith("_") &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v)
      ) {
        Object.assign(output, v);
      } else if (!k.startsWith("_")) {
        output[k] = v;
      }
    }
    onDispatch(output);
    setValues(buildDefaults(operation));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
      {operation.fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(v) => handleChange(field.name, v)}
        />
      ))}
      <button
        type="submit"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Dispatch {operation.name}
      </button>
    </form>
  );
}

export interface FieldDef {
  name: string;
  type:
    | "string"
    | "text"
    | "oid"
    | "datetime"
    | "int"
    | "boolean"
    | "enum"
    | "content-parts"
    | "assistant-content-parts"
    | "tool-result-parts"
    | "agent-info"
    | "image-file";
  required?: boolean;
  label?: string;
  enumValues?: readonly string[];
}

function buildDefaults(operation: OperationDef): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of operation.fields) {
    switch (field.type) {
      case "oid":
        defaults[field.name] = generateId();
        break;
      case "datetime":
        defaults[field.name] = new Date().toISOString();
        break;
      case "int":
        defaults[field.name] = 0;
        break;
      case "boolean":
        defaults[field.name] = false;
        break;
      case "enum":
        defaults[field.name] = field.enumValues?.[0] ?? "";
        break;
      case "content-parts":
      case "assistant-content-parts":
      case "tool-result-parts":
        defaults[field.name] = [];
        break;
      case "agent-info":
        defaults[field.name] = { name: "", model: "" };
        break;
      case "image-file":
        defaults[field.name] = null;
        break;
      default:
        defaults[field.name] = "";
    }
  }
  return defaults;
}

interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

  switch (field.type) {
    case "oid":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}{" "}
            <span className="text-[10px] font-mono">(OID)</span>
          </span>
          <div className="flex gap-1">
            <input
              className={cn(inputClass, "flex-1 font-mono text-xs")}
              value={str(value)}
              onChange={(e) => onChange(e.target.value)}
            />
            <button
              type="button"
              onClick={() => onChange(generateId())}
              className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
            >
              Gen
            </button>
          </div>
        </label>
      );

    case "datetime":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}{" "}
            <span className="text-[10px] font-mono">(DateTime)</span>
          </span>
          <div className="flex gap-1">
            <input
              className={cn(inputClass, "flex-1 font-mono text-xs")}
              value={str(value)}
              onChange={(e) => onChange(e.target.value)}
            />
            <button
              type="button"
              onClick={() => onChange(new Date().toISOString())}
              className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
            >
              Now
            </button>
          </div>
        </label>
      );

    case "text":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}
          </span>
          <textarea
            className={cn(inputClass, "min-h-[80px] resize-y")}
            value={str(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case "string":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}
          </span>
          <input
            className={inputClass}
            value={str(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case "int":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}
          </span>
          <input
            className={inputClass}
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          />
        </label>
      );

    case "boolean":
      return (
        <label className="flex items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 rounded border-input"
          />
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}
          </span>
        </label>
      );

    case "enum":
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {field.label ?? field.name}
          </span>
          <select
            className={cn(inputClass, "cursor-pointer")}
            value={str(value)}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.enumValues?.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      );

    case "content-parts":
      return (
        <ContentPartBuilder
          label={field.label ?? field.name}
          variant="user"
          parts={value as UserContentPartFormData[]}
          onChange={onChange}
        />
      );

    case "assistant-content-parts":
      return (
        <ContentPartBuilder
          label={field.label ?? field.name}
          variant="assistant"
          parts={value as AssistantContentPartFormData[]}
          onChange={onChange}
        />
      );

    case "tool-result-parts":
      return (
        <ContentPartBuilder
          label={field.label ?? field.name}
          variant="tool-result"
          parts={value as ToolResultPartFormData[]}
          onChange={onChange}
        />
      );

    case "image-file":
      return (
        <ImageFilePicker
          label={field.label ?? field.name}
          value={value as ImageFileValue | null}
          onChange={onChange}
        />
      );

    case "agent-info":
      return (
        <AgentInfoFields
          value={value as Record<string, string>}
          onChange={onChange}
        />
      );

    default:
      return null;
  }
}

export interface UserContentPartFormData {
  [key: string]: unknown;
  id: string;
  type: ContentPartType;
  text?: string;
  mediaType?: string;
  url?: string;
  attachment?: string;
  filename?: string;
}

export interface AssistantContentPartFormData {
  [key: string]: unknown;
  id: string;
  type: ContentPartType;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  mediaType?: string;
  url?: string;
  attachment?: string;
  filename?: string;
  error?: string;
}

export interface ToolResultPartFormData {
  [key: string]: unknown;
  id: string;
  type: ContentPartType;
  toolCallId: string;
  toolName: string;
  result?: string;
  isError?: boolean;
  text?: string;
  mediaType?: string;
  url?: string;
  attachment?: string;
}

interface ImageFileValue {
  attachment: string;
}

function ImageFilePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ImageFileValue | null;
  onChange: (v: unknown) => void;
}) {
  const service = useAttachmentService();
  const [uploading, setUploading] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPreviewDataUrl(reader.result as string);
    reader.readAsDataURL(file);

    if (!service) return;

    setUploading(true);
    service
      .reserve({ mimeType: file.type, fileName: file.name })
      .then((upload) => upload.send(file.stream()))
      .then((result) => {
        onChange({ attachment: result.ref });
      })
      .catch(() => {
        onChange(null);
      })
      .finally(() => setUploading(false));
  };

  const handleRemove = () => {
    setPreviewDataUrl(null);
    onChange(null);
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {!service && (
        <p className="text-[10px] text-amber-500">
          No attachment service — image cannot be uploaded.
        </p>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        disabled={uploading}
        className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-secondary-foreground hover:file:bg-secondary/80 disabled:opacity-50"
      />
      {uploading && (
        <p className="text-[10px] text-muted-foreground">Uploading…</p>
      )}
      {previewDataUrl && value && (
        <div className="mt-1 flex items-center gap-2">
          <img
            src={previewDataUrl}
            alt="preview"
            className="size-10 rounded-md object-cover border border-border"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      )}
    </label>
  );
}

function AgentInfoFields({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: unknown) => void;
}) {
  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

  const update = (key: string, v: string) => {
    onChange({ ...value, [key]: v || undefined });
  };

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-2">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Agent Info
      </legend>
      <input
        className={inputClass}
        placeholder="name"
        value={value.name || ""}
        onChange={(e) => update("name", e.target.value)}
      />
      <input
        className={inputClass}
        placeholder="model"
        value={value.model || ""}
        onChange={(e) => update("model", e.target.value)}
      />
      <input
        className={inputClass}
        placeholder="id"
        value={value.id || ""}
        onChange={(e) => update("id", e.target.value)}
      />
      <textarea
        className={cn(inputClass, "min-h-[60px] resize-y")}
        placeholder="description"
        value={value.description || ""}
        onChange={(e) => update("description", e.target.value)}
      />
    </fieldset>
  );
}
