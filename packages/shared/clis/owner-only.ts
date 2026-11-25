import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Files that hold a secret of the user (a key, a credential, a control
 * channel's token): theirs alone. Elsewhere that is the file mode. On Windows
 * a file takes the access rules of its folder, and a project folder outside
 * the user's profile commonly lets every signed-in user read it, so the
 * file's list is replaced with one entry for the user (`icacls`, the
 * system's own tool).
 */

const system32 = (exe: string) =>
  path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", exe);

const run = (exe: string, args: string[]) =>
  execFileSync(system32(exe), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    stdio: ["ignore", "pipe", "ignore"],
  });

let user: { name: string; sid: string } | undefined;
/** The account this process runs as (Windows): its name and SID. */
function currentUser() {
  if (user === undefined) {
    const found = /^"(.+)","(S-[\d-]+)"\s*$/.exec(
      run("whoami.exe", ["/user", "/fo", "csv", "/nh"]).trim(),
    );
    if (!found) throw new Error("whoami named no SID.");
    user = { name: found[1], sid: found[2] };
  }
  return user;
}
const userSid = () => currentUser().sid;
const userName = () => currentUser().name;

/**
 * Makes an existing file the user's alone. Returns false when that could
 * not be done (Windows without its tools): the file keeps the access its
 * folder gives.
 */
export function restrictFileToOwner(file: string): boolean {
  if (process.platform !== "win32") {
    fs.chmodSync(file, 0o600);
    return true;
  }
  try {
    run("icacls.exe", [file, "/inheritance:r", "/grant:r", `*${userSid()}:F`]);
    // A new file can also hold explicit entries, from the creating process's
    // default access list (SYSTEM and Administrators on an elevated runner).
    const user = userName().toLowerCase();
    const others = fileAccessList(file)
      .map((entry) => /^(.+?):\(/.exec(entry)?.[1])
      .filter(
        (name): name is string =>
          name !== undefined && name.toLowerCase() !== user,
      );
    if (others.length > 0) run("icacls.exe", [file, "/remove:g", ...others]);
    return true;
  } catch {
    return false;
  }
}

/** A file beside `file` that is the user's alone before it holds `text`. */
function ownerOnlyDraft(file: string, text: string) {
  const draft = `${file}.${process.pid}.tmp`;
  fs.rmSync(draft, { force: true });
  fs.writeFileSync(draft, "", { mode: 0o600 });
  const restricted = restrictFileToOwner(draft);
  fs.writeFileSync(draft, text);
  return { draft, restricted };
}

/**
 * Writes `text` to `file` through a file beside it that is the user's alone
 * before it holds the text, so `file` is never seen empty or open to others.
 * Returns what {@link restrictFileToOwner} did.
 */
export function writeOwnerOnlyFile(file: string, text: string): boolean {
  const { draft, restricted } = ownerOnlyDraft(file, text);
  try {
    fs.renameSync(draft, file);
  } catch {
    // A reader holds the old one open (Windows).
    fs.rmSync(file, { force: true });
    fs.renameSync(draft, file);
  }
  return restricted;
}

/**
 * Writes `file` as {@link writeOwnerOnlyFile} does, but only when there is
 * none: of two processes that race, one creates it and the other gets
 * `created: false` and reads the winner's.
 */
export function createOwnerOnlyFile(
  file: string,
  text: string,
): { created: boolean; restricted: boolean } {
  const { draft, restricted } = ownerOnlyDraft(file, text);
  try {
    fs.linkSync(draft, file);
    return { created: true, restricted };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { created: false, restricted };
    }
    // A file system without hard links.
    let fd: number;
    try {
      fd = fs.openSync(file, "wx", 0o600);
    } catch (opening) {
      if ((opening as NodeJS.ErrnoException).code === "EEXIST") {
        return { created: false, restricted };
      }
      throw opening;
    }
    fs.closeSync(fd);
    const kept = restrictFileToOwner(file);
    fs.writeFileSync(file, text);
    return { created: true, restricted: kept };
  } finally {
    fs.rmSync(draft, { force: true });
  }
}

const warned = new Set<string>();
/** Says once per file that it could not be made the user's alone. */
export function warnNotOwnerOnly(file: string): void {
  if (warned.has(file)) return;
  warned.add(file);
  console.warn(
    `Could not limit ${file} to your user: other users of this computer may be able to read it.`,
  );
}

/** Who may open `file`, as `icacls` lists it: one `account:(rights)` per
 * entry (Windows). */
export function fileAccessList(file: string): string[] {
  const out = run("icacls.exe", [file]);
  const lines = out.split(/\r?\n/).filter((line) => line.trim() !== "");
  // The first entry follows the path on its line; the last line is a count.
  return lines
    .slice(0, -1)
    .map((line, index) => (index === 0 ? line.slice(file.length) : line).trim())
    .filter((entry) => entry !== "");
}
