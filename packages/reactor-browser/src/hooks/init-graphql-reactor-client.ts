import { useEffect, useState } from "react";
import {
  DEFAULT_DRIVE_ID,
  DEFAULT_SWITCHBOARD_URL,
} from "../graphql/constants.js";
import { initGraphQLReactorClientWithDocumentCache } from "../graphql/init-graphql-reactor-client-with-document-cache.js";

export function useInitReactorGraphqlClient(
  switchboardUrl = DEFAULT_SWITCHBOARD_URL,
  driveId = DEFAULT_DRIVE_ID,
) {
  const [hasInit, setHasInit] = useState(false);

  useEffect(() => {
    if (hasInit) return;

    initGraphQLReactorClientWithDocumentCache(switchboardUrl, driveId)
      .then(() => setHasInit(true))
      .catch(console.error);
  }, [hasInit]);

  return hasInit;
}
