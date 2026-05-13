declare const CODEGEN_VERSION: string | undefined;

export function getCodegenVersion(): string {
  if (typeof CODEGEN_VERSION !== "undefined") return CODEGEN_VERSION;
  return (
    process.env.WORKSPACE_VERSION ||
    process.env.npm_package_version ||
    "unknown"
  );
}
