import { LOCAL } from "@powerhousedao/design-system";
import {
  addRemoteDrive,
  addTrigger,
  registerNewPullResponderTrigger,
  removeTrigger,
  renameDrive,
  setDriveSharingType,
  useDrives,
} from "@powerhousedao/reactor-browser";
import { getDriveIdBySlug } from "@powerhousedao/reactor-browser";
import type { PullResponderTrigger, Trigger } from "document-drive";
import { logger } from "document-drive";
import { useCallback, useMemo, useRef, useState } from "react";

export type ClientErrorHandler = {
  strandsErrorHandler: (
    driveId: string,
    trigger: Trigger,
    status: number,
    errorMessage: string,
  ) => Promise<void>;
};

const DELAY_LIMIT = 100000;

const isListenerIdNotFound = (errorMessage: string, listenerId?: string) => {
  if (!listenerId) return false;

  return errorMessage
    .toLocaleLowerCase()
    .includes(`transmitter ${listenerId} not found`);
};

export const useClientErrorHandler = (): ClientErrorHandler => {
  const [handlingInProgress, setHandlingInProgress] = useState<string[]>([]);
  const [pullResponderTriggerMap, setPullResponderTriggerMap] = useState<
    Map<string, PullResponderTrigger>
  >(new Map());
  const drives = useDrives();

  const pullResponderRegisterDelay = useRef<Map<string, number>>(new Map());

  const handleStrands400 = useCallback(
    async (driveId: string, trigger: Trigger, handlerCode: string) => {
      setHandlingInProgress((state) => [...state, handlerCode]);

      const triggerData = trigger.data;
      if (!triggerData) return;

      try {
        let pullResponderTrigger = pullResponderTriggerMap.get(handlerCode);

        if (!pullResponderTrigger) {
          pullResponderTrigger = await registerNewPullResponderTrigger(
            driveId,
            triggerData.url,
            {
              pullInterval: Number(triggerData.interval) || 3000,
            },
          );

          if (!pullResponderTrigger) return;
          pullResponderTriggerMap.set(handlerCode, pullResponderTrigger);
          setPullResponderTriggerMap(pullResponderTriggerMap);
        }

        await removeTrigger(driveId, trigger.id);
        await addTrigger(driveId, pullResponderTrigger);

        pullResponderRegisterDelay.current.delete(handlerCode);
      } catch (error) {
        const delay = pullResponderRegisterDelay.current.get(handlerCode) || 1;
        pullResponderRegisterDelay.current.set(
          handlerCode,
          delay === DELAY_LIMIT ? delay : delay * 10,
        );

        logger.error(error);
      } finally {
        setHandlingInProgress((state) =>
          state.filter((code) => code !== handlerCode),
        );
      }
    },
    [
      pullResponderTriggerMap,
      removeTrigger,
      addTrigger,
      pullResponderRegisterDelay,
      registerNewPullResponderTrigger,
    ],
  );

  const handleDriveNotFound = useCallback(
    async (driveId: string, trigger: Trigger, handlerCode: string) => {
      setHandlingInProgress((state) => [...state, handlerCode]);
      try {
        // get local drive by id
        const drive = drives?.find((drive) => drive.header.id === driveId);
        if (!drive) return;
        await removeTrigger(driveId, trigger.id);

        await renameDrive(
          driveId,
          drive.state.global.name + ` (${drive.header.id})`,
        );

        await setDriveSharingType(driveId, LOCAL);

        if (trigger.data?.url && drive.header.slug) {
          const newId = await getDriveIdBySlug(
            trigger.data.url,
            drive.header.slug,
          );
          if (newId) {
            const urlParts = trigger.data.url.split("/");
            urlParts[urlParts.length - 1] = newId;
            const newUrl = urlParts.join("/");

            await addRemoteDrive(newUrl, {
              availableOffline: true,
              sharingType: "PUBLIC",
              listeners: [],
              triggers: [],
            });
          }
        }
      } catch (e: unknown) {
        logger.error(e);
      } finally {
        setHandlingInProgress((state) =>
          state.filter((code) => code !== handlerCode),
        );
      }
    },
    [
      drives,
      removeTrigger,
      renameDrive,
      setDriveSharingType,
      getDriveIdBySlug,
      addRemoteDrive,
    ],
  );

  const strandsErrorHandler: ClientErrorHandler["strandsErrorHandler"] =
    useCallback(
      async (driveId, trigger, status, errorMessage) => {
        switch (status) {
          case 400: {
            if (isListenerIdNotFound(errorMessage, trigger.data?.listenerId)) {
              const autoRegisterPullResponder =
                localStorage.getItem("AUTO_REGISTER_PULL_RESPONDER") !==
                "false";

              if (!autoRegisterPullResponder) return;
              const handlerCode = `strands:${driveId}:${status}`;

              if (handlingInProgress.includes(handlerCode)) return;
              if (!trigger.data) return;

              const delay =
                pullResponderRegisterDelay.current.get(handlerCode) || 0;

              setTimeout(
                () => handleStrands400(driveId, trigger, handlerCode),
                delay,
              );
            }

            break;
          }

          case 404: {
            const handlerCode = `strands:${driveId}:${status}`;
            if (handlingInProgress.includes(handlerCode)) return;
            setTimeout(
              () => handleDriveNotFound(driveId, trigger, handlerCode),
              0,
            );
            break;
          }
        }
      },
      [handleDriveNotFound, handleStrands400, handlingInProgress],
    );

  return useMemo(() => ({ strandsErrorHandler }), [strandsErrorHandler]);
};
