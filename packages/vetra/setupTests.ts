import "@testing-library/jest-dom";
import { vi } from "vitest";

// Setup global mocks for editor tests
vi.mock("./editors/hooks/useVetraDocument.js");
vi.mock("./editors/hooks/useAvailableDocumentTypes.js");
