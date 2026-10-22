// A fake base-reducer version with a new value on every capability axis.
// Compiled only by the v4 cascade check; every consumer that decides on an
// axis must fail to compile here.
export {};

declare module "../document-model/base-reducer-protocol.js" {
  interface UndoModelValues {
    "v4-undo": true;
  }
  interface SkipMeaningValues {
    "v4-skip": true;
  }
  interface TieOrderValues {
    "v4-tie-order": true;
  }
  interface SynthesizedIdFormValues {
    "v4-synthesized-id": true;
  }
  interface ReplayHashValues {
    "v4-replay-hash": true;
  }
  interface DerivationModelValues {
    "v4-derivation": true;
  }
  interface ReducerContractValues {
    "v4-reducer-contract": true;
  }
  interface GatingFlagValues {
    v4Flag: true;
  }
}
