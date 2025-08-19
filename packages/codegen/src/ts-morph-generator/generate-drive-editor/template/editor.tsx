import { WagmiContext } from "@powerhousedao/design-system";
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
