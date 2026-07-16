// Importable document-model barrel used by reactor-builder source-resolution
// tests. Plain .mjs so both the host resolution pass and worker threads can
// import it without a TS loader.

function makeModel(id, version) {
  return {
    version,
    reducer: () => undefined,
    documentModel: { global: { id } },
    actions: {},
    utils: {},
  };
}

export const alphaModel = makeModel("test/alpha", 1);
export const betaModel = makeModel("test/beta", 2);
export const notAModel = "just a string";
