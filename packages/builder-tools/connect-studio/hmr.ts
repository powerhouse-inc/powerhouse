export const hmr = import.meta.hot
  ? {
      on: import.meta.hot.on.bind(import.meta.hot),
      off: import.meta.hot.off.bind(import.meta.hot),
      send: import.meta.hot.send.bind(import.meta.hot),
      accept: import.meta.hot.accept.bind(import.meta.hot),
    }
  : undefined;
