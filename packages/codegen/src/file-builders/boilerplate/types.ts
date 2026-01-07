export type VersioningSchemes = {
  tag?: string;
  version?: string;
};

export type BuildBoilerplatePackageJsonArgs = {
  projectName: string;
} & VersioningSchemes;
