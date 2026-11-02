import type { ChatImage } from "./types.js";

/** What the chat offers in its file picker and accepts on paste and drop. */
export const CHAT_IMAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/**
 * Every step of a turn resends the whole conversation, so a large photo is
 * scaled down in the tab rather than carried at full size.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2048;
const SCALED_JPEG_QUALITY = 0.85;

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function scaleDown(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  );
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({
    type: "image/jpeg",
    quality: SCALED_JPEG_QUALITY,
  });
}

/** Turns a picked, pasted or dropped file into an attachment for the chat. */
export async function readChatImage(file: File): Promise<ChatImage> {
  if (!CHAT_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `${file.name || "This file"} is not a PNG, JPEG, WebP or GIF image.`,
    );
  }
  const blob = file.size > MAX_IMAGE_BYTES ? await scaleDown(file) : file;
  return {
    dataUrl: await readDataUrl(blob),
    mediaType: blob.type,
    name: file.name || undefined,
  };
}
