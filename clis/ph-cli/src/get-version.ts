export async function getVersion() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore build time version file
  const { version } = (await import("./version.js")) as { version: string };
  return version;
}
