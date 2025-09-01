import AtlasIcon from "#assets/icons/Atlas-Logomark.svg?react";
import RefreshIcon from "#assets/icons/refresh.svg?react";
import { PowerhouseButton } from "@powerhousedao/design-system";
import { addRemoteDrive, useReactor } from "@powerhousedao/reactor-browser";
import { gql, request } from "graphql-request";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "../../services/toast.js";

const REACTOR_URL = "https://apps.powerhouse.io/sky-atlas/staging/switchboard";
const MIN_LOADING_TIME = 2000;

function useReactorUrl() {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const url = params.get("reactorUrl") ?? REACTOR_URL;
    return url.endsWith("/") ? url : `${url}/`;
  }, [search]);
}

async function forkAtlas(
  docId: string,
  reactorUrl: string,
): Promise<{ ForkAtlas: string }> {
  const document = gql`
    mutation ForkAtlas($docId: PHID) {
      ForkAtlas(docId: $docId)
    }
  `;
  return await request(`${reactorUrl}graphql`, document, { docId });
}

export function AtlasImport() {
  const status = useRef<
    "initial" | "forking" | "forked" | "addingDrive" | "done" | "error"
  >("initial");
  const reactor = useReactor();
  const { documentId } = useParams();
  const reactorUrl = useReactorUrl();
  const navigate = useNavigate();
  const [driveId, setDriveId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const hasError = status.current === "error";

  useEffect(() => {
    if (error) {
      console.error("Error forking Atlas:", error);
      toast("Error forking Atlas", { type: "error" });
    }
  }, [error]);

  async function forkAtlasDocument(documentId: string) {
    const result = await forkAtlas(documentId, reactorUrl);
    const driveId = result.ForkAtlas;
    status.current = "forked";
    setDriveId(driveId);
  }

  const redirectToDrive = useCallback(() => {
    if (driveId && !loading) {
      navigate(`/d/${driveId}`, { replace: true });
    }
  }, [driveId, navigate, loading]);

  const addForkDrive = useCallback(
    async (driveId: string) => {
      console.log("Adding remote drive:", driveId);
      const driveUrl = `${reactorUrl}d/${driveId}`;
      try {
        const addedDrive = await addRemoteDrive(driveUrl, {
          sharingType: "PUBLIC",
          availableOffline: true,
          listeners: [
            {
              block: true,
              callInfo: {
                data: driveUrl,
                name: "switchboard-push",
                transmitterType: "SwitchboardPush",
              },
              filter: {
                branch: ["main"],
                documentId: ["*"],
                documentType: ["*"],
                scope: ["global"],
              },
              label: "Switchboard Sync",
              listenerId: "1",
              system: true,
            },
          ],
          triggers: [],
        });
        status.current = "done";
        console.log("Added remote drive:", addedDrive);
        setTimeout(() => {
          setLoading(false);
        }, MIN_LOADING_TIME);
      } catch (error) {
        status.current = "error";
        setLoading(false);
        setError(error);
      }
    },
    [addRemoteDrive, navigate, reactorUrl],
  );

  useEffect(() => {
    if (!documentId || status.current !== "initial") return;
    status.current = "forking";
    forkAtlasDocument(documentId).catch((error) => {
      status.current = "error";
      setError(error);
    });
  }, [documentId, status]);

  useEffect(() => {
    if (!driveId || !reactor || status.current !== "forked") return;
    status.current = "addingDrive";
    new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    })
      .then(() => addForkDrive(driveId))
      .catch((error) => {
        status.current = "error";
        setError(error);
      });
  }, [driveId, reactor, status]);

  return (
    <div className="flex size-full justify-center gap-x-4 bg-gray-50">
      <div className="w-full max-w-[850px] rounded-2xl bg-white p-6 drop-shadow-sm">
        <h1 className="text-lg font-medium text-gray-900">
          Welcome to the Atlas Explorer
        </h1>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-6">
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl bg-slate-50">
            <div>
              <AtlasIcon />
            </div>
            {hasError ? (
              <div className="mt-3 text-sm text-gray-800">
                Error forking Atlas scope. Please try again.
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">
                Forking Atlas scope...
              </div>
            )}
            <PowerhouseButton
              onClick={
                hasError
                  ? window.location.reload.bind(window.location)
                  : redirectToDrive
              }
              size="small"
              color="light"
              className="mt-4 h-9 border border-gray-200 bg-white px-3 text-gray-600"
            >
              {hasError ? (
                "Retry"
              ) : loading ? (
                <>
                  <RefreshIcon className="animate-spin" />
                  Loading
                </>
              ) : (
                "Continue"
              )}
            </PowerhouseButton>
          </div>
        </div>
      </div>
    </div>
  );
}
