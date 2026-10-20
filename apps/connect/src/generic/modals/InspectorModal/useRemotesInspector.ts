import type {
  ConnectionStateSnapshot,
  IPeerAgreement,
  Remote,
  SyncHold,
} from "@powerhousedao/reactor-browser";
import {
  addRemoteDrive,
  PollBehavior,
  useConnectionStates,
  useSync,
} from "@powerhousedao/reactor-browser";
import { useCallback } from "react";

export function useRemotesInspector(): {
  getRemotes: () => Promise<Remote[]>;
  removeRemote: (name: string) => Promise<void>;
  addRemoteManual: (url: string) => Promise<void>;
  triggerPull: (name: string) => void;
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>;
  getAgreement: () => IPeerAgreement;
  getHolds: (remoteName: string) => Promise<SyncHold[]>;
} {
  const syncManager = useSync();
  if (!syncManager) {
    throw new Error("Sync manager not found");
  }

  const connectionStates = useConnectionStates();

  const getRemotes = useCallback(() => {
    return Promise.resolve(syncManager.list());
  }, [syncManager]);

  const removeRemote = useCallback(
    (name: string) => syncManager.remove(name),
    [syncManager],
  );

  const addRemoteManual = useCallback(async (url: string) => {
    await addRemoteDrive(url, undefined, {
      pollBehavior: PollBehavior.Manual,
    });
  }, []);

  const triggerPull = useCallback(
    (name: string) => syncManager.triggerPull(name),
    [syncManager],
  );

  const getAgreement = useCallback(
    () => syncManager.agreement(),
    [syncManager],
  );

  const getHolds = useCallback(
    (remoteName: string) => syncManager.listHolds({ remoteName }),
    [syncManager],
  );

  return {
    getAgreement,
    getHolds,
    getRemotes,
    removeRemote,
    addRemoteManual,
    triggerPull,
    connectionStates,
  };
}
