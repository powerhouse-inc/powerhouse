import { createRoot } from "react-dom/client";
import { AppLoader } from "./components/app-loader.js";

if (!window.ph) {
  window.ph = {};
}

createRoot(document.getElementById("root")!).render(<AppLoader />);
