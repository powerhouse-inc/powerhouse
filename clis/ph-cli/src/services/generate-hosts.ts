import { generateHostsFiles } from "@powerhousedao/codegen";

/** `ph generate hosts`; also run by `ph generate all` when hosts/ exists.
 * Returns false when any host failed. */
export async function startGenerateHosts(projectDir: string): Promise<boolean> {
  const result = await generateHostsFiles(projectDir);
  for (const file of result.written) console.log(`Wrote ${file}`);
  for (const { host, reason } of result.skipped) {
    console.log(`Skipped hosts/${host}: ${reason}`);
  }
  for (const { host, error } of result.failed) {
    console.error(`hosts/${host}: ${error}`);
  }
  return result.failed.length === 0;
}
