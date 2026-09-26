// -*- mode: Bluespec; -*-
/**
 * Peer protocol agreement (docs/plans/2026-09-25-peer-protocol-agreement.md),
 * restricted to the `base-reducer` capability with versions {1, 2, 3}.
 *
 * Modelled: pairwise manifests (touch, re-touch on a revision mismatch, the
 * handshake after a client restart), selection at create from persisted
 * manifests, the outbox gate with holds, narrowing and release, both receipt
 * refusals, writes, restarts into another build, and the candidate fixes as
 * switches.
 *
 * Abstractions: a row is (doc, writer, misread); an outbox item is a
 * (sender, receiver, document) key and carries the sender's rows of that
 * document when it is transmitted, sent and received in one step; a restart
 * drops the restarted reactor's unsent outbox (it is re-derived) and nothing
 * else; refusals reach the sender at once.
 *
 * Not modelled: ordinals, acks, branches, collections other than "all of a
 * reactor's remotes", signature, features, the worker pool.
 */
module PeerAgreement {
  // ---------------------------------------------------------------- constants

  const REACTORS: Set[str]
  /** Directed pairs; every channel is present in both directions. */
  const EDGES: Set[(str, str)]
  /** (client, server): data on these edges is a push, on their reverse a poll response. */
  const PUSH_EDGES: Set[(str, str)]
  /** "legacy" | "narrow" | "wide" | "misconfigured" | "liar" */
  const BUILDS: Set[str]
  const MAX_DOCS: int
  /** Outbox gate on. */
  const GATE: bool
  /** Receipt refusals: inbox UNSUPPORTED_PROTOCOL and the executor's UnsupportedProtocolVersionError. */
  const RECEIPT_CHECK: bool
  /** Inbox PEER_PROTOCOL_UNSUPPORTED. */
  const PEER_CHECK: bool
  /** Transport assumption: after a client restart, no data flows on its channel until both manifests are exchanged. */
  const HANDSHAKE_FIRST: bool
  /** Fix: a push names the agreement it was gated under; a pre-feature server fails to validate it. */
  const PUSH_FIELD: bool
  /** Fix: the gate re-runs when an outbox item goes on the wire. */
  const SEND_GATE: bool
  /** Fix: every manifest delivery re-checks holds, not only a changed one. */
  const RECHECK_HOLDS: bool
  /** Fix: manifests carry a sequence that grows on every start; it is part of the revision and older ones are ignored. */
  const MANIFEST_SEQ: bool
  /** Fix: a poll names the client's revision; a feature server records a client that names none as silent before serving. */
  const POLL_REVISION: bool

  // -------------------------------------------------------------------- types

  /** An announced set, or "silent" (no manifest: the baselines): "silent" | "12" | "123". */
  type Ann = str
  /** A persisted peer record: the manifest and the sequence it was sent under. */
  type PeerRecord = { ann: Ann, seq: int }
  /** (doc, writer, misread): misread means written by a build that does not run the document's version. */
  type Row = (int, str, bool)
  type ManifestMsg = { src: str, dst: str, ann: Ann, seq: int }
  /** (sender, receiver, document), for outbox items and holds alike. */
  type Item = (str, str, int)
  type Hold = Item

  // ------------------------------------------------------------------- builds

  pure val BASELINE = Set(1, 2)

  pure val SILENT = "silent"

  pure def announced(b: str): Ann =
    if (b == "legacy") SILENT else if (b == "narrow") "12" else "123"

  /** supported(flags): what selection offers. */
  pure def registered(b: str): Set[int] =
    if (b == "legacy" or b == "narrow") Set(1, 2) else Set(1, 2, 3)

  /** Versions the executor runs under their own rules. */
  pure def runs(b: str): Set[int] = if (b == "wide") Set(1, 2, 3) else Set(1, 2)

  /** Stage 1+ admission. Legacy and liar admit anything. */
  pure def refusesUnsupported(b: str): bool = b == "narrow" or b == "wide" or b == "misconfigured"

  /** Has the gate, selection and manifest handling. */
  pure def hasFeature(b: str): bool = b != "legacy"

  pure def supportsOf(a: Ann): Set[int] = if (a == "123") Set(1, 2, 3) else BASELINE

  // ------------------------------------------------------------------- state

  var build: str -> str
  /** Starts per reactor; the model's clock for manifests. */
  var seq: str -> int
  /** known[r][p]: r's persisted record of peer p (sync_remotes.peer_manifest). */
  var known: str -> (str -> PeerRecord)
  var manifestMsgs: Set[ManifestMsg]
  /** (a, b): a owes b its manifest before data flows on the channel (the handshake after a client start). */
  var pendingTouch: Set[(str, str)]
  /** Derived past the gate, not yet sent. */
  var outbox: Set[Item]
  /** 0: not created. Immutable once set. */
  var docVersion: int -> int
  var stored: str -> Set[int]
  var rows: str -> Set[Row]
  var holds: Set[Hold]

  // ghosts
  var badStores: Set[(str, int)]
  var released: Set[Hold]
  var refusals: Set[Hold]
  var peerRefusals: Set[Hold]
  /** A PEER_PROTOCOL_UNSUPPORTED refusal dropped a legitimate row the receiver lacks. */
  var lostRows: Set[Hold]
  /** (receiver, doc): a stage 1+ build admitted a batch carrying a misread row. */
  var misreadAdmitted: Set[(str, int)]
  var narrowedInFlight: bool
  /** A manifest older than the record it replaced was applied. */
  var regressed: bool

  pure val DOCS = 1.to(MAX_DOCS)
  // Universes: every growing set is rebuilt as a filter over one, so Apalache's bound on it stays fixed.
  pure val ITEMS: Set[Item] = tuples(REACTORS, REACTORS, DOCS).filter(i => EDGES.contains((i._1, i._2)))
  pure val ROWS: Set[Row] = tuples(DOCS, REACTORS, Set(true, false))
  pure val PLACES: Set[(str, int)] = tuples(REACTORS, DOCS)

  /** s + t, bounded by u. */
  pure def plus(u: Set[a], s: Set[a], t: Set[a]): Set[a] = u.filter(x => s.contains(x) or t.contains(x))
  /** s - t + n, bounded by u. */
  pure def swap(u: Set[a], s: Set[a], t: Set[a], n: Set[a]): Set[a] =
    u.filter(x => (s.contains(x) and not(t.contains(x))) or n.contains(x))

  def peersOf(r: str): Set[str] = REACTORS.filter(p => EDGES.contains((r, p)))

  def current(a: str): PeerRecord = { ann: announced(build.get(a)), seq: seq.get(a) }

  /** The revision b holds for a differs from a's: a poll detects it and the client re-touches. */
  def mismatch(a: str, b: str): bool = {
    val k = known.get(b).get(a)
    k.ann != announced(build.get(a)) or (MANIFEST_SEQ and k.seq != seq.get(a))
  }

  def channelReady(a: str, b: str): bool =
    not(pendingTouch.contains((a, b))) and not(pendingTouch.contains((b, a)))

  def peerSupports(r: str, p: str): Set[int] = supportsOf(known.get(r).get(p).ann)

  def agreed(r: str, v: int): bool =
    registered(build.get(r)).contains(v) and peersOf(r).forall(p => peerSupports(r, p).contains(v))

  /** selectProtocolVersions for base-reducer, members = all direct peers of r; min(supported) is 1. */
  def selectVersion(r: str): int =
    if (not(hasFeature(build.get(r)))) 2
    else if (agreed(r, 3)) 3 else if (agreed(r, 2)) 2 else 1

  def rowsFor(r: str, d: int): Set[Row] = rows.get(r).filter(w => w._1 == d)

  /** Items a gated sender a must move from its outbox to holds when b's record becomes `sup`. */
  def unsentFor(a: str, b: str, sup: Set[int]): Set[Item] =
    outbox.filter(o => o._1 == a and o._2 == b and not(sup.contains(docVersion.get(o._3))))

  // ------------------------------------------------------------------ actions

  /** `connected`: every channel has completed its handshake. */
  action initWith(bs: str -> str, connected: bool): bool = all {
    build' = bs,
    seq' = REACTORS.mapBy(r => 0),
    known' = REACTORS.mapBy(r => REACTORS.mapBy(p =>
      { ann: if (connected) announced(bs.get(p)) else SILENT, seq: 0 })),
    manifestMsgs' = Set(),
    pendingTouch' = Set(),
    outbox' = Set(),
    docVersion' = DOCS.mapBy(d => 0),
    stored' = REACTORS.mapBy(r => Set()),
    rows' = REACTORS.mapBy(r => Set()),
    holds' = Set(),
    badStores' = Set(),
    released' = Set(),
    refusals' = Set(),
    peerRefusals' = Set(),
    lostRows' = Set(),
    misreadAdmitted' = Set(),
    narrowedInFlight' = false,
    regressed' = false,
  }

  action init = {
    nondet bs = REACTORS.setOfMaps(BUILDS.exclude(Set("legacy"))).oneOf()
    initWith(bs, true)
  }

  /** A restart into another build. The unsent outbox is lost and re-derived; a client re-handshakes. */
  action changeBuild(r: str, nb: str): bool = all {
    nb != build.get(r),
    // Decision 19: no downgrade below the feature while storing documents above the baselines.
    nb != "legacy" or stored.get(r).forall(d => BASELINE.contains(docVersion.get(d))),
    build' = build.set(r, nb),
    seq' = seq.set(r, seq.get(r) + 1),
    outbox' = outbox.filter(o => o._1 != r),
    // A legacy client sends no manifest-bearing touch and reads none back: it owes only its own direction.
    pendingTouch' = EDGES.filter(e => pendingTouch.contains(e) or
      (e._1 == r and PUSH_EDGES.contains(e)) or
      (e._2 == r and hasFeature(nb) and PUSH_EDGES.contains((e._2, e._1)))),
    narrowedInFlight' = (narrowedInFlight or outbox.exists(m =>
      m._2 == r and runs(build.get(r)).contains(docVersion.get(m._3)) and not(runs(nb).contains(docVersion.get(m._3))))),
    known' = known, manifestMsgs' = manifestMsgs, docVersion' = docVersion, stored' = stored,
    rows' = rows, holds' = holds, badStores' = badStores, released' = released, refusals' = refusals,
    peerRefusals' = peerRefusals, lostRows' = lostRows, misreadAdmitted' = misreadAdmitted,
    regressed' = regressed,
  }

  /** a's current manifest travels to b: the handshake, a re-touch, or b concluding a is silent. */
  action touch(a: str, b: str): bool = {
    val c = current(a)
    val m = { src: a, dst: b, ann: c.ann, seq: c.seq }
    all {
      EDGES.contains((a, b)),
      hasFeature(build.get(b)),
      pendingTouch.contains((a, b)) or mismatch(a, b),
      not(manifestMsgs.contains(m)),
      manifestMsgs' = manifestMsgs.union(Set(m)),
      build' = build, seq' = seq, known' = known, pendingTouch' = pendingTouch, outbox' = outbox,
      docVersion' = docVersion, stored' = stored, rows' = rows, holds' = holds, badStores' = badStores,
      released' = released, refusals' = refusals, peerRefusals' = peerRefusals, lostRows' = lostRows,
      misreadAdmitted' = misreadAdmitted, narrowedInFlight' = narrowedInFlight, regressed' = regressed,
    }
  }

  /** onPeerManifest: persist; on a change (or always, with RECHECK_HOLDS) narrow and release. */
  action deliverManifest(m: ManifestMsg): bool = {
    val b = m.dst
    val a = m.src
    val k = known.get(b).get(a)
    val listens = hasFeature(build.get(b))
    val apply = listens and not(MANIFEST_SEQ and m.seq < k.seq)
    val changed = apply and (k.ann != m.ann or (MANIFEST_SEQ and k.seq != m.seq))
    val recheck = changed or (apply and RECHECK_HOLDS)
    val sup = supportsOf(m.ann)
    val toRelease =
      if (recheck) holds.filter(h => h._1 == b and h._2 == a and sup.contains(docVersion.get(h._3)))
      else Set()
    val unsent = if (recheck and GATE) unsentFor(b, a, sup) else Set()
    all {
      manifestMsgs.contains(m),
      manifestMsgs' = manifestMsgs.exclude(Set(m)),
      known' = if (apply) known.setBy(b, kb => kb.set(a, { ann: m.ann, seq: m.seq })) else known,
      pendingTouch' = if (m.seq == seq.get(a)) pendingTouch.exclude(Set((a, b))) else pendingTouch,
      holds' = swap(ITEMS, holds, toRelease, unsent),
      released' = plus(ITEMS, released, toRelease),
      outbox' = swap(ITEMS, outbox, unsent, toRelease),
      regressed' = (regressed or (apply and m.seq < k.seq)),
      build' = build, seq' = seq, docVersion' = docVersion, stored' = stored, rows' = rows,
      badStores' = badStores, refusals' = refusals, peerRefusals' = peerRefusals, lostRows' = lostRows,
      misreadAdmitted' = misreadAdmitted, narrowedInFlight' = narrowedInFlight,
    }
  }

  /** Create at r, online or offline: selection reads only persisted manifests. */
  action create(r: str, d: int): bool = {
    val b = build.get(r)
    val v = selectVersion(r)
    all {
      docVersion.get(d) == 0,
      // A stage 1+ executor refuses a CREATE it does not run (the misconfigured case).
      not(refusesUnsupported(b)) or runs(b).contains(v),
      docVersion' = docVersion.set(d, v),
      stored' = stored.setBy(r, s => plus(DOCS, s, Set(d))),
      rows' = rows.setBy(r, s => plus(ROWS, s, Set((d, r, not(runs(b).contains(v)))))),
      build' = build, seq' = seq, known' = known, manifestMsgs' = manifestMsgs,
      pendingTouch' = pendingTouch, outbox' = outbox, holds' = holds, badStores' = badStores,
      released' = released, refusals' = refusals, peerRefusals' = peerRefusals, lostRows' = lostRows,
      misreadAdmitted' = misreadAdmitted, narrowedInFlight' = narrowedInFlight, regressed' = regressed,
    }
  }

  /** A write into a stored document, under the rules r reads it with. */
  action write(r: str, d: int): bool = {
    val b = build.get(r)
    val v = docVersion.get(d)
    val w = (d, r, not(runs(b).contains(v)))
    all {
      stored.get(r).contains(d),
      not(refusesUnsupported(b)) or runs(b).contains(v),
      not(rows.get(r).contains(w)),
      rows' = rows.setBy(r, s => plus(ROWS, s, Set(w))),
      build' = build, seq' = seq, known' = known, manifestMsgs' = manifestMsgs,
      pendingTouch' = pendingTouch, outbox' = outbox, docVersion' = docVersion, stored' = stored,
      holds' = holds, badStores' = badStores, released' = released, refusals' = refusals,
      peerRefusals' = peerRefusals, lostRows' = lostRows, misreadAdmitted' = misreadAdmitted,
      narrowedInFlight' = narrowedInFlight, regressed' = regressed,
    }
  }

  /** Outbox derivation for (a -> b) over d: an item, or a hold. */
  action sync(a: str, b: str, d: int): bool = {
    val v = docVersion.get(d)
    val held = GATE and hasFeature(build.get(a)) and not(peerSupports(a, b).contains(v))
    val m = (a, b, d)
    all {
      EDGES.contains((a, b)),
      stored.get(a).contains(d),
      not(holds.contains((a, b, d))),
      if (held) all { holds' = plus(ITEMS, holds, Set(m)), outbox' = outbox }
      else all { not(outbox.contains(m)), outbox' = plus(ITEMS, outbox, Set(m)), holds' = holds },
      build' = build, seq' = seq, known' = known, manifestMsgs' = manifestMsgs,
      pendingTouch' = pendingTouch, docVersion' = docVersion, stored' = stored, rows' = rows,
      badStores' = badStores, released' = released, refusals' = refusals, peerRefusals' = peerRefusals,
      lostRows' = lostRows, misreadAdmitted' = misreadAdmitted, narrowedInFlight' = narrowedInFlight,
      regressed' = regressed,
    }
  }

  /** Push or poll response, sent and received: the inbox, then executor load. */
  action transmit(a: str, b: str, d: int): bool = {
    val bb = build.get(b)
    val h = (a, b, d)
    val v = docVersion.get(d)
    val sent = rowsFor(a, d)
    // The client names its revision while it records the server as serving agreement.
    val namesRevision = hasFeature(bb) and known.get(b).get(a).ann != SILENT
    val pollSilenced = POLL_REVISION and PUSH_EDGES.contains((b, a)) and hasFeature(build.get(a)) and
      not(namesRevision) and known.get(a).get(b).ann != SILENT
    val sendHeld = not(pollSilenced) and SEND_GATE and GATE and hasFeature(build.get(a)) and
      not(peerSupports(a, b).contains(v))
    val carriesField = PUSH_FIELD and PUSH_EDGES.contains((a, b)) and hasFeature(build.get(a)) and
      known.get(a).get(b).ann != SILENT
    val fieldRejected = not(sendHeld) and carriesField and not(hasFeature(bb))
    // Either end records the other silent; unsent items it no longer supports become holds.
    val silenced = fieldRejected or pollSilenced
    val delivered = not(sendHeld) and not(silenced)
    val refuse = delivered and RECEIPT_CHECK and refusesUnsupported(bb) and not(runs(bb).contains(v))
    val peerRefuse = delivered and not(refuse) and PEER_CHECK and hasFeature(bb) and
      not(peerSupports(b, a).contains(v))
    val accept = delivered and not(refuse) and not(peerRefuse)
    val fallback = if (silenced) unsentFor(a, b, BASELINE) else Set()
    all {
      outbox.contains(h),
      not(HANDSHAKE_FIRST) or channelReady(a, b),
      outbox' = if (silenced) outbox.exclude(fallback) else outbox.exclude(Set(h)),
      known' =
        if (silenced) known.setBy(a, ka => ka.set(b, { ann: SILENT, seq: seq.get(b) }))
        else known,
      holds' =
        if (sendHeld) plus(ITEMS, holds, Set(h))
        // Decision 11: an UNSUPPORTED_PROTOCOL refusal becomes a hold at the sender.
        else if (refuse and hasFeature(build.get(a))) plus(ITEMS, holds, Set(h))
        else plus(ITEMS, holds, fallback),
      refusals' = if (refuse) plus(ITEMS, refusals, Set(h)) else refusals,
      peerRefusals' = if (peerRefuse) plus(ITEMS, peerRefusals, Set(h)) else peerRefusals,
      lostRows' =
        if (peerRefuse and sent.exists(w => not(w._3) and not(rows.get(b).contains(w))))
          plus(ITEMS, lostRows, Set(h))
        else lostRows,
      stored' = if (accept) stored.setBy(b, s => plus(DOCS, s, Set(d))) else stored,
      rows' = if (accept) rows.setBy(b, s => ROWS.filter(w => s.contains(w) or (w._1 == d and rows.get(a).contains(w)))) else rows,
      badStores' = if (accept and not(runs(bb).contains(v))) plus(PLACES, badStores, Set((b, d))) else badStores,
      misreadAdmitted' =
        if (accept and hasFeature(bb) and sent.exists(w => w._3)) plus(PLACES, misreadAdmitted, Set((b, d)))
        else misreadAdmitted,
      build' = build, seq' = seq, manifestMsgs' = manifestMsgs, pendingTouch' = pendingTouch,
      docVersion' = docVersion, released' = released, narrowedInFlight' = narrowedInFlight,
      regressed' = regressed,
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
      transmit(e._1, e._2, d),
    }
  }

  // --------------------------------------------------------------- properties

  /** No reactor admits a document at a version it does not run. */
  val noUnsupportedStore: bool = badStores == Set()

  /** Undo plan: no base-reducer 3 stream holds rows from a reactor that reads it as 2. */
  val noMisreadRows: bool = REACTORS.forall(r => rows.get(r).forall(w => not(w._3)))

  /** Weaker: a misread row never leaves the replica that wrote it. */
  val noMisreadRowsSpread: bool = REACTORS.forall(r => rows.get(r).forall(w => w._2 == r or not(w._3)))

  val safety: bool = noUnsupportedStore and noMisreadRows

  /** Weakest: no stage 1+ build admits a misread row (the PEER_PROTOCOL_UNSUPPORTED check's job). */
  val noMisreadAdmitted: bool = misreadAdmitted == Set()

  /** Every unsent item of a gated sender passes the gate against the sender's current record. */
  val outboxGated: bool =
    not(GATE) or outbox.forall(o => not(hasFeature(build.get(o._1))) or peerSupports(o._1, o._2).contains(docVersion.get(o._3)))

  /**
   * No hold whose release condition holds with nothing left to trigger it:
   * the receiver runs the version, the sender's record supports it, and no
   * touch from the receiver is owed, detectable or in flight.
   */
  val noStuckHold: bool = holds.forall(h => {
    val a = h._1
    val b = h._2
    val v = docVersion.get(h._3)
    not(
      hasFeature(build.get(a)) and
      runs(build.get(b)).contains(v) and
      peerSupports(a, b).contains(v) and
      not(pendingTouch.contains((b, a))) and
      not(mismatch(b, a)) and
      not(manifestMsgs.exists(m => m.src == b and m.dst == a))
    )
  })

  /** No delayed manifest overwrites a newer record. */
  val noManifestRegress: bool = not(regressed)

  /** No PEER_PROTOCOL_UNSUPPORTED refusal drops a legitimate row the receiver lacks. */
  val noLostRows: bool = lostRows == Set()

  // Reachability. Each `witnessNo*` is expected to be VIOLATED; the violation is a trace to the state.
  val witnessNoV3Doc: bool = not(DOCS.exists(d => docVersion.get(d) == 3))
  val witnessNoHold: bool = holds == Set()
  val witnessNoRelease: bool = released == Set()
  val witnessNoNarrowInFlight: bool = not(narrowedInFlight)
  val witnessNoRefusal: bool = refusals == Set()
  val witnessNoPeerRefusal: bool = peerRefusals == Set()
  /** A v3 document stored at every reactor of the line, so relayed through S. */
  val witnessNoRelayedV3: bool =
    not(DOCS.exists(d => docVersion.get(d) == 3 and REACTORS.forall(r => stored.get(r).contains(d))))
}

// ---------------------------------------------------------------- instances
// Line A - S - B: S is the server and relay; A and B are its clients.

/** The plan as written, stage 1+ builds. */
module stage1 {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module stage1Recheck {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = true, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module stage1Seq {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = false
  ).*
}

/** Receipt refusals removed. */
module gateOnly {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = false, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

/** Outbox gate removed. */
module receiptOnly {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 2,
    GATE = false, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

/** Rollback below the feature (decision 19). */
module legacy {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module legacySendGate {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = true, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module legacyPushField {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

/** Announces 3, runs 2 (host/worker flag mismatch), later fixed. */
module misconfigured {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("misconfigured", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module misconfiguredRecheck {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("misconfigured", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = true, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module misconfiguredSeq {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("misconfigured", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = false
  ).*
}

/** Announces 3, admits it, reads it as 2: the "claims more" trust case. */
module liar {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("liar", "wide"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

/** Every honest build with the push field, manifest sequences and poll revisions. */
module fixed {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = true
  ).*
}

module fixedNoHandshake {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 2,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = false,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = true
  ).*
}

// Verify instances: one document. The argument, not checked: documents share only peer records, which
// a touch reaches as well, and the decision 19 guard, which more documents only tighten.

module stage1One {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module stage1SeqOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = false
  ).*
}

module gateOnlyOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = false, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module legacyOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module legacySendGateOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = false, SEND_GATE = true, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module legacyPushFieldOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = false, POLL_REVISION = false
  ).*
}

module fixedOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = true
  ).*
}

/** A server that ran a legacy build keeps its stale record of a client that rolled back meanwhile. */
module fixedNoPollRevisionOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = true,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = false
  ).*
}

module fixedNoHandshakeOne {
  import PeerAgreement(
    REACTORS = Set("A", "S", "B"),
    EDGES = Set(("A", "S"), ("S", "A"), ("S", "B"), ("B", "S")),
    PUSH_EDGES = Set(("A", "S"), ("B", "S")),
    BUILDS = Set("legacy", "narrow", "wide", "misconfigured"),
    MAX_DOCS = 1,
    GATE = true, RECEIPT_CHECK = true, PEER_CHECK = true, HANDSHAKE_FIRST = false,
    PUSH_FIELD = true, SEND_GATE = false, RECHECK_HOLDS = false, MANIFEST_SEQ = true, POLL_REVISION = true
  ).*
}
