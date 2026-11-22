import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions } from "document-models/brand-sheet";
import type {
  BrandSheetAction,
  BrandSheetState,
  Color,
  ColorRole,
  Imagery,
  Logo,
  MarkType,
  Typeface,
  TypeRole,
  Voice,
} from "document-models/brand-sheet";
import { useRef, useState } from "react";
import { BrandMark, readableText } from "./BrandMark.js";
import {
  AddButton,
  ChipList,
  EditableText,
  Section,
} from "../../shared/fields.js";

type Dispatch = DocumentDispatch<BrandSheetAction>;

/** Resolve a logo's displayable image source: a URL, or its inline base64. */
function logoSrc(logo: Logo): string | null {
  if (logo.assetUrl) return logo.assetUrl;
  if (logo.assetData)
    return `data:${logo.assetMediaType ?? "image/png"};base64,${logo.assetData}`;
  return null;
}

/** Read an image File into the inline-asset shape the model stores. */
function readImageFile(
  file: File,
): Promise<{ data: string; mediaType: string; filename: string }> {
  // FileReader is callback-based; wrap it in a Promise.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // result is a data URL: data:<mediaType>;base64,<data> — keep the data.
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve({
        data: comma >= 0 ? result.slice(comma + 1) : result,
        mediaType: file.type || "image/png",
        filename: file.name,
      });
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

const COLOR_ROLES: ColorRole[] = [
  "PRIMARY",
  "SURFACE",
  "ACCENT",
  "SECONDARY",
  "TEXT",
];
const TYPE_ROLES: TypeRole[] = ["HEADLINE", "BODY", "UI", "NUMERALS"];
const MARK_TYPES: MarkType[] = ["WORDMARK", "SYMBOL", "COMBINATION"];

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Brand header: mark, product name, and positioning maxim. */
export function BrandHeader({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  // Convenience display only: the first SYMBOL logo's image, else a placeholder.
  const symbol = state.logos.find(
    (logo) => logo.markType === "SYMBOL" && logoSrc(logo),
  );
  const symbolSrc = symbol ? logoSrc(symbol) : null;
  return (
    <div className="relative flex items-center gap-5 overflow-hidden rounded-lg border border-border bg-accent p-5">
      <div className="via-vetra-primary pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent opacity-60" />
      <div className="flex size-11 flex-none items-center justify-center text-foreground">
        {symbolSrc ? (
          <img
            src={symbolSrc}
            alt={state.name ?? "Logo"}
            className="max-h-11 max-w-11 object-contain"
          />
        ) : (
          <BrandMark size={44} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <EditableText
          value={state.name}
          placeholder="Product name"
          variant="plain"
          onCommit={(name) => dispatch(actions.setProductName({ name }))}
          className="text-2xl font-semibold text-foreground"
        />
        <EditableText
          value={state.maxim}
          placeholder="Maxim — an action paired with a benefit"
          variant="plain"
          onCommit={(maxim) => dispatch(actions.setMaxim({ maxim }))}
          className="text-sm text-muted-foreground"
        />
      </div>
    </div>
  );
}

/** Concept: the product's positioning paragraph. */
export function ConceptSection({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  return (
    <Section title="Concept">
      <EditableText
        value={state.concept}
        placeholder="What is the product, in a few sentences?"
        multiline
        onCommit={(concept) => dispatch(actions.setConcept({ concept }))}
        className="text-sm/relaxed text-foreground"
      />
    </Section>
  );
}

/** Logo concept: mark type, description, and asset preview per logo. */
export function LogoConcept({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  const addLogo = () =>
    dispatch(
      actions.addLogo({
        id: generateId(),
        description: "",
        markType: "COMBINATION",
      }),
    );

  return (
    <Section
      title="Logo Concept"
      action={<AddButton onClick={addLogo}>Add logo</AddButton>}
    >
      {state.logos.length === 0 ? (
        <Empty>No logos yet.</Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {state.logos.map((logo) => (
            <LogoRow
              key={logo.id}
              logo={logo}
              productName={state.name}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function LogoRow({
  logo,
  productName,
  dispatch,
}: {
  logo: Logo;
  productName: string | null | undefined;
  dispatch: Dispatch;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {MARK_TYPES.map((mark) => (
            <label
              key={mark}
              className="flex items-center gap-1.5 text-sm text-foreground"
            >
              <input
                type="radio"
                name={`marktype-${logo.id}`}
                checked={logo.markType === mark}
                onChange={() =>
                  dispatch(actions.updateLogo({ id: logo.id, markType: mark }))
                }
              />
              {titleCase(mark)}
            </label>
          ))}
          <button
            type="button"
            aria-label="Remove logo"
            onClick={() => dispatch(actions.removeLogo({ id: logo.id }))}
            className="ml-auto text-border hover:text-destructive"
          >
            ×
          </button>
        </div>
        <EditableText
          value={logo.description}
          placeholder="Describe the mark…"
          multiline
          onCommit={(description) =>
            dispatch(actions.updateLogo({ id: logo.id, description }))
          }
          className="text-sm/relaxed text-foreground"
        />
      </div>
      <LogoAssetBox logo={logo} productName={productName} dispatch={dispatch} />
    </div>
  );
}

/**
 * Logo image: click or drop an image to set it (read inline as base64, mirroring
 * the chat editor's attachment handling), with replace and remove affordances.
 */
function LogoAssetBox({
  logo,
  productName,
  dispatch,
}: {
  logo: Logo;
  productName: string | null | undefined;
  dispatch: Dispatch;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const src = logoSrc(logo);

  const setFromFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    void readImageFile(file).then(({ data, mediaType, filename }) =>
      dispatch(
        actions.setLogoAsset({ logoId: logo.id, data, mediaType, filename }),
      ),
    );
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        setFromFile(e.dataTransfer.files[0]);
      }}
      className={`group relative flex min-h-24 items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
        dragOver
          ? "border-muted-foreground bg-muted"
          : "border-border bg-accent"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          setFromFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={src ? "Replace logo image" : "Upload logo image"}
        className="flex w-full items-center justify-center"
      >
        {src ? (
          <img
            src={src}
            alt={logo.assetFilename ?? "Logo"}
            className="max-h-24 max-w-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <BrandMark size={28} />
            <span className="text-xs">
              {productName || "Logo"} — click or drop an image
            </span>
          </span>
        )}
      </button>
      {src ? (
        <button
          type="button"
          aria-label="Remove logo image"
          onClick={() => dispatch(actions.clearLogoAsset({ logoId: logo.id }))}
          className="absolute top-1.5 right-1.5 hidden rounded-full bg-card/90 px-1.5 text-muted-foreground shadow-sm group-hover:block hover:text-destructive"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Color palette: one card per color, grouped visually by role. */
export function ColorPalette({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  const addColor = () =>
    dispatch(
      actions.addColor({
        id: generateId(),
        role: "PRIMARY",
        name: "New color",
        hex: "#888888",
        usage: "",
      }),
    );

  return (
    <Section title="Color Palette">
      <div className="grid grid-cols-3 gap-4">
        {state.colors.map((color) => (
          <ColorCard key={color.id} color={color} dispatch={dispatch} />
        ))}
        <button
          type="button"
          onClick={addColor}
          className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground"
        >
          + add color
        </button>
      </div>
    </Section>
  );
}

function ColorCard({ color, dispatch }: { color: Color; dispatch: Dispatch }) {
  const update = (input: Partial<Omit<Color, "id">>) =>
    dispatch(actions.updateColor({ id: color.id, ...input }));

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-start justify-between px-3 pt-2">
        <select
          value={color.role}
          onChange={(e) => update({ role: e.target.value as ColorRole })}
          className="bg-transparent text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none"
        >
          {COLOR_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Remove color"
          onClick={() => dispatch(actions.removeColor({ id: color.id }))}
          className="text-border hover:text-destructive"
        >
          ×
        </button>
      </div>
      <EditableText
        value={color.usage}
        placeholder="Usage…"
        onCommit={(usage) => update({ usage })}
        className="px-2 text-xs text-muted-foreground"
      />
      <div
        className="relative mt-2 h-16"
        style={{ backgroundColor: color.hex }}
      >
        <input
          type="color"
          aria-label="Pick color"
          value={/^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : "#888888"}
          onChange={(e) => update({ hex: e.target.value })}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none absolute bottom-2 left-2 text-[10px] font-medium tracking-wide uppercase opacity-70"
          style={{ color: readableText(color.hex) }}
        >
          edit
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 px-3 py-2">
        <EditableText
          value={color.name}
          placeholder="Name"
          onCommit={(name) => update({ name })}
          className="text-sm font-medium text-foreground"
        />
        <EditableText
          value={color.hex}
          placeholder="#000000"
          onCommit={(hex) => update({ hex })}
          className="w-20 text-right font-mono text-xs text-muted-foreground"
        />
      </div>
    </div>
  );
}

/** Typography: a row per typeface with a live specimen and alternatives. */
export function TypographySection({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  const addTypeface = () =>
    dispatch(
      actions.addTypeface({
        id: generateId(),
        role: "HEADLINE",
        family: "",
        alternatives: [],
      }),
    );

  return (
    <Section
      title="Typography"
      action={<AddButton onClick={addTypeface}>Add typeface</AddButton>}
    >
      {state.typography.length === 0 ? (
        <Empty>No typefaces yet.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {state.typography.map((typeface) => (
            <TypefaceRow
              key={typeface.id}
              typeface={typeface}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function TypefaceRow({
  typeface,
  dispatch,
}: {
  typeface: Typeface;
  dispatch: Dispatch;
}) {
  const update = (input: Partial<Omit<Typeface, "id">>) =>
    dispatch(actions.updateTypeface({ id: typeface.id, ...input }));

  return (
    <div className="flex gap-3">
      <div
        className="flex size-14 flex-none items-center justify-center rounded-sm border border-border text-3xl text-foreground"
        style={{ fontFamily: typeface.family || undefined }}
      >
        A
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <select
            value={typeface.role}
            onChange={(e) => update({ role: e.target.value as TypeRole })}
            className="bg-transparent text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none"
          >
            {TYPE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Remove typeface"
            onClick={() =>
              dispatch(actions.removeTypeface({ id: typeface.id }))
            }
            className="text-border hover:text-destructive"
          >
            ×
          </button>
        </div>
        <EditableText
          value={typeface.family}
          placeholder="Family"
          onCommit={(family) => update({ family })}
          className="text-base font-medium text-foreground"
        />
        <div className="mt-1">
          <ChipList
            items={typeface.alternatives}
            placeholder="Add alternative…"
            onChange={(alternatives) => update({ alternatives })}
          />
        </div>
      </div>
    </div>
  );
}

/** Voice & tone: qualities, guidance, and prefer/avoid vocabulary. */
export function VoiceSection({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  const voice = state.voice;

  if (!voice) {
    return (
      <Section title="Voice & Tone">
        <AddButton
          onClick={() =>
            dispatch(actions.setVoice({ qualities: [], guidance: "" }))
          }
        >
          Add voice
        </AddButton>
      </Section>
    );
  }

  return (
    <Section title="Voice & Tone">
      <div className="flex flex-col gap-3">
        <ChipList
          items={voice.qualities}
          placeholder="Add quality…"
          onChange={(qualities) => dispatch(actions.updateVoice({ qualities }))}
        />
        <EditableText
          value={voice.guidance}
          placeholder="How should the product speak?"
          multiline
          onCommit={(guidance) => dispatch(actions.updateVoice({ guidance }))}
          className="text-sm/relaxed text-foreground"
        />
        <Vocabulary voice={voice} dispatch={dispatch} />
      </div>
    </Section>
  );
}

function Vocabulary({ voice, dispatch }: { voice: Voice; dispatch: Dispatch }) {
  const set = (prefer: string[], avoid: string[]) =>
    dispatch(actions.setVoiceVocabulary({ prefer, avoid }));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <h5 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Prefer
        </h5>
        <ChipList
          items={voice.vocabulary.prefer}
          placeholder="Add word…"
          tone="prefer"
          onChange={(prefer) => set(prefer, voice.vocabulary.avoid)}
        />
      </div>
      <div>
        <h5 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Avoid
        </h5>
        <ChipList
          items={voice.vocabulary.avoid}
          placeholder="Add word…"
          tone="avoid"
          onChange={(avoid) => set(voice.vocabulary.prefer, avoid)}
        />
      </div>
    </div>
  );
}

/** Imagery direction: prose direction plus include/avoid guidance. */
export function ImagerySection({
  state,
  dispatch,
}: {
  state: BrandSheetState;
  dispatch: Dispatch;
}) {
  const imagery: Imagery = state.imagery ?? {
    direction: null,
    include: [],
    avoid: [],
    references: [],
  };
  const setGuidance = (include: string[], avoid: string[]) =>
    dispatch(actions.setImageryGuidance({ include, avoid }));

  return (
    <Section title="Imagery Direction">
      <div className="flex flex-col gap-3">
        <EditableText
          value={imagery.direction}
          placeholder="Overall visual direction…"
          multiline
          onCommit={(direction) =>
            dispatch(actions.setImageryDirection({ direction }))
          }
          className="text-sm/relaxed text-foreground"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h5 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Include
            </h5>
            <ChipList
              items={imagery.include}
              placeholder="Add subject…"
              tone="prefer"
              onChange={(include) => setGuidance(include, imagery.avoid)}
            />
          </div>
          <div>
            <h5 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Avoid
            </h5>
            <ChipList
              items={imagery.avoid}
              placeholder="Add subject…"
              tone="avoid"
              onChange={(avoid) => setGuidance(imagery.include, avoid)}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
