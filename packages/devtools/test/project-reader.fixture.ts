import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A project with one module of each kind and one defect of each kind the
 * reader reports: `draft-editor` is in neither `editors/editors.ts` nor the
 * manifest and names a type the project lacks, the manifest lists
 * `note-editor` under an old name, and it does not list `note-counter`.
 * Its modules import no package, so ph-cli's own `tsc` can check them.
 */
const FIXTURE = join(import.meta.dirname, "fixtures", "project-reader");

export const NOTE_JSON = "document-models/note/note.json";

export type FixtureProject = {
  readonly root: string;
  readonly read: (path: string) => string;
  readonly write: (path: string, text: string) => void;
  readonly remove: (path: string) => void;
  readonly dispose: () => void;
};

/** A copy of the fixture in a temp directory, with `files` written on top. A null removes the path. */
export function createFixtureProject(
  files: Readonly<Record<string, string | null>> = {},
): FixtureProject {
  // macOS reaches every temp directory through a symlink.
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-project-reader-")),
  );
  cpSync(FIXTURE, root, { recursive: true });
  const project: FixtureProject = {
    root,
    read: (path) => readFileSync(join(root, path), "utf8"),
    write: (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    remove: (path) => rmSync(join(root, path), { recursive: true }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
  for (const [path, text] of Object.entries(files)) {
    if (text === null) project.remove(path);
    else project.write(path, text);
  }
  return project;
}
