import { startConnect } from "@powerhousedao/connect";
import "@powerhousedao/connect/style.css";
import * as localPackage from "./index.js";

const { updateLocalPackage } = startConnect(localPackage);

if (import.meta.hot) {
  import.meta.hot.accept(["./index.js"], ([newModule]) => {
    if (newModule) {
      updateLocalPackage(newModule);
    }
  });
}
