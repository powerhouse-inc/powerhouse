#!/usr/bin/env python3
"""Print an ITF trace (quint run --mbt --out-itf) as one line per step: action, args, changed vars."""
import json
import sys


def dec(v):
    if isinstance(v, dict):
        if "#bigint" in v:
            return int(v["#bigint"])
        if "#set" in v:
            return frozenset(dec(x) for x in v["#set"]) if all(not isinstance(dec(x), (dict, list)) for x in v["#set"]) else tuple(sorted((dec(x) for x in v["#set"]), key=repr))
        if "#tup" in v:
            return tuple(dec(x) for x in v["#tup"])
        if "#map" in v:
            return {dec(k) if not isinstance(dec(k), (dict, list, frozenset)) else repr(dec(k)): dec(x) for k, x in v["#map"]}
        if "tag" in v and "value" in v:
            inner = dec(v["value"])
            return v["tag"] if inner == () else f"{v['tag']}({fmt(inner)})"
        return {k: dec(x) for k, x in v.items() if not k.startswith("#")}
    if isinstance(v, list):
        return [dec(x) for x in v]
    return v


def fmt(v):
    if isinstance(v, frozenset):
        return "{" + ",".join(sorted(fmt(x) for x in v)) + "}"
    if isinstance(v, tuple):
        return "(" + ",".join(fmt(x) for x in v) + ")"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}:{fmt(x)}" for k, x in v.items()) + "}"
    return str(v)


def pick(p, k):
    x = p.get(k)
    return dec(x["value"]) if x and x.get("tag") == "Some" else None


def msg(m):
    if m is None:
        return ""
    if "ann" in m:
        return f"{m['src']}->{m['dst']} {m['ann']}"
    return f"{m['src']}->{m['dst']} doc{m['doc']}@v{m['version']} rows={fmt(tuple(sorted(r['id'] for r in m['rows'])))}"


SHOW = ["build", "known", "docVersion", "stored", "holds", "refusals", "peerRefusals", "released", "badStores", "misreadAdmitted", "rows", "narrowedInFlight"]

t = json.load(open(sys.argv[1]))
prev = None
for i, s in enumerate(t["states"]):
    st = {k.split("::")[-1]: dec(v) for k, v in s.items() if "PeerAgreement::" in k}
    if "known" in st:
        st["known"] = {r: {p: a for p, a in ps.items() if p != r} for r, ps in st["known"].items()}
    if "rows" in st:
        st["rows"] = {r: fmt(tuple(f"{w['id']}:{w['writer']}/as{w['readAs']}/d{w['doc']}" for w in sorted(ws, key=lambda w: w['id']))) for r, ws in st["rows"].items()}
    act = s.get("mbt::actionTaken", "?")
    p = s.get("mbt::nondetPicks", {})
    args = {
        "changeBuild": lambda: f"{pick(p,'r')} -> {pick(p,'nb')}",
        "touch": lambda: "{}->{}".format(*pick(p, "e")),
        "create": lambda: f"{pick(p,'r')} doc{pick(p,'d')}",
        "write": lambda: f"{pick(p,'r')} doc{pick(p,'d')}",
        "sync": lambda: "{}->{} doc{}".format(*pick(p, "e"), pick(p, "d")),
        "deliverManifest": lambda: msg(pick(p, "m")),
        "deliverData": lambda: msg(pick(p, "m")),
        "send": lambda: msg(pick(p, "m")),
    }.get(act, lambda: "")()
    if prev is None:
        print(f"[0] init build={fmt(st['build'])}")
    else:
        changes = [f"{k}={fmt(st[k])}" for k in SHOW if k in st and st[k] != prev[k]]
        print(f"[{i}] {act} {args}" + ("" if not changes else "\n      " + "\n      ".join(changes)))
    prev = st
