import { ph } from "document-model";

/**
 * Two ways a package tries to own a scalar: a hand-written declaration, and a
 * catalog factory re-exported under its own name. Neither can work — a host
 * binds one coercion per scalar name for every stored document — so the check
 * names them instead of ignoring them as unrecognised exports.
 */

export const Money = {
  kind: "powerhouse.scalar",
  formatVersion: 1,
  name: "Money",
  representation: "string",
  persistable: true,
  description: "An amount of money.",
  coercionProfile: "document-engineering-1.40",
};

export const Amount = ph.Amount;
