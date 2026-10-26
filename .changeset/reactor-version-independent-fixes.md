---
"@powerhousedao/reactor": patch
---

Fix four reactor defects that affect base-reducer 1 and 2 documents:

- A cold read of revision 0 no longer serves the state of a later keyframe.
- A document held from a peer and released once that peer can run it now reaches the peer. Before, the next ack trim dropped the released history unsent.
- A stored `UNSUPPORTED_PROTOCOL` refusal is dropped when dead letters load, instead of being reported again and re-holding the document after the peer restarts.
- With `documentDecisions` on, rows that an inline re-evaluation re-appends now reach the job result and `JOB_WRITE_READY`, so `reactor.get` serves the re-evaluated state.
