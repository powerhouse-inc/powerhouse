// Worker-side signature verifier for the bench. The bench host signs locally
// and we measure throughput, so the worker verifier accepts every signature
// (mirrors the in-process bench builder's withSignatureVerifier(() => true)).
export function createVerifier() {
  return async () => true;
}
