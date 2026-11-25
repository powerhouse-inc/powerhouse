import { File, Folder, SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";
import type { ProjectFile, ProjectFileList } from "../../api.js";
import type { CodeLang } from "../../lib/highlight.js";
import { Code } from "../../components/code.js";
import { EmptyText, Mono } from "../../components/text.js";
import { Button } from "../../ui/button.js";
import { useOpenInEditor } from "../../project/open-in-editor.js";
import { belowFolder } from "./page-module.js";
import { StaleNote } from "../../project/with-project.js";
import {
  useProjectFile,
  useProjectFileList,
  type ProjectResource,
} from "../../project/provider.js";
import { Row, Rows } from "../../components/rows.js";

/** The files of the module in `folder`. Undefined until the list has
 * answered. */
export function useModuleFiles(folder: string): {
  list: ProjectResource<ProjectFileList>;
  files: ProjectFile[] | undefined;
} {
  const list = useProjectFileList();
  const files =
    list.state === "ready"
      ? (list.data.modules.find((module) => module.folder === folder)?.files ??
        [])
      : undefined;
  return { list, files };
}

const LANG: Record<string, CodeLang> = {
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  mjs: "typescript",
  graphql: "graphql",
  gql: "graphql",
  json: "json",
};

const langOf = (path: string): CodeLang | undefined =>
  LANG[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];

type TreeRow =
  | { kind: "directory"; key: string; name: string; depth: number }
  | {
      kind: "file";
      key: string;
      name: string;
      depth: number;
      file: ProjectFile;
    };

/** The files as an indented tree, each directory once, before its first file.
 * The files come sorted by path. */
function treeRows(files: readonly ProjectFile[], folder: string): TreeRow[] {
  const seen = new Set<string>();
  const rows: TreeRow[] = [];
  for (const file of files) {
    const parts = belowFolder(file.path, folder).split("/");
    parts.slice(0, -1).forEach((name, depth) => {
      const key = parts.slice(0, depth + 1).join("/");
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ kind: "directory", key: `${key}/`, name, depth });
    });
    rows.push({
      kind: "file",
      key: file.path,
      name: parts.at(-1) ?? file.path,
      depth: parts.length - 1,
      file,
    });
  }
  return rows;
}

const indent = (depth: number) => ({ width: `${depth * 0.875}rem` });

function Tree({
  files,
  folder,
  selected,
  onSelect,
}: {
  files: readonly ProjectFile[];
  folder: string;
  selected: string;
  onSelect: (path: string) => void;
}) {
  return (
    <Rows label="Files" className="grid">
      <div data-testid="ph-files">
        {treeRows(files, folder).map((row) =>
          row.kind === "directory" ? (
            <div
              key={row.key}
              role="presentation"
              className="flex min-h-6 items-center gap-1.5 px-2 text-[12px] text-muted-foreground"
            >
              <span className="shrink-0" style={indent(row.depth)} />
              <Folder aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{row.name}</span>
            </div>
          ) : (
            <Row
              key={row.key}
              selected={row.file.path === selected}
              onSelect={() => onSelect(row.file.path)}
              label={belowFolder(row.file.path, folder)}
              data-testid="ph-file"
              data-path={row.file.path}
              className="flex min-h-6 gap-x-1.5 text-[12px]"
            >
              <span className="shrink-0" style={indent(row.depth)} />
              <File
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <Mono className="min-w-0 flex-1 truncate">{row.name}</Mono>
            </Row>
          ),
        )}
      </div>
    </Rows>
  );
}

function FileText({ path }: { path: string }) {
  const file = useProjectFile(path);
  if (file.state === "loading") {
    return <p className="text-[13px] text-muted-foreground">Reading…</p>;
  }
  if (file.state === "unavailable") {
    return (
      <p
        role="alert"
        data-testid="ph-file-error"
        className="text-[13px] [overflow-wrap:anywhere] text-destructive"
      >
        {file.message}
      </p>
    );
  }
  const { text, truncated } = file.data;
  return (
    <>
      {file.staleMessage && (
        <StaleNote data-testid="ph-file-stale" message={file.staleMessage} />
      )}
      {truncated && (
        <p
          data-testid="ph-file-truncated"
          className="mb-2 text-[12px] text-muted-foreground"
        >
          Showing the first{" "}
          {Math.round(new TextEncoder().encode(text).length / 1024)} KB.
        </p>
      )}
      {text === "" ? (
        <EmptyText>Empty file.</EmptyText>
      ) : (
        <Code
          lang={langOf(path)}
          className="max-h-[32rem] @3xl/split:max-h-none @3xl/split:min-h-0 @3xl/split:flex-1"
        >
          {text}
        </Code>
      )}
    </>
  );
}

function FileView({ file, folder }: { file: ProjectFile; folder: string }) {
  const open = useOpenInEditor();
  return (
    <div
      data-testid="ph-file-view"
      data-path={file.path}
      className="flex min-h-0 min-w-0 flex-col"
    >
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1">
        <Mono title={file.path} className="min-w-0 truncate text-[12px]">
          {belowFolder(file.path, folder)}
        </Mono>
        <Button
          variant="ghost"
          size="xs"
          data-testid="ph-open-file"
          data-file={file.path}
          title={`Open ${file.path} in your editor`}
          disabled={!open}
          onClick={() => open?.(file.path)}
          className="ml-auto"
        >
          <SquareArrowOutUpRight />
          Open in editor
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-2">
        <FileText key={file.path} path={file.path} />
      </div>
    </div>
  );
}

function Browser({
  files,
  folder,
}: {
  files: readonly ProjectFile[];
  folder: string;
}) {
  const [pick, setPick] = useState<string>();
  const selected = files.find((file) => file.path === pick) ?? files[0];
  return (
    <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border @lg:grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)] @lg:grid-rows-[minmax(0,1fr)] @3xl/split:min-h-64 @3xl/split:flex-1">
      <div className="max-h-48 min-w-0 overflow-auto border-b p-1 @lg:max-h-none @lg:border-r @lg:border-b-0">
        <Tree
          files={files}
          folder={folder}
          selected={selected.path}
          onSelect={setPick}
        />
      </div>
      <FileView file={selected} folder={folder} />
    </div>
  );
}

/** The module's files beside the text of the one chosen. */
export function FilesTab({ folder }: { folder: string }) {
  const { list, files } = useModuleFiles(folder);
  return (
    <div
      data-testid="ph-module-files"
      className="@container flex min-w-0 flex-1 flex-col @3xl/split:min-h-0"
    >
      {list.state === "unavailable" ? (
        <p className="text-[13px] [overflow-wrap:anywhere] text-destructive">
          {list.message}
        </p>
      ) : !files ? (
        <p className="text-[13px] text-muted-foreground">Reading…</p>
      ) : (
        <>
          {list.state === "ready" && list.staleMessage && (
            <StaleNote
              data-testid="ph-files-stale"
              message={list.staleMessage}
            />
          )}
          {files.length === 0 ? (
            <EmptyText>No files.</EmptyText>
          ) : (
            <Browser files={files} folder={folder} />
          )}
        </>
      )}
    </div>
  );
}
