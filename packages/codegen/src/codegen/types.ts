export type CodegenOptions = {
  verbose?: boolean;
  force?: boolean;
  legacy?: boolean;
};

export type DocumentTypesMap = Record<
  string,
  { name: string; importPath: string }
>;
