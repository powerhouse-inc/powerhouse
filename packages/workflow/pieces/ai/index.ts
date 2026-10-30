// AI models as workflow blocks, called from the worker with the connection's
// own provider credentials.
import { createPiece, PieceCategory } from "@powerhousedao/pieces-framework";
import { askAiAction } from "./lib/actions/ask-ai.js";
import { decideAction } from "./lib/actions/decide.js";
import { decideOnDocumentsAction } from "./lib/actions/decide-on-documents.js";
import { extractAction } from "./lib/actions/extract.js";
import { proposeActionsAction } from "./lib/actions/propose-actions.js";
import { summarizeAction } from "./lib/actions/summarize.js";
import { aiAuth } from "./lib/auth.js";

// "AI" cut out of the Powerhouse mark's dark rounded tile.
const AI_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 114 114"><path fill="#161616" fill-rule="evenodd" d="M15.2 0H98.8C107.195 0 114 6.805 114 15.2V98.8C114 107.195 107.195 114 98.8 114H15.2C6.805 114 0 107.195 0 98.8V15.2C0 6.805 6.805 0 15.2 0ZM25.5 82L42 32H53L69.5 82H58.5L55 71H40L36.5 82ZM43 61H52L47.5 46.5ZM77.5 32H88.5V82H77.5Z"/></svg>`,
  );

export const ai = createPiece({
  displayName: "AI",
  description:
    "Call AI models from OpenAI, Anthropic, Google or TypeSafe, or any OpenAI-compatible server such as Ollama, vLLM or OpenRouter.",
  logoUrl: AI_LOGO,
  authors: ["powerhouse"],
  categories: [PieceCategory.ARTIFICIAL_INTELLIGENCE],
  auth: aiAuth,
  actions: [
    askAiAction,
    extractAction,
    summarizeAction,
    decideAction,
    decideOnDocumentsAction,
    proposeActionsAction,
  ],
  triggers: [],
});

export default ai;
