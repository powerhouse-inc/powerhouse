import type { Project } from "ts-morph";

export type CommonMakeEditorComponentArgs = {
  project: Project;
  editorFilePath: string;
};

export type CommonGenerateEditorArgs = {
  packageName: string;
  projectDir: string;
  editorDir: string;
  editorName: string;
  editorId: string;
};
