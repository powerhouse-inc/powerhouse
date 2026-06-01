import { getIsEmbedded } from "@powerhousedao/connect/hooks";
import { getBasePath } from "@powerhousedao/connect/utils";
import {
  ConnectSidebar,
  HomeScreen,
  LogoAnimation,
} from "@powerhousedao/design-system/connect";
import { initTheme } from "@powerhousedao/reactor-browser";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import {
  getMigrationStatus,
  subscribeMigrationStatus,
  type MigrationPhase,
} from "./migration-status.js";
const LOADER_DELAY = 250;

const PHASE_LABEL: Record<MigrationPhase, string> = {
  clone: "Backing up local database…",
  dump: "Exporting data from previous version…",
  restore: "Restoring data into the new database…",
};

const MigrationOverlay = () => {
  const status = useSyncExternalStore(
    subscribeMigrationStatus,
    getMigrationStatus,
    () => null,
  );
  if (!status) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className="rounded-lg bg-white/90 px-6 py-4 text-sm text-gray-800 shadow-lg dark:bg-slate-900/90 dark:text-slate-100">
        <div className="font-medium">Upgrading local database…</div>
        <div className="text-gray-700 dark:text-slate-200">
          {PHASE_LABEL[status.phase]}
        </div>
      </div>
    </div>
  );
};

const Loader = ({ delay = LOADER_DELAY }: { delay?: number }) => {
  const isSSR = typeof window === "undefined";
  const showInitialLoader =
    typeof document !== "undefined" &&
    document.body.getAttribute("data-show-loader") === "true";
  if (!isSSR) {
    initTheme();
  }

  const [showLoading, setShowLoading] = useState(!delay || showInitialLoader);

  useEffect(() => {
    const id = setTimeout(() => {
      setShowLoading(true);
    }, delay);

    return () => clearTimeout(id);
  }, []);

  return (
    <div
      className={`skeleton-loader absolute inset-0 z-10 flex items-center justify-center ${showLoading ? "" : "hidden"}`}
    >
      <div className="animate-pulse overflow-hidden rounded-full shadow-lg">
        <LogoAnimation />
      </div>
      {isSSR ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(() => {
                        document.querySelector('.skeleton-loader')?.classList.remove('hidden');
                        document.body.setAttribute('data-show-loader', 'true');
                    }, ${delay})`,
          }}
        />
      ) : null}
    </div>
  );
};

export const AppSkeleton: React.FC<PropsWithChildren> = (props) => {
  const isSSR = typeof window === "undefined";
  const isHomeScreen = !isSSR && window.location.pathname === getBasePath();
  /* Match Root's behavior: when Connect is rendered inside an embed (e.g. the
   * vetra-studio BUILD iframe), suppress the sidebar during the Suspense
   * fallback so the loading state matches the loaded state. */
  const isEmbedded = !isSSR && getIsEmbedded();
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-700">
      {!isEmbedded && (
        <ConnectSidebar
          className="animate-pulse"
          onLogin={undefined}
          onDisconnect={undefined}
          onClickSettings={undefined}
          address={undefined}
        />
      )}
      <HomeScreen
        containerClassName={
          isSSR || !isHomeScreen ? "hidden home-screen" : undefined
        }
        children={props.children ?? null}
      />
      {isSSR ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `
                    const baseEl = document.querySelector('base');
                    const href = baseEl?.getAttribute('href');
                    const basePath = href || '/';
                    if (window.location.pathname === basePath) {
                        document.querySelector('.home-screen')?.classList.remove('hidden')
                    }`,
          }}
        />
      ) : null}
      {!props.children ? <Loader /> : null}
      <MigrationOverlay />
    </div>
  );
};

export default AppSkeleton;
