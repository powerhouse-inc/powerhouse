export type CodegenOptions = {
  verbose?: boolean;
  force?: boolean;
};

export type DocumentTypesMap = Record<
  string,
  { name: string; importPath: string }
>;
