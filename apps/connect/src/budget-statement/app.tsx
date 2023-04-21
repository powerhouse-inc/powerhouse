import { createRoot } from "react-dom/client";
import React from "react";
import Editor from "./editor";

createRoot(document.getElementById("app") as HTMLElement).render(
    <React.StrictMode>
        <Editor />
    </React.StrictMode>
);
