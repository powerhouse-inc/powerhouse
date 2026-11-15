// The bin's observability bootstrap: observability.mts, then its
// SIGINT/SIGTERM flush. MUST stay the first import of index.mts.
import { installObservabilitySignals } from "./observability.mjs";

installObservabilitySignals();
