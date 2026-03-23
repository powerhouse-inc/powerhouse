import { toast } from "@powerhousedao/connect/services";
import { PowerhouseButton } from "@powerhousedao/design-system";
import {
  addRemoteDrive,
  useReactorClient,
} from "@powerhousedao/reactor-browser";
import { gql, request } from "graphql-request";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

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
  const reactor = useReactorClient();
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
              <svg
                width="28"
                height="32"
                viewBox="0 0 28 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0.05092 23.7286L0.000163347 23.9993L0 23.9995L0.207853 24.067L27.6823 24.067L27.9995 23.9995L27.9161 23.6913L14.2182 0.209032L13.9998 0L13.749 0.246353L0.05092 23.7286ZM20.9994 11.9999L7.0003 11.9999L13.9998 23.999L20.9994 11.9999Z"
                  fill="url(#paint0_radial_319_20865)"
                />
                <path
                  d="M14 0L0 23.9998V7.99993L14 0Z"
                  fill="url(#paint1_linear_319_20865)"
                />
                <path
                  d="M28 24L7.82013e-05 24L14 31.9999L28 24Z"
                  fill="url(#paint2_linear_319_20865)"
                />
                <path
                  d="M14 0L28 23.9998V7.99993L14 0Z"
                  fill="url(#paint3_linear_319_20865)"
                />
                <defs>
                  <radialGradient
                    id="paint0_radial_319_20865"
                    cx="0"
                    cy="0"
                    r="1"
                    gradientUnits="userSpaceOnUse"
                    gradientTransform="translate(13.9994 16.0344) rotate(-89.9988) scale(16.0344 16.201)"
                  >
                    <stop offset="0.181008" stopColor="#FFCD6B" />
                    <stop offset="1" stopColor="#EB5EDF" />
                  </radialGradient>
                  <linearGradient
                    id="paint1_linear_319_20865"
                    x1="-0.031454"
                    y1="24.041"
                    x2="13.801"
                    y2="-0.142908"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#4331E9" />
                    <stop offset="1" stopColor="#A273FF" />
                  </linearGradient>
                  <linearGradient
                    id="paint2_linear_319_20865"
                    x1="-0.0310093"
                    y1="24"
                    x2="28.0444"
                    y2="24"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#A273FF" />
                    <stop offset="1" stopColor="#4331E9" />
                  </linearGradient>
                  <linearGradient
                    id="paint3_linear_319_20865"
                    x1="28.0315"
                    y1="24.041"
                    x2="14.199"
                    y2="-0.142908"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#A273FF" />
                    <stop offset="1" stopColor="#4331E9" />
                  </linearGradient>
                </defs>
              </svg>
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
                  <svg
                    className="animate-spin"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15.6867 8.03333C15.4933 7.83999 15.1733 7.83999 14.98 8.03333L14.6733 8.34001V8C14.6733 4.32 11.68 1.32666 7.99999 1.32666C5.96666 1.32666 4.06666 2.23999 2.79333 3.82666C2.61999 4.03999 2.65332 4.35999 2.87332 4.52665C3.08666 4.69999 3.40666 4.66666 3.57332 4.44666C4.65999 3.09332 6.27332 2.31999 7.99999 2.31999C11.1267 2.31999 13.6733 4.86666 13.6733 7.99333V8.32666L13.3667 8.02002C13.1733 7.82669 12.8533 7.82669 12.66 8.02002C12.4667 8.21335 12.4667 8.53335 12.66 8.72668L13.82 9.88668C13.8667 9.93334 13.92 9.96666 13.98 9.99333C14.04 10.02 14.1067 10.0333 14.1733 10.0333C14.24 10.0333 14.3 10.02 14.3667 9.99333C14.4267 9.96666 14.48 9.93334 14.5267 9.88668L15.6867 8.72668C15.88 8.54668 15.88 8.22666 15.6867 8.03333Z"
                      fill="#6C7275"
                    />
                    <path
                      d="M13.1267 11.4666C12.9133 11.2933 12.5933 11.3266 12.4267 11.5466C11.34 12.9 9.72665 13.6733 7.99998 13.6733C4.87332 13.6733 2.32665 11.1266 2.32665 7.99996V7.66663L2.63332 7.97331C2.73332 8.07331 2.85999 8.11996 2.98665 8.11996C3.11332 8.11996 3.23999 8.07331 3.33999 7.97331C3.53332 7.77998 3.53332 7.45998 3.33999 7.26664L2.17998 6.10661C2.13332 6.05994 2.07998 6.02663 2.01998 5.99996C1.89998 5.94663 1.75998 5.94663 1.63998 5.99996C1.57998 6.02663 1.52665 6.05994 1.47999 6.10661L0.319988 7.26664C0.126654 7.45998 0.126654 7.77998 0.319988 7.97331C0.513321 8.16664 0.833319 8.16664 1.02665 7.97331L1.33332 7.66663V7.99996C1.33332 11.68 4.32665 14.6733 8.00665 14.6733C10.04 14.6733 11.94 13.76 13.2133 12.1733C13.38 11.96 13.3467 11.64 13.1267 11.4666Z"
                      fill="#6C7275"
                    />
                  </svg>
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
