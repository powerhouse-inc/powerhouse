import { CONNECT_RUNNER, loadHost } from "@powerhousedao/host-core";
import { isPassthroughImageRef } from "@powerhousedao/shared/connect/image-ref";

type Drives = { icon?: unknown }[] | undefined;

/** The project files the members' drive declarations name as icons. A server
 * reads them from the project root when it seeds its drives, so a stack has to
 * carry them. Connect's are compiled into its build. */
export async function memberProjectFiles(
  host: {
    children: Record<string, { host: string; reactor?: { drives?: unknown } }>;
  },
  projectRoot: string,
): Promise<string[]> {
  const files = new Set<string>();
  for (const wrapper of Object.values(host.children)) {
    const member = await loadHost(projectRoot, wrapper.host);
    if (member.host.runner.module === CONNECT_RUNNER) continue;
    const declared = [
      ...((member.host.reactor?.drives as Drives) ?? []),
      ...((wrapper.reactor?.drives as Drives) ?? []),
    ];
    for (const { icon } of declared) {
      if (typeof icon === "string" && !isPassthroughImageRef(icon)) {
        files.add(icon);
      }
    }
  }
  return [...files].sort();
}
