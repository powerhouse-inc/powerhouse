// A piece with no dependencies, no auth and one deterministic action, shipped
// inside a reactor package so the e2e can run it from an installed copy.
import { createPiece, PieceCategory } from "@powerhousedao/pieces-framework";
import { greetAction } from "./lib/actions/greet.js";

export const greeter = createPiece({
  displayName: "E2E Greeter",
  description: "Greets a name, deterministically.",
  logoUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E",
  authors: ["powerhouse-inc"],
  categories: [PieceCategory.CORE],
  minimumSupportedRelease: "0.30.0",
  auth: undefined,
  actions: [greetAction],
  triggers: [],
});

export default greeter;
