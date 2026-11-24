import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  fetchDevtoolsInfo,
  refusedForThisPage,
  type DevtoolsApiFailureCode,
} from "../api-client.js";
import type { DevStackInfo } from "../api.js";
import { Poller } from "../lib/poller.js";

export type InfoState =
  | { state: "loading" }
  | { state: "ready"; info: DevStackInfo }
  | { state: "unavailable"; code: DevtoolsApiFailureCode; message: string };

/** How long after an answer that did not arrive the next try starts. */
export const INFO_RETRY_MS = 3000;

/** How long an answer is shown before the stack is read again: the services
 * of a run come up after its dev server. */
export const INFO_REFRESH_MS = 5000;

const LOADING: InfoState = { state: "loading" };

/** The stack as the dev server last told it, asked while something shows it. */
class InfoStore {
  #apiBase: string;
  #state: InfoState = LOADING;
  #listeners = new Set<() => void>();
  #poller = new Poller((signal) => this.#ask(signal));

  constructor(apiBase: string) {
    this.#apiBase = apiBase;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#poller.start();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#poller.stop();
    };
  };

  getState = (): InfoState => this.#state;

  async #ask(signal: AbortSignal): Promise<number | undefined> {
    const answer = await fetchDevtoolsInfo(this.#apiBase, signal);
    if (signal.aborted) return undefined;
    if (answer.ok) {
      this.#publish({ state: "ready", info: answer.data });
      return INFO_REFRESH_MS;
    }
    // The last answer stays while the server is away, not once it refuses
    // this page, as a restarted server does.
    const refused = refusedForThisPage(answer.code);
    if (refused || this.#state.state !== "ready") {
      this.#publish({
        state: "unavailable",
        code: answer.code,
        message: answer.message,
      });
    }
    return refused ? undefined : INFO_RETRY_MS;
  }

  #publish(state: InfoState): void {
    if (JSON.stringify(state) === JSON.stringify(this.#state)) return;
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

const InfoContext = createContext<InfoStore | undefined>(undefined);

export function InfoProvider({
  apiBase,
  children,
}: {
  apiBase: string;
  children: ReactNode;
}) {
  const store = useMemo(() => new InfoStore(apiBase), [apiBase]);
  return <InfoContext.Provider value={store}>{children}</InfoContext.Provider>;
}

/** The project and where the parts of its stack answer. Every reader shares
 * one request, repeated while the server is not reached and, less often,
 * once it is. */
export function useDevtoolsInfo(): InfoState {
  const store = useContext(InfoContext);
  if (!store) throw new Error("useDevtoolsInfo needs an InfoProvider above.");
  return useSyncExternalStore(store.subscribe, store.getState);
}
