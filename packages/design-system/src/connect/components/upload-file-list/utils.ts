export function getUploadListTitle(
  count: number,
  explicitTitle?: string,
): string {
  if (explicitTitle) return explicitTitle;
  return `Uploading ${count} document${count === 1 ? "" : "s"}`;
}
