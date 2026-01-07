export type Tag = "dev" | "staging" | "latest" | "";

export type VersioningSchemes = {
  tag?: Tag;
  version?: string;
};

export type BuildBoilerplatePackageJsonArgs = {
  projectName: string;
} & VersioningSchemes;
