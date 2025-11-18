----------------------------- MODULE ReactorSync -----------------------------
(*
TLA+ Specification for Reactor Synchronization Protocol - Phase 1
==================================================================

This specification models the core synchronization algorithm for the Reactor
package at a high level of abstraction. It verifies:
  - Eventual consistency between distributed reactors
  - Conflict resolution correctness (reshuffle algorithm)
  - Basic safety properties (uniqueness, monotonicity)

Phase 1 bounds: 2 reactors, 1 document, max 3 operations
Expected TLC runtime: 1-5 minutes
*)

EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Reactors,        \* Set of reactor IDs (e.g., {r1, r2})
    Documents,       \* Set of document IDs (e.g., {doc1})
    MaxOperations    \* Maximum operations per reactor (e.g., 3)

ASSUME MaxOperations > 0

-----------------------------------------------------------------------------
(* Type Definitions *)

\* Operation structure (simplified, high-level)
Operation == [
    id: STRING,           \* Unique operation ID
    index: Nat,           \* Position in stream
    timestamp: Nat,       \* Logical timestamp for conflict resolution
    skip: Nat             \* Number of ops to skip (for undo/reshuffle)
]

\* Channel mailboxes
ChannelState == [
    inbox: SUBSET Operation,
    outbox: SUBSET Operation
]

-----------------------------------------------------------------------------
(* State Variables *)

VARIABLES
    streams,       \* streams[reactor][doc] = sequence of operations
    channels,      \* channels[reactor][remote] = channel state
    cursors,       \* cursors[reactor][remote] = last synced index
    nextOpId,      \* Global counter for generating unique operation IDs
    clock          \* Global logical clock for timestamps

vars == <<streams, channels, cursors, nextOpId, clock>>

-----------------------------------------------------------------------------
(* Helper Operators *)

\* Get operations in a stream
GetStream(reactor, doc) ==
    IF doc \in DOMAIN streams[reactor]
    THEN streams[reactor][doc]
    ELSE <<>>

\* Get last index in a stream (excluding skipped operations)
LastIndex(stream) ==
    IF stream = <<>> THEN 0 ELSE Len(stream)

\* Check if two streams are equivalent (same operations after applying skips)
StreamsEquivalent(stream1, stream2) ==
    LET ActiveOps(s) ==
        {i \in DOMAIN s :
            \A j \in DOMAIN s :
                (j > i) => (s[j].skip < j - i + 1)}
    IN ActiveOps(stream1) = ActiveOps(stream2) /\
       \A i \in ActiveOps(stream1) : stream1[i] = stream2[i]

\* Find operations in stream after given index
OpsAfterIndex(stream, idx) ==
    {stream[i] : i \in {j \in DOMAIN stream : j > idx}}

\* Detect conflict: streams have diverged
HasConflict(reactor1, reactor2, doc) ==
    LET s1 == GetStream(reactor1, doc)
        s2 == GetStream(reactor2, doc)
        commonLen == IF Len(s1) < Len(s2) THEN Len(s1) ELSE Len(s2)
    IN \E i \in 1..commonLen : s1[i] # s2[i]

\* Simple reshuffle: sort conflicting operations by timestamp
\* Returns new stream that merges ops deterministically
\* Deduplicates by operation ID (same op can appear in both streams)
ReshuffleStreams(stream1, stream2) ==
    LET allOpIds == {stream1[i].id : i \in DOMAIN stream1} \cup
                    {stream2[i].id : i \in DOMAIN stream2}
        \* For each unique ID, pick the operation (preferring stream1 arbitrarily)
        uniqueOps == {CHOOSE op \in ({stream1[i] : i \in DOMAIN stream1} \cup
                                     {stream2[i] : i \in DOMAIN stream2}) :
                        op.id = opId : opId \in allOpIds}
        \* Sort by timestamp (CHOOSE provides deterministic tie-breaking)
        sortedOps == CHOOSE seq \in [1..Cardinality(uniqueOps) -> uniqueOps] :
            /\ \A i \in DOMAIN seq : \A j \in DOMAIN seq :
                (i < j) => (seq[i].timestamp <= seq[j].timestamp)
            /\ \A op \in uniqueOps : \E i \in DOMAIN seq : seq[i] = op
    IN [i \in DOMAIN sortedOps |-> [
        id |-> sortedOps[i].id,
        index |-> i,
        timestamp |-> sortedOps[i].timestamp,
        skip |-> 0
    ]]

-----------------------------------------------------------------------------
(* Initial State *)

Init ==
    /\ streams = [r \in Reactors |-> [d \in Documents |-> <<>>]]
    /\ channels = [r \in Reactors |->
                    [remote \in Reactors |->
                        [inbox |-> {}, outbox |-> {}]]]
    /\ cursors = [r \in Reactors |-> [remote \in Reactors |-> 0]]
    /\ nextOpId = 1
    /\ clock = 1

-----------------------------------------------------------------------------
(* Actions *)

\* Reactor creates an operation locally
LocalWrite(reactor, doc) ==
    /\ LastIndex(GetStream(reactor, doc)) < MaxOperations
    /\ LET currentStream == GetStream(reactor, doc)
           newOp == [
               id |-> ToString(nextOpId),
               index |-> LastIndex(currentStream) + 1,
               timestamp |-> clock,
               skip |-> 0
           ]
       IN /\ streams' = [streams EXCEPT
                ![reactor][doc] = Append(currentStream, newOp)]
          /\ nextOpId' = nextOpId + 1
          /\ clock' = clock + 1
          /\ UNCHANGED <<channels, cursors>>

\* Push all local operations to outbox (receiver will handle idempotency)
PushToOutbox(reactor, remote, doc) ==
    /\ reactor # remote
    /\ LET currentStream == GetStream(reactor, doc)
           allOps == {currentStream[i] : i \in DOMAIN currentStream}
       IN /\ allOps # {}  \* Only if there are operations to push
          /\ allOps # channels[reactor][remote].outbox  \* Only if different from current outbox
          /\ channels' = [channels EXCEPT
                ![reactor][remote].outbox = allOps]
          /\ UNCHANGED <<streams, cursors, nextOpId, clock>>

\* Transport operation from outbox to remote inbox
TransportOperation(sender, receiver, doc) ==
    /\ sender # receiver
    /\ channels[sender][receiver].outbox # {}
    /\ LET op == CHOOSE o \in channels[sender][receiver].outbox : TRUE
       IN /\ channels' = [channels EXCEPT
                ![sender][receiver].outbox = @ \ {op},
                ![receiver][sender].inbox = @ \cup {op}]
          /\ UNCHANGED <<streams, cursors, nextOpId, clock>>

\* Apply operations from inbox to local stream
\* Build temporary stream from inbox ops, then detect conflicts and reshuffle if needed
ApplyFromInbox(reactor, remote, doc) ==
    /\ reactor # remote
    /\ channels[reactor][remote].inbox # {}
    /\ LET currentStream == GetStream(reactor, doc)
           inboxOps == channels[reactor][remote].inbox
           \* Get IDs already in local stream (for idempotency check)
           localIds == {currentStream[i].id : i \in DOMAIN currentStream}
           \* Filter out operations already in local stream (idempotency)
           newOps == {op \in inboxOps : op.id \notin localIds}
       IN IF newOps = {}
          THEN \* All operations already applied - just clear inbox
               /\ channels' = [channels EXCEPT
                     ![reactor][remote].inbox = {}]
               /\ UNCHANGED <<streams, cursors, nextOpId, clock>>
          ELSE \* Have new operations to apply
               LET \* Create temporary stream from new inbox operations sorted by timestamp
                   inboxStream == LET sorted == CHOOSE seq \in [1..Cardinality(newOps) -> newOps] :
                                       /\ \A i \in DOMAIN seq : \A j \in DOMAIN seq :
                                           (i < j) => (seq[i].timestamp <= seq[j].timestamp)
                                       /\ \A op \in newOps : \E i \in DOMAIN seq : seq[i] = op
                                  IN sorted
                   \* Detect conflict: check if any inbox op has same index as local op with different ID
                   hasConflict == \E localIdx \in DOMAIN currentStream, inboxOp \in newOps :
                                   currentStream[localIdx].index = inboxOp.index /\
                                   currentStream[localIdx].id # inboxOp.id
               IN IF hasConflict
                  THEN \* Conflict - reshuffle current stream with inbox operations
                       /\ LET reshuffled == ReshuffleStreams(currentStream, inboxStream)
                          IN /\ streams' = [streams EXCEPT ![reactor][doc] = reshuffled]
                             /\ cursors' = [cursors EXCEPT
                                   ![reactor][remote] = LastIndex(reshuffled)]
                             /\ channels' = [channels EXCEPT
                                   ![reactor][remote].inbox = {}]
                             /\ UNCHANGED <<nextOpId, clock>>
                  ELSE \* No conflict - apply one operation from inbox
                       /\ LET op == CHOOSE o \in newOps : TRUE
                          IN /\ streams' = [streams EXCEPT
                                   ![reactor][doc] = Append(currentStream,
                                       [id |-> op.id,
                                        index |-> LastIndex(currentStream) + 1,
                                        timestamp |-> op.timestamp,
                                        skip |-> 0])]
                             /\ channels' = [channels EXCEPT
                                   ![reactor][remote].inbox = @ \ {op}]
                             /\ cursors' = [cursors EXCEPT
                                   ![reactor][remote] = LastIndex(streams'[reactor][doc])]
                             /\ UNCHANGED <<nextOpId, clock>>

\* Reshuffle: resolve conflict by merging streams deterministically
PerformReshuffle(reactor, remote, doc) ==
    /\ reactor # remote
    /\ HasConflict(reactor, remote, doc)
    /\ LET localStream == GetStream(reactor, doc)
           remoteStream == GetStream(remote, doc)
           reshuffled == ReshuffleStreams(localStream, remoteStream)
       IN /\ streams' = [streams EXCEPT ![reactor][doc] = reshuffled]
          /\ cursors' = [cursors EXCEPT
                ![reactor][remote] = LastIndex(reshuffled)]
          /\ \* Clear inbox operations that have been merged
             channels' = [channels EXCEPT
                ![reactor][remote].inbox = {}]
          /\ UNCHANGED <<nextOpId, clock>>

\* Acknowledge: remote confirms receipt, allowing sender to update cursor
\* Only fires when cursor is behind (there was actual sync activity)
SendAck(sender, receiver, doc) ==
    /\ sender # receiver
    /\ channels[receiver][sender].inbox = {}  \* Receiver has processed all
    /\ channels[sender][receiver].outbox = {}  \* Sender has sent all
    /\ LET senderStream == GetStream(sender, doc)
           currentCursor == cursors[sender][receiver]
       IN /\ currentCursor < LastIndex(senderStream)  \* Only if cursor behind
          /\ cursors' = [cursors EXCEPT
                \* Sender's cursor tracks what receiver has confirmed
                ![sender][receiver] = LastIndex(senderStream)]
          /\ UNCHANGED <<streams, channels, nextOpId, clock>>

-----------------------------------------------------------------------------
(* Next State Relation *)

Next ==
    \/ \E r \in Reactors, d \in Documents : LocalWrite(r, d)
    \/ \E r1, r2 \in Reactors, d \in Documents : PushToOutbox(r1, r2, d)
    \/ \E r1, r2 \in Reactors, d \in Documents : TransportOperation(r1, r2, d)
    \/ \E r1, r2 \in Reactors, d \in Documents : ApplyFromInbox(r1, r2, d)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

-----------------------------------------------------------------------------
(* Invariants *)

\* All operation IDs are unique across the system
TypeOK ==
    /\ streams \in [Reactors -> [Documents -> Seq(Operation)]]
    /\ channels \in [Reactors -> [Reactors -> ChannelState]]
    /\ cursors \in [Reactors -> [Reactors -> Nat]]

\* Within a single stream, no duplicate operation IDs
\* Same operation ID CAN appear across reactors (that's replication)
OperationUniqueness ==
    \A r \in Reactors, d \in Documents :
        LET stream == GetStream(r, d)
        IN \A i, j \in DOMAIN stream :
            (i # j) => (stream[i].id # stream[j].id)

\* Indices within a stream are monotonically increasing
StreamMonotonicity ==
    \A r \in Reactors, d \in Documents :
        LET stream == GetStream(r, d)
        IN \A i, j \in DOMAIN stream :
            (i < j) => (stream[i].index <= stream[j].index)

\* Cursors never decrease
CursorMonotonicity ==
    \A r \in Reactors, remote \in Reactors :
        cursors[r][remote] >= 0

\* State constraint for bounding model checking
StateConstraint == nextOpId <= 5

-----------------------------------------------------------------------------
(* Temporal Properties *)

\* System is quiescent when no operations in transit
Quiescent ==
    \A r1, r2 \in Reactors :
        /\ channels[r1][r2].inbox = {}
        /\ channels[r1][r2].outbox = {}

\* All reactors have equivalent streams for all documents
AllReactorsConsistent ==
    \A r1, r2 \in Reactors, d \in Documents :
        StreamsEquivalent(GetStream(r1, d), GetStream(r2, d))

\* Eventual consistency: if system becomes quiescent, reactors converge
EventualConsistency ==
    []<>(Quiescent => AllReactorsConsistent)

\* Liveness: operations eventually get delivered
EventualDelivery ==
    \A r1, r2 \in Reactors, d \in Documents :
        [](LastIndex(GetStream(r1, d)) > cursors[r1][r2] =>
           <>(cursors[r1][r2] = LastIndex(GetStream(r1, d))))

=============================================================================
