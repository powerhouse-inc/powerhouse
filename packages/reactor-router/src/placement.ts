import { bucketFor, DriveCollectionId } from "@powerhousedao/reactor";
import type { RouterBackend } from "./backend.js";
import { NoEligibleBackendError } from "./errors.js";
import type { BackendFacts, CollectionRequirements } from "./types.js";

/** Why a backend cannot hold a collection, or `""` when it can. */
export function ineligibleReason(
  facts: BackendFacts,
  requirements: CollectionRequirements,
): string {
  const reason = factReason(facts, requirements);
  if (reason === "" || facts.known) {
    return reason;
  }
  return `${reason} (its facts are unknown)`;
}

function factReason(
  facts: BackendFacts,
  requirements: CollectionRequirements,
): string {
  const { reactor, reach } = facts;
  if (requirements.workflows && !reactor.workflows) {
    return "cannot run the workflow engine (workflows is false)";
  }
  if (requirements.durableStorage && !reactor.storage.durable) {
    return `has a non-durable ${reactor.storage.persistence} store (storage.durable is false)`;
  }
  if (requirements.inspectable && reach.inspection === "none") {
    return 'offers no inspection surface (reach.inspection is "none")';
  }
  for (const channel of requirements.syncChannels) {
    if (!reactor.syncChannels.includes(channel)) {
      return `does not serve the ${channel} sync channel (syncChannels is ${JSON.stringify(reactor.syncChannels)})`;
    }
  }
  return "";
}

export function eligibleBackends(
  backends: readonly RouterBackend[],
  requirements: CollectionRequirements,
): readonly RouterBackend[] {
  return backends.filter(
    (backend) => ineligibleReason(backend.facts, requirements) === "",
  );
}

/** A reshuffle after a topology change is corrected by the first refusal. */
export function placeCollection(
  collection: DriveCollectionId,
  backends: readonly RouterBackend[],
  requirements: CollectionRequirements,
): RouterBackend {
  const eligible = eligibleBackends(backends, requirements);
  if (eligible.length === 0) {
    throw new NoEligibleBackendError(
      collection.key,
      backends.map(
        (backend) =>
          `${backend.name} ${ineligibleReason(backend.facts, requirements)}`,
      ),
    );
  }
  return eligible[bucketFor(collection.key, eligible.length)];
}

/** A parentless document is placed as a collection of its own id. */
export function placeStandalone(
  documentId: string,
  backends: readonly RouterBackend[],
  requirements: CollectionRequirements,
): RouterBackend {
  return placeCollection(
    DriveCollectionId.forDrive(documentId),
    backends,
    requirements,
  );
}
