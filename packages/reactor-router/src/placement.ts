import { bucketFor, DriveCollectionId } from "@powerhousedao/reactor";
import type { ReactorCapabilities } from "@powerhousedao/reactor-monitor";
import { NoEligibleBackendError } from "./errors.js";
import type { CollectionRequirements, ReactorBackend } from "./types.js";

/**
 * Why a backend cannot hold a collection, or `""` when it can.
 *
 * One function, so the placement hash, an override's sanity check and an
 * operator-facing explanation all read the capability contract the same way.
 * Each clause names the contract field it read, because "ineligible" without
 * the field sends a reader to the source.
 */
export function ineligibleReason(
  capabilities: ReactorCapabilities,
  requirements: CollectionRequirements,
): string {
  if (requirements.processors && !capabilities.processors) {
    return "hosts no processor factories (capabilities.processors is false)";
  }
  if (requirements.workflows && !capabilities.workflows) {
    return "cannot run the workflow engine (capabilities.workflows is false)";
  }
  if (requirements.durableStorage && !capabilities.storage.durable) {
    return `has a non-durable ${capabilities.storage.kind} store (capabilities.storage.durable is false)`;
  }
  if (requirements.inspectable && capabilities.inspection === "none") {
    return 'offers no inspection surface (capabilities.inspection is "none")';
  }
  for (const channel of requirements.syncChannels) {
    if (!capabilities.syncChannels.includes(channel)) {
      return `does not route the ${channel} sync channel (capabilities.syncChannels is ${JSON.stringify(capabilities.syncChannels)})`;
    }
  }
  return "";
}

/**
 * The backends that may hold a collection with these requirements, in the
 * router's stable order.
 */
export function eligibleBackends(
  backends: readonly ReactorBackend[],
  requirements: CollectionRequirements,
): readonly ReactorBackend[] {
  return backends.filter(
    (backend) => ineligibleReason(backend.capabilities, requirements) === "",
  );
}

/**
 * The default placement: hash the collection id over the ELIGIBLE backends.
 *
 * Two decisions, both load-bearing:
 *
 * - The key is `DriveCollectionId.key` (`drive.<branch>.<driveId>`), not the
 *   bare drive id, so a branch is a placeable unit and the key is the same
 *   string sync, storage and the operation index already use.
 * - The modulus is the eligible SUBSET, not every backend, so capability
 *   filtering composes with the hash instead of fighting it: a workflow drive
 *   spreads across the reactors that can run workflows rather than landing on
 *   an ineligible one and needing a second rule to move it. The consequence is
 *   that adding or removing an eligible backend reshuffles every collection
 *   this function still decides -- which is harmless precisely because routing
 *   is advisory: a reshuffled collection's first operation is refused by the
 *   backend the new hash names, the router re-probes, and the table learns the
 *   real owner (plan agreed decision 4). Nothing moves, and nothing is lost.
 *
 * The hash itself is `@powerhousedao/reactor`'s own `bucketFor` -- the FNV-1a
 * convention the executor worker pool and the projection shard manager place
 * on. A second implementation would place the same key differently.
 */
export function placeCollection(
  collection: DriveCollectionId,
  backends: readonly ReactorBackend[],
  requirements: CollectionRequirements,
): ReactorBackend {
  const eligible = eligibleBackends(backends, requirements);
  if (eligible.length === 0) {
    throw new NoEligibleBackendError(
      collection.key,
      backends.map(
        (backend) =>
          `${backend.name} ${ineligibleReason(backend.capabilities, requirements)}`,
      ),
    );
  }
  // A modulus over a non-empty array: always a real entry.
  return eligible[bucketFor(collection.key, eligible.length)];
}

/**
 * Placement for something that is NOT a collection: a parentless document whose
 * own id is its only placement unit.
 *
 * Keyed through a collection id built from the document id so one hash decides
 * every placement in the router. A parentless document is not a drive, but it
 * is the root of its own membership, and the alternative -- a second hashing
 * rule for documents -- is a second convention to keep in step.
 */
export function placeStandalone(
  documentId: string,
  backends: readonly ReactorBackend[],
  requirements: CollectionRequirements,
): ReactorBackend {
  return placeCollection(
    DriveCollectionId.forDrive(documentId),
    backends,
    requirements,
  );
}
