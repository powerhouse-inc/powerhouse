export namespace RunAsap {
  export type Task<T = void> = () => T;
  export type AbortTask = () => void;
  export type RunAsap<T> = (task: Task<T>) => AbortTask;

  export const useMessageChannel = (() => {
    if (typeof MessageChannel === "undefined") {
      return new Error("MessageChannel is not supported");
    }

    return (task: Task) => {
      const controller = new AbortController();
      const signal = controller.signal;
      const mc = new MessageChannel();
      mc.port1.postMessage(null);
      mc.port2.addEventListener(
        "message",
        () => {
          task();
          mc.port1.close();
          mc.port2.close();
        },
        { once: true, signal: signal },
      );
      mc.port2.start();
      return () => controller.abort();
    };
  })();

  export const usePostMessage = (() => {
    const _main: unknown =
      (typeof window === "object" && window) ||
      (typeof global === "object" && global) ||
      (typeof self === "object" && self);
    if (!_main) {
      return new Error("No global object found");
    }

    const main = _main as Window;
    if (
      !main.postMessage ||
      !main.addEventListener ||
      (main as { importScripts?: unknown }).importScripts // web workers can't this method
    ) {
      return new Error("postMessage is not supported");
    }

    let index = 0;
    const tasks = new Map<number, Task>();

    function getNewIndex() {
      if (index === 9007199254740991) {
        return 0;
      }
      return ++index;
    }

    const MESSAGE_PREFIX = "com.usePostMessage" + Math.random();

    main.addEventListener(
      "message",
      (e) => {
        const event = e as MessageEvent<string>;
        if (typeof event.data !== "string") {
          return;
        }
        if (event.source !== main || !event.data.startsWith(MESSAGE_PREFIX)) {
          return;
        }
        const index = event.data.split(":").at(1);
        if (index === undefined) {
          return;
        }
        const i = +index;
        const task = tasks.get(i);
        if (task) {
          task();
          tasks.delete(i);
        }
      },
      false,
    );

    return (task: Task) => {
      const i = getNewIndex();
      tasks.set(i, task);
      main.postMessage(MESSAGE_PREFIX + ":" + i, { targetOrigin: "*" });
      return () => {
        tasks.delete(i);
      };
    };
  })();

  export const useSetImmediate = (() => {
    if (typeof window !== "undefined") {
      return new Error("setImmediate is not supported on the browser");
    }
    if (typeof setImmediate === "undefined") {
      return new Error("setImmediate is not supported");
    }

    return (task: Task) => {
      const id = setImmediate(task);
      return () => clearImmediate(id);
    };
  })();

  export const useSetTimeout = (() => {
    return (task: Task) => {
      const id = setTimeout(task, 0);
      return () => clearTimeout(id);
    };
  })();

  // queues the task in the macro tasks queue, so it doesn't
  // prevent the event loop from movin on the next tick
  export function runAsap<T = void>(task: Task<T>): AbortTask {
    // if on node use setImmediate
    if (!(useSetImmediate instanceof Error)) {
      return useSetImmediate(task);
    }
    // on browser use MessageChannel if available
    else if (!(useMessageChannel instanceof Error)) {
      return useMessageChannel(task);
    }
    // otherwise use window.postMessage
    else if (!(usePostMessage instanceof Error)) {
      return usePostMessage(task);
    }
    // fallback to setTimeout with 0 delay
    else {
      return useSetTimeout(task);
    }
  }

  export function runAsapAsync<T = void>(
    task: RunAsap.Task<Promise<T>>,
    queueMethod: RunAsap<void> = runAsap,
  ): Promise<T> {
    if (queueMethod instanceof Error) {
      throw new Error("queueMethod is not supported", {
        cause: queueMethod,
      });
    }
    return new Promise((resolve, reject) => {
      queueMethod(() => {
        task().then(resolve).catch(reject);
      });
    });
  }
}
