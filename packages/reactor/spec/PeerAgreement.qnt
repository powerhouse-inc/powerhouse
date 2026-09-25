// -*- mode: Bluespec; -*-
/**
 * Peer protocol agreement (docs/plans/2026-09-25-peer-protocol-agreement.md),
 * restricted to the `base-reducer` capability with versions {1, 2, 3}.
 *
 * Modelled: pairwise manifests (touch + revision-triggered re-touch, async),
 * selection at create from the manifests a reactor holds for its direct peers,
 * the outbox gate with holds, release on a widened manifest, both receipt
 * refusals, writes, upgrades and downgrades.
 *
 * Not modelled: ordinals, acks, branches, collections other than "all of a
 * reactor's remotes", signature, features, the worker pool.
 */
module PeerAgreement {
  // ---------------------------------------------------------------- constants

  const REACTORS: Set[str]
  /** Directed pairs; a pairwise channel is present in both directions. */
  const EDGES: Set[(str, str)]
  /** Builds a reactor may run: "legacy" | "narrow" | "wide" | "misconfigured" | "liar". */
  const BUILDS: Set[str]
  const MAX_DOCS: int
  const MAX_ROWS: int
  /** Outbox gate on (false: send regardless of the peer's manifest). */
  const GATE: bool
  /** Receipt checks on: inbox UNSUPPORTED_PROTOCOL and the executor's UnsupportedProtocolVersionError. */
  const RECEIPT_CHECK: bool
  /** Inbox PEER_PROTOCOL_UNSUPPORTED check on. */
  const PEER_CHECK: bool
  /** A receiver's record of a peer is current before it accepts that peer's data. */
  const MANIFEST_FIRST: bool

  // -------------------------------------------------------------------- types

  /** What a reactor holds for a peer: silent (baselines) or an announced set. */
  type Ann = Silent | Claims(Set[int])

  type Row = { id: int, doc: int, writer: str, readAs: int }
  type ManifestMsg = { src: str, dst: str, ann: Ann }
  type DataMsg = { src: str, dst: str, doc: int, version: int, rows: Set[Row] }
  /** (sender, receiver, document) */
  type Hold = (str, str, int)

  // ------------------------------------------------------------------- builds

  pure val BASELINE = Set(1, 2)
  pure def DOCS_OF(n: int): Set[int] = 1.to(n)

  /** What the build announces on the handshake. Legacy predates the feature. */
  pure def announced(b: str): Ann =
    if (b == "legacy") Silent
    else if (b == "narrow") Claims(Set(1, 2))
    else Claims(Set(1, 2, 3))

  /** The capability's supported(flags): what selection offers. */
  pure def registered(b: str): Set[int] =
    if (b == "legacy" or b == "narrow") Set(1, 2) else Set(1, 2, 3)

  /** Versions the executor actually runs under their own rules. */
  pure def runs(b: str): Set[int] = if (b == "wide") Set(1, 2, 3) else Set(1, 2)

  /** Stage 1+ admission: refuses what it does not run. Legacy and liar admit anything. */
  pure def refusesUnsupported(b: str): bool = b == "narrow" or b == "wide" or b == "misconfigured"

  /** Has the gate, selection and manifest handling. */
  pure def hasFeature(b: str): bool = b != "legacy"

  /** A build that admits a version it does not run reads it as base-reducer 2. */
  pure def readAs(b: str, v: int): int = if (runs(b).contains(v)) v else 2

  pure def supportsOf(a: Ann): Set[int] = match a {
    | Silent => BASELINE
    | Claims(s) => s
  }

  pure def maxOf(s: Set[int]): int = s.fold(0, (acc, v) => if (v > acc) v else acc)
  pure def minOf(s: Set[int]): int = s.fold(99, (acc, v) => if (v < acc) v else acc)

  // ------------------------------------------------------------------- state

  var build: str -> str
  /** known[r][p]: the manifest r persisted for peer p (sync_remotes.peer_manifest). */
  var known: str -> (str -> Ann)
  var manifestMsgs: Set[ManifestMsg]
  /** Derived past the gate, not yet sent (the channel's outbox mailbox). */
  var outbox: Set[DataMsg]
  /** Sent, not yet received. */
  var dataMsgs: Set[DataMsg]
  /** 0: not created. Immutable once set. */
  var docVersion: int -> int
  var stored: str -> Set[int]
  var rows: str -> Set[Row]
  var nextRow: int
  var holds: Set[Hold]

  // ghosts for properties and witnesses
  var badStores: Set[(str, int)]
  var released: Set[Hold]
  var refusals: Set[Hold]
  var peerRefusals: Set[Hold]
  var narrowedInFlight: bool
  /** (receiver, doc): a stage 1+ build admitted a batch carrying a misread row. */
  var misreadAdmitted: Set[(str, int)]

  pure val DOCS = DOCS_OF(MAX_DOCS)

  def peersOf(r: str): Set[str] = EDGES.filter(e => e._1 == r).map(e => e._2)

  /** selectProtocolVersions for base-reducer, members = all direct peers of r. */
  def selectVersion(r: str): int =
    val b = build.get(r)
    if (not(hasFeature(b))) 2
    else
      val local = registered(b)
      val preferred = maxOf(local)
      val agreed = peersOf(r).fold(
        local.filter(v => v <= preferred),
        (acc, p) => acc.intersect(supportsOf(known.get(r).get(p)))
      )
      if (agreed != Set()) maxOf(agreed) else minOf(local)

  def rowsOf(r: str, d: int): Set[Row] = rows.get(r).filter(w => w.doc == d)

  // ------------------------------------------------------------------ actions

  action initWith(bs: str -> str): bool = all {
    build' = bs,
    known' = REACTORS.mapBy(r => REACTORS.mapBy(p => Silent)),
    manifestMsgs' = Set(),
    outbox' = Set(),
    dataMsgs' = Set(),
    docVersion' = DOCS.mapBy(d => 0),
    stored' = REACTORS.mapBy(r => Set()),
    rows' = REACTORS.mapBy(r => Set()),
    nextRow' = 0,
    holds' = Set(),
    badStores' = Set(),
    released' = Set(),
    refusals' = Set(),
    peerRefusals' = Set(),
    narrowedInFlight' = false,
    misreadAdmitted' = Set(),
  }

  action init = {
    nondet bs = REACTORS.setOfMaps(BUILDS.exclude(Set("legacy"))).oneOf()
    initWith(bs)
  }

  /** Upgrade or downgrade. The manifest revision is a hash of the set, so it changes with it. */
  action changeBuild(r: str, nb: str): bool = all {
    nb != build.get(r),
    // Decision 19: no downgrade below the feature while storing documents above the baselines.
    nb != "legacy" or stored.get(r).forall(d => BASELINE.contains(docVersion.get(d))),
    build' = build.set(r, nb),
    narrowedInFlight' = (narrowedInFlight or dataMsgs.union(outbox).exists(m =>
      m.dst == r and runs(build.get(r)).contains(m.version) and not(runs(nb).contains(m.version)))),
    known' = known, manifestMsgs' = manifestMsgs, dataMsgs' = dataMsgs, outbox' = outbox, docVersion' = docVersion,
    stored' = stored, rows' = rows, nextRow' = nextRow, holds' = holds, badStores' = badStores,
    released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
    misreadAdmitted' = misreadAdmitted,
  }

  /**
   * a's current manifest travels to b: the touch, the re-touch a revision
   * mismatch triggers, or (legacy a) b concluding a is silent.
   */
  action touch(a: str, b: str): bool = {
    val m = { src: a, dst: b, ann: announced(build.get(a)) }
    all {
      EDGES.contains((a, b)),
      hasFeature(build.get(b)),
      known.get(b).get(a) != m.ann,
      not(manifestMsgs.contains(m)),
      manifestMsgs' = manifestMsgs.union(Set(m)),
      build' = build, known' = known, dataMsgs' = dataMsgs, outbox' = outbox, docVersion' = docVersion,
      stored' = stored, rows' = rows, nextRow' = nextRow, holds' = holds, badStores' = badStores,
      released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
      narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
    }
  }

  /** onPeerManifest: persist; on a change, release holds the new set supports. */
  action deliverManifest(m: ManifestMsg): bool = {
    val b = m.dst
    val a = m.src
    val listens = hasFeature(build.get(b))
    val changed = listens and known.get(b).get(a) != m.ann
    val toRelease =
      if (changed) holds.filter(h => h._1 == b and h._2 == a and supportsOf(m.ann).contains(docVersion.get(h._3)))
      else Set()
    val backfills = toRelease.map(h =>
      { src: b, dst: a, doc: h._3, version: docVersion.get(h._3), rows: rowsOf(b, h._3) })
    // Narrowed: unsent outbox items for now-unsupported documents become holds.
    val unsent =
      if (changed and GATE) outbox.filter(o => o.src == b and o.dst == a and not(supportsOf(m.ann).contains(o.version)))
      else Set()
    all {
      manifestMsgs.contains(m),
      manifestMsgs' = manifestMsgs.exclude(Set(m)),
      known' = if (listens) known.setBy(b, k => k.set(a, m.ann)) else known,
      holds' = holds.exclude(toRelease).union(unsent.map(o => (b, a, o.doc))),
      released' = released.union(toRelease),
      outbox' = outbox.exclude(unsent).union(backfills),
      dataMsgs' = dataMsgs,
      build' = build, docVersion' = docVersion, stored' = stored, rows' = rows, nextRow' = nextRow,
      badStores' = badStores, refusals' = refusals, peerRefusals' = peerRefusals,
      narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
    }
  }

  /** Create at r, online or offline: selection reads only persisted manifests. */
  action create(r: str, d: int): bool = {
    val b = build.get(r)
    val v = selectVersion(r)
    all {
      docVersion.get(d) == 0,
      nextRow < MAX_ROWS,
      // A stage 1+ executor refuses a CREATE it does not run (the misconfigured case).
      not(refusesUnsupported(b)) or runs(b).contains(v),
      docVersion' = docVersion.set(d, v),
      stored' = stored.setBy(r, s => s.union(Set(d))),
      rows' = rows.setBy(r, s => s.union(Set({ id: nextRow, doc: d, writer: r, readAs: readAs(b, v) }))),
      nextRow' = nextRow + 1,
      build' = build, known' = known, manifestMsgs' = manifestMsgs, dataMsgs' = dataMsgs, outbox' = outbox,
      holds' = holds, badStores' = badStores, released' = released, refusals' = refusals,
      peerRefusals' = peerRefusals, narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
    }
  }

  /** A write into a stored document, under the rules r reads it with. */
  action write(r: str, d: int): bool = {
    val b = build.get(r)
    val v = docVersion.get(d)
    all {
      stored.get(r).contains(d),
      nextRow < MAX_ROWS,
      not(refusesUnsupported(b)) or runs(b).contains(v),
      rows' = rows.setBy(r, s => s.union(Set({ id: nextRow, doc: d, writer: r, readAs: readAs(b, v) }))),
      nextRow' = nextRow + 1,
      build' = build, known' = known, manifestMsgs' = manifestMsgs, dataMsgs' = dataMsgs, outbox' = outbox,
      docVersion' = docVersion, stored' = stored, holds' = holds, badStores' = badStores,
      released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
      narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
    }
  }

  /** Outbox derivation for (a -> b) over d: send, or record a hold. */
  action sync(a: str, b: str, d: int): bool = {
    val v = docVersion.get(d)
    val gated = GATE and hasFeature(build.get(a))
    val held = gated and not(supportsOf(known.get(a).get(b)).contains(v))
    val m = { src: a, dst: b, doc: d, version: v, rows: rowsOf(a, d) }
    all {
      EDGES.contains((a, b)),
      stored.get(a).contains(d),
      not(holds.contains((a, b, d))),
      if (held) all { holds' = holds.union(Set((a, b, d))), outbox' = outbox }
      else all { not(outbox.contains(m)), outbox' = outbox.union(Set(m)), holds' = holds },
      dataMsgs' = dataMsgs,
      build' = build, known' = known, manifestMsgs' = manifestMsgs, docVersion' = docVersion,
      stored' = stored, rows' = rows, nextRow' = nextRow, badStores' = badStores,
      released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
      narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
    }
  }

  /** Push or poll: an outbox item goes on the wire. The gate is not re-run here. */
  action send(m: DataMsg): bool = all {
    outbox.contains(m),
    outbox' = outbox.exclude(Set(m)),
    dataMsgs' = dataMsgs.union(Set(m)),
    build' = build, known' = known, manifestMsgs' = manifestMsgs, docVersion' = docVersion,
    stored' = stored, rows' = rows, nextRow' = nextRow, holds' = holds, badStores' = badStores,
    released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
    narrowedInFlight' = narrowedInFlight, misreadAdmitted' = misreadAdmitted,
  }

  /** SyncManager inbox + executor load for one batch. */
  action deliverData(m: DataMsg): bool = {
    val a = m.src
    val b = m.dst
    val bb = build.get(b)
    val refuse = RECEIPT_CHECK and refusesUnsupported(bb) and not(runs(bb).contains(m.version))
    val peerRefuse = not(refuse) and PEER_CHECK and hasFeature(bb) and
      not(supportsOf(known.get(b).get(a)).contains(m.version))
    val accept = not(refuse) and not(peerRefuse)
    val h = (a, b, m.doc)
    all {
      dataMsgs.contains(m),
      not(MANIFEST_FIRST) or not(hasFeature(bb)) or known.get(b).get(a) == announced(build.get(a)),
      dataMsgs' = dataMsgs.exclude(Set(m)),
      outbox' = outbox,
      // Decision 11: an UNSUPPORTED_PROTOCOL refusal becomes a hold at the sender.
      holds' = if (refuse and hasFeature(build.get(a))) holds.union(Set(h)) else holds,
      refusals' = if (refuse) refusals.union(Set(h)) else refusals,
      peerRefusals' = if (peerRefuse) peerRefusals.union(Set(h)) else peerRefusals,
      stored' = if (accept) stored.setBy(b, s => s.union(Set(m.doc))) else stored,
      rows' = if (accept) rows.setBy(b, s => s.union(m.rows)) else rows,
      badStores' =
        if (accept and not(runs(bb).contains(m.version))) badStores.union(Set((b, m.doc)))
        else badStores,
      build' = build, known' = known, manifestMsgs' = manifestMsgs, docVersion' = docVersion,
      nextRow' = nextRow, released' = released, narrowedInFlight' = narrowedInFlight,
      misreadAdmitted' =
        if (accept and hasFeature(bb) and m.rows.exists(w => w.readAs != m.version))
          misreadAdmitted.union(Set((b, m.doc)))
        else misreadAdmitted,
    }
  }

  action step = {
    nondet r = REACTORS.oneOf()
    nondet nb = BUILDS.oneOf()
    nondet e = EDGES.oneOf()
    nondet d = DOCS.oneOf()
    any {
      changeBuild(r, nb),
      touch(e._1, e._2),
      create(r, d),
      write(r, d),
      sync(e._1, e._2, d),
      all { manifestMsgs != Set(), nondet m = manifestMsgs.oneOf() deliverManifest(m) },
      all { outbox != Set(), nondet m = outbox.oneOf() send(m) },
      all { dataMsgs != Set(), nondet m = dataMsgs.oneOf() deliverData(m) },
    }
  }

  // --------------------------------------------------------------- properties

  /** No reactor admits a document at a version it does not run. */
  val noUnsupportedStore: bool = badStores == Set()

  /** Undo plan: no base-reducer 3 stream holds rows from a reactor that reads it as 2. */
  val noMisreadRows: bool =
    REACTORS.forall(r => rows.get(r).forall(w => w.readAs == docVersion.get(w.doc)))

  /** Weaker: a misread row never leaves the replica that wrote it. */
  val noMisreadRowsSpread: bool =
    REACTORS.forall(r => rows.get(r).forall(w => w.writer == r or w.readAs == docVersion.get(w.doc)))

  val safety: bool = noUnsupportedStore and noMisreadRows

  /** Weakest: no stage 1+ build admits a misread row (the PEER_PROTOCOL_UNSUPPORTED check's job). */
  val noMisreadAdmitted: bool = misreadAdmitted == Set()

  /**
   * No hold whose release condition already holds with nothing left to trigger
   * it: the receiver runs the version, the sender's record of it is current and
   * supports the version, and no manifest from the receiver is in flight.
   */
  val noStuckHold: bool = holds.forall(h => {
    val a = h._1
    val b = h._2
    val v = docVersion.get(h._3)
    not(
      runs(build.get(b)).contains(v) and
      known.get(a).get(b) == announced(build.get(b)) and
      supportsOf(known.get(a).get(b)).contains(v) and
      not(manifestMsgs.exists(m => m.src == b and m.dst == a))
    )
  })

  // Reachability. `reach*` are for --witnesses; each `witnessNo*` is an
  // invariant expected to be VIOLATED, and its violation is a trace to the state.
  val reachV3Doc: bool = DOCS.exists(d => docVersion.get(d) == 3)
  val reachHold: bool = holds != Set()
  val reachRelease: bool = released != Set()
  val reachNarrowInFlight: bool = narrowedInFlight
  val reachRefusal: bool = refusals != Set()
  /** A v3 document stored at every reactor of the line, so relayed through S. */
  val reachRelayedV3: bool =
    DOCS.exists(d => docVersion.get(d) == 3 and REACTORS.forall(r => stored.get(r).contains(d)))

  val witnessNoV3Doc: bool = not(reachV3Doc)
  val witnessNoHold: bool = not(reachHold)
  val witnessNoRelease: bool = not(reachRelease)
  val witnessNoNarrowInFlight: bool = not(reachNarrowInFlight)
  val witnessNoRefusal: bool = not(reachRefusal)
  val witnessNoRelayedV3: bool = not(reachRelayedV3)
}

// ---------------------------------------------------------------- instances
// Line A - S - B: S is the relay, A and B are not connected.

/** Stage 1+ builds only, every mechanism on. Expect all safety invariants to hold. */
module stage1 {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}

/** Gate only: the receipt refusals removed. */
module gateOnly {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = false, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}

/** Receipt only: the gate removed. */
module receiptOnly {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = false, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}

/** Downgrade below the feature allowed (per decision 19), manifests ordered before data. */
module legacy {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = true
  ).*
}

/** As legacy, without manifest-before-data ordering on the channel. */
module legacyUnordered {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}

/** A peer that announces 3 but refuses it (host/worker flag mismatch), later fixed. */
module misconfigured {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("misconfigured", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}

/** The "claims more" trust case: announces 3, admits it, reads it as 2. */
module liar {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    BUILDS = Set("liar", "wide"),
    MAX_DOCS = 2, MAX_ROWS = 5,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, MANIFEST_FIRST = false
  ).*
}
