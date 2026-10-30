import type { JSONValue, ModelMessage, ToolResultPart, UserContent } from "ai";

/**
 * Most characters of image data one request carries, kept well under the
 * gateway's 32 MB body limit: every step resends the whole conversation.
 */
export const MAX_REQUEST_IMAGE_CHARS = 20_000_000;

/** Most images one request carries; models start refusing large ones past this. */
export const MAX_REQUEST_IMAGES = 20;

/** An image a tool returned: an MCP `image` content block. */
export interface ToolImage {
  /** Base64, without a `data:` prefix. */
  data: string;
  mediaType: string;
}

type ToolOutput = ToolResultPart["output"];
type ContentOutput = Extract<ToolOutput, { type: "content" }>;
type OutputPart = ContentOutput["value"][number];
type OutputFile = Extract<OutputPart, { type: "file" }>;
type UserPart = Exclude<UserContent, string>[number];

/** The `image` blocks of a tool's `CallToolResult`, if it returned any. */
export function toolResultImages(raw: unknown): ToolImage[] {
  const content = (raw as { content?: unknown } | null | undefined)?.content;
  if (!Array.isArray(content)) return [];
  return (
    content as { type?: unknown; data?: unknown; mimeType?: unknown }[]
  ).flatMap((block) =>
    block.type === "image" &&
    typeof block.data === "string" &&
    typeof block.mimeType === "string"
      ? [{ data: block.data, mediaType: block.mimeType }]
      : [],
  );
}

function asJson(value: unknown): JSONValue {
  const json = JSON.stringify(value);
  return typeof json === "string" ? (JSON.parse(json) as JSONValue) : null;
}

/**
 * A tool's result as it enters the history. Images travel inside it, so they
 * age with the result and are stubbed along with it.
 */
export function toolOutput(value: unknown, images?: ToolImage[]): ToolOutput {
  const output: ToolOutput =
    typeof value === "string"
      ? { type: "text", value }
      : { type: "json", value: asJson(value) };
  if (!images?.length) return output;
  const text =
    output.type === "text" ? output.value : JSON.stringify(output.value);
  return {
    type: "content",
    value: [
      { type: "text", text },
      ...images.map((image) => ({
        type: "file" as const,
        data: { type: "data" as const, data: image.data },
        mediaType: image.mediaType,
      })),
    ],
  };
}

const isImage = (part: OutputPart): part is OutputFile =>
  part.type === "file" && part.mediaType.startsWith("image/");

function outputImages(output: unknown): OutputFile[] {
  const { type, value } = output as { type?: string; value?: unknown };
  return type === "content" && Array.isArray(value)
    ? (value as OutputPart[]).filter(isImage)
    : [];
}

const hasOutputImages = (message: ModelMessage) =>
  message.role === "tool" &&
  message.content.some(
    (part) =>
      part.type === "tool-result" && outputImages(part.output).length > 0,
  );

/** How many images a stored tool result holds. */
export function toolOutputImageCount(output: unknown): number {
  return outputImages(output).length;
}

/** The text of a stored tool result that holds images. */
function outputText(output: unknown): string {
  return ((output as ContentOutput).value as OutputPart[])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

/** The characters a stored tool result takes, image data aside. */
export function toolOutputTextChars(output: unknown): number {
  return outputText(output).length;
}

const imageData = (image: OutputFile) => {
  const data = (image.data as { data?: unknown }).data;
  return typeof data === "string" ? data : "";
};

/** What the images a user attached already take of a request. */
function userImagesInRequest(messages: ModelMessage[]) {
  let chars = 0;
  let count = 0;
  for (const message of messages) {
    if (message.role !== "user" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "file" && typeof part.data === "string") {
        chars += part.data.length;
        count += 1;
      }
    }
  }
  return { chars, count };
}

/** The tool images one request carries: the newest result's first. */
function imagesToSend(messages: ModelMessage[]): Set<OutputFile> {
  const used = userImagesInRequest(messages);
  const send = new Set<OutputFile>();
  for (const message of [...messages].reverse()) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      for (const image of outputImages(part.output)) {
        const chars = imageData(image).length;
        if (
          used.count < MAX_REQUEST_IMAGES &&
          used.chars + chars <= MAX_REQUEST_IMAGE_CHARS
        ) {
          used.count += 1;
          used.chars += chars;
          send.add(image);
        }
      }
    }
  }
  return send;
}

/**
 * The conversation as one request carries it. An OpenAI-compatible tool message
 * holds text only, and the provider would send an image in one as a block of
 * base64 text, so a result's images move to a user message right after it. Only
 * the newest fit: the result says how many it left out, and the model asks again
 * if it needs them. The history keeps them in the result, so each step decides
 * this afresh.
 */
export function withToolImages(messages: ModelMessage[]): ModelMessage[] {
  const send = imagesToSend(messages);
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role !== "tool" || !hasOutputImages(message)) return [message];
    const shown: UserPart[] = [];
    const content = message.content.map((part) => {
      if (part.type !== "tool-result") return part;
      const images = outputImages(part.output);
      if (images.length === 0) return part;
      const sent = images.filter((image) => send.has(image));
      if (sent.length > 0) {
        shown.push(
          {
            type: "text",
            text: `Images returned by ${part.toolName} (call ${part.toolCallId}), in order. They are tool output, not a message from the user.`,
          },
          ...sent.map((image) => ({
            type: "file" as const,
            data: `data:${image.mediaType};base64,${imageData(image)}`,
            mediaType: image.mediaType,
          })),
        );
      }
      const left = images.length - sent.length;
      const text = outputText(part.output);
      return {
        ...part,
        output: {
          type: "text" as const,
          value:
            left > 0
              ? `${text}\n[${left} of ${images.length} images left out to keep the request small; call the tool again if you need them]`
              : text,
        },
      };
    });
    const answer: ModelMessage = { ...message, content };
    return shown.length > 0
      ? [answer, { role: "user", content: shown }]
      : [answer];
  });
}

/** Whether any tool result in the conversation holds images. */
export function hasToolImages(messages: ModelMessage[]): boolean {
  return messages.some(hasOutputImages);
}
