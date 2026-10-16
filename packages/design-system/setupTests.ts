import "@testing-library/jest-dom";
import { loadIconComponents } from "./src/powerhouse/components/icon/icon-by-name.js";

// Icons outside the critical set load lazily; load them up front so components render their final markup.
await loadIconComponents();
