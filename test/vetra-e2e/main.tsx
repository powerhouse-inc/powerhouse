import { startConnect } from "@powerhousedao/connect";

// Loaded lazily so the package's models stay off Connect's boot path.
const { updateLocalPackage } = startConnect(() => import("./index.js"));

if (import.meta.hot) {
  import.meta.hot.accept(["./index.js"], ([newModule]) => {
    if (newModule) {
      updateLocalPackage(newModule);
    }
  });
}
