import type { Project } from "ts-morph";

export type GenerateProcessorArgs = {
  processorName: string;
  project: Project;
  rootDir: string;
  dirPath: string;
  paramCaseName: string;
  camelCaseName: string;
  pascalCaseName: string;
  processorsDirPath: string;
  documentTypes: string[];
};
