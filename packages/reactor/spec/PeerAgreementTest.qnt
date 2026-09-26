// -*- mode: Bluespec; -*-
/** Scenario tests over the stage 1+ instance. Run with `quint test`. */
module PeerAgreementTest {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).* from "./PeerAgreement"

  action deliverManifestOf(src: str, dst: str): bool = {
    nondet m = manifestMsgs.filter(m => m.src == src and m.dst == dst).oneOf()
    deliverManifest(m)
  }

  /** Both directions of a pairwise handshake. */
  run handshake(a: str, b: str): bool =
    touch(a, b).then(deliverManifestOf(a, b)).then(touch(b, a)).then(deliverManifestOf(b, a))

  pure val allWide = Map("A" -> "wide", "S" -> "wide", "B" -> "wide")

  /** Plan, Relays / Star: A selects 3 from S; S holds for B; B upgrades; S releases. */
  run starHoldReleaseTest =
    initWith(Map("A" -> "wide", "S" -> "wide", "B" -> "narrow"), false)
      .then(handshake("A", "S"))
      .then(handshake("S", "B"))
      .then(create("A", 1))
      .expect(docVersion.get(1) == 3)
      .then(sync("A", "S", 1))
      .then(transmit("A", "S", 1))
      .then(sync("S", "B", 1))
      .expect(holds == Set(("S", "B", 1)))
      .then(changeBuild("B", "wide"))
      .then(handshake("B", "S"))
      .expect(holds == Set() and released == Set(("S", "B", 1)))
      .then(transmit("S", "B", 1))
      .expect(stored.get("B").contains(1) and safety)

  /** Plan, Relays / Hub behind: A selects 2. */
  run hubBehindTest =
    initWith(Map("A" -> "wide", "S" -> "narrow", "B" -> "wide"), false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .expect(docVersion.get(1) == 2)

  /** A never-heard peer is silent: baselines, so A selects 2 offline. */
  run offlineNeverHeardTest =
    initWith(allWide, false).then(create("A", 1)).expect(docVersion.get(1) == 2)

  /** Offline create from a stale persisted manifest; the receipt refusal saves it. */
  run staleOfflineCreateTest =
    initWith(allWide, false)
      .then(handshake("A", "S"))
      .then(changeBuild("S", "narrow"))
      .then(create("A", 1))
      .expect(docVersion.get(1) == 3)
      .then(sync("A", "S", 1))
      .then(transmit("A", "S", 1))
      .expect(refusals == Set(("A", "S", 1)) and holds == Set(("A", "S", 1)))
      .expect(not(stored.get("S").contains(1)) and safety)

  /** The narrowing race: the document is in flight when S narrows. */
  run narrowWithDocInFlightTest =
    initWith(allWide, false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .then(sync("A", "S", 1))
      .then(changeBuild("S", "narrow"))
      .expect(narrowedInFlight)
      .then(transmit("A", "S", 1))
      .expect(holds == Set(("A", "S", 1)) and safety)

  /** Found by the simulator: S narrows and re-widens before A sees the narrow manifest. */
  run stuckHoldAfterFlapTest =
    initWith(allWide, false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .then(sync("A", "S", 1))
      .then(changeBuild("S", "narrow"))
      .then(transmit("A", "S", 1))
      .then(changeBuild("S", "wide"))
      .expect(holds == Set(("A", "S", 1)))
      .expect(known.get("A").get("S").ann == announced(build.get("S")))  // nothing to re-touch
      .expect(not(noStuckHold))

  /** Misconfigured host (announces 3, runs 2) fixed: same manifest, hold never released. */
  run misconfiguredFixedTest =
    initWith(Map("A" -> "wide", "S" -> "misconfigured", "B" -> "wide"), false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .expect(docVersion.get(1) == 3)
      .then(sync("A", "S", 1))
      .then(transmit("A", "S", 1))
      .expect(holds == Set(("A", "S", 1)) and noStuckHold)
      .then(changeBuild("S", "wide"))
      .expect(not(noStuckHold))

  /** Plan, onPeerManifest: narrowing turns an unsent outbox item into a hold. */
  run narrowUnsentBecomesHoldTest =
    initWith(allWide, false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .then(sync("A", "S", 1))
      .then(changeBuild("S", "narrow"))
      .then(touch("S", "A"))
      .then(deliverManifestOf("S", "A"))
      .expect(outbox == Set() and holds == Set(("A", "S", 1)))

  /**
   * Found by the simulator: a rollback to a pre-feature build and back. S stores
   * nothing above the baselines when it rolls back (decision 19 holds), receives
   * a v3 document A already sent, writes into it as base-reducer 2, rolls
   * forward, and A admits those rows because S announces 3 again.
   */
  run rollbackLeakTest =
    initWith(allWide, false)
      .then(handshake("A", "S"))
      .then(create("A", 1))
      .then(sync("A", "S", 1))
      .then(changeBuild("S", "legacy"))
      .then(transmit("A", "S", 1))
      .expect(not(noUnsupportedStore))
      .then(write("S", 1))
      .expect(not(noMisreadRows))
      .then(changeBuild("S", "wide"))
      .expect(known.get("A").get("S").ann == announced(build.get("S")))  // A never saw S go silent
      .then(sync("S", "A", 1))
      .then(transmit("S", "A", 1))
      .expect(not(noMisreadAdmitted))
}
