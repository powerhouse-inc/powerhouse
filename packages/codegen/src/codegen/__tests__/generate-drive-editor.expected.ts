export const EXPECTED_INDEX_CONTENT = `import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import Editor from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "AtlasDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;`;

export const EXPECTED_EDITOR_CONTENT = `import { WagmiContext } from "@powerhousedao/design-system";
import {
  AnalyticsProvider,
  DriveContextProvider,
  useAppConfig,
  type DriveEditorProps,
} from "@powerhousedao/reactor-browser";
import { DriveExplorer } from "./components/DriveExplorer.js";

/**
 * Base editor component that renders the drive explorer interface.
 * Customize document opening behavior and drive-level actions here.
 */
export function BaseEditor(props: DriveEditorProps) {
  const { context, document } = props;
  return (
    <div className="new-drive-explorer" style={{ height: "100%" }}>
      <DriveExplorer document={document} context={context} />
    </div>
  );
}

/**
 * Main editor entry point with required providers.
 */
export default function Editor(props: DriveEditorProps) {
  const appConfig = useAppConfig();
  const analyticsDatabaseName = appConfig?.analyticsDatabaseName;
  return (
    // Required context providers for drive functionality
    <DriveContextProvider value={props.context}>
      <WagmiContext>
        <AnalyticsProvider databaseName={analyticsDatabaseName}>
          <BaseEditor {...props} />
        </AnalyticsProvider>
      </WagmiContext>
    </DriveContextProvider>
  );
}
`;

export const EXPECTED_MAIN_INDEX_CONTENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js';`;

export const EXPECTED_HEADER_COMMENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/`;

export const EXPECTED_EXISTING_EDITOR_EXPORT = `export { module as ExistingEditor } from './existing-editor/index.js'`;

export const EXPECTED_DRIVE_EXPLORER_EXPORT = `export { module as AtlasDriveExplorer } from './atlas-drive-explorer/index.js'`;
