/** Options for building Connect with a given project's local and external packages included */
export type ConnectBuildOptions = {
  /** The root directory of the project, defaults to `process.cwd()` */
  projectRoot?: string;
  /** The name of the assets directory, defaults to DEFAULT_ASSETS_DIR_NAME */
  assetsDirName?: string;
  /** The name of the external packages file, defaults to DEFAULT_EXTERNAL_PACKAGES_FILE_NAME */
  externalPackagesFileName?: string;
  /** The name of the styles file, defaults to DEFAULT_STYLES_FILE_NAME */
  stylesFileName?: string;
  /** The path to the Connect dist directory, calls `resolveConnect()` if not provided */
  connectPath?: string;
};

/** Options for previewing a built Connect project */
export type ConnectPreviewOptions = {
  /** The root directory of the project, defaults to `process.cwd()` */
  projectRoot?: string;
  /** The port to run the server on, defaults to 4173 (vite preview default) */
  port?: number;
  /** Whether to open the browser, defaults to true */
  open?: boolean;
};
