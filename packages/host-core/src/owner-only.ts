import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Files that hold a secret of the user (a control channel's token): theirs
 * alone. Elsewhere that is the file mode. On Windows a file takes the access
 * rules of its folder, and a project folder outside the user's profile
 * commonly lets every signed-in user read it, so the file's list is replaced
 * with one entry for the user (`icacls`, the system's own tool).
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

let sid: string | undefined;
/** The SID of the user this process runs as (Windows). */
function userSid(): string {
  if (sid === undefined) {
    const found = /"(S-[\d-]+)"\s*$/.exec(
      run("whoami.exe", ["/user", "/fo", "csv", "/nh"]).trim(),
    )?.[1];
    if (!found) throw new Error("whoami named no SID.");
    sid = found;
  }
  return sid;
}

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
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes `text` to `file` through a file beside it that is the user's alone
 * before it holds the text, so `file` is never seen empty or open to others.
 * Returns what {@link restrictFileToOwner} did.
 */
export function writeOwnerOnlyFile(file: string, text: string): boolean {
  const draft = `${file}.${process.pid}.tmp`;
  fs.rmSync(draft, { force: true });
  fs.writeFileSync(draft, "", { mode: 0o600 });
  const restricted = restrictFileToOwner(draft);
  fs.writeFileSync(draft, text);
  try {
    fs.renameSync(draft, file);
  } catch {
    // A reader holds the old one open (Windows).
    fs.rmSync(file, { force: true });
    fs.renameSync(draft, file);
  }
  return restricted;
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
