import { atom, useAtomValue } from "jotai";

type ConnectConfig = {
  id: "connect";
  appVersion: string | undefined;
  studioMode: boolean;
  warnOutdatedApp: boolean;
  routerBasename: string | undefined;
  analyticsDatabaseName: string | undefined;
  sentry: {
    dsn: string | undefined;
    env: "dev" | "staging" | "production" | undefined;
    tracing: boolean | undefined;
  };
  content: {
    showSearchBar: boolean;
    showDocumentModelSelectionSetting: boolean;
  };
  drives: {
    addDriveEnabled: boolean;
    sections: {
      LOCAL: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
      CLOUD: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
      PUBLIC: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
    };
  };
  gaTrackingId: string | undefined;
  phCliVersion: string | undefined;
};

// add other config types to the union with different id fields
type Config = ConnectConfig;

const initialConfig: Config = {
  id: "connect",
  appVersion: undefined,
  studioMode: false,
  warnOutdatedApp: false,
  routerBasename: undefined,
  analyticsDatabaseName: undefined,
  sentry: {
    dsn: undefined,
    env: undefined,
    tracing: undefined,
  },
  content: {
    showSearchBar: true,
    showDocumentModelSelectionSetting: true,
  },
  drives: {
    addDriveEnabled: true,
    sections: {
      LOCAL: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
      CLOUD: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
      PUBLIC: {
        enabled: true,
        allowAdd: true,
        allowDelete: true,
      },
    },
  },
  gaTrackingId: undefined,
  phCliVersion: undefined,
};

const configAtom = atom<Config>(initialConfig);

export function useConfig() {
  return useAtomValue(configAtom);
}

export function useShouldShowSearchBar() {
  const config = useConfig();
  return config.content.showSearchBar;
}
