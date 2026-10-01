import { extendType, string, type Type } from "cmd-ts";
import fs from "node:fs";
import path from "node:path";

// cmd-ts's `batteries/fs`, rebuilt on the root entry so bun never loads its CJS build.

const ExistingPath: Type<string, string> = extendType(string, {
  displayName: "path",
  description: "An existing path",
  from(str) {
    const resolved = path.resolve(str);
    if (!fs.existsSync(resolved)) {
      return Promise.reject(new Error("Path doesn't exist"));
    }
    return Promise.resolve(resolved);
  },
});

/** A directory, or the directory of a given file. */
export const Directory: Type<string, string> = extendType(ExistingPath, {
  displayName: "dir",
  description: "A path to a directory or a file within a directory",
  from(resolved) {
    return Promise.resolve(
      fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved),
    );
  },
});

/** An existing file. */
export const File: Type<string, string> = extendType(ExistingPath, {
  displayName: "file",
  description: "A file in the file system",
  from(resolved) {
    if (!fs.statSync(resolved).isFile()) {
      return Promise.reject(new Error("Provided path is not a file"));
    }
    return Promise.resolve(resolved);
  },
});
