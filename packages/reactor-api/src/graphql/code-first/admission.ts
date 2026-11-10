import { readSubgraphProtocol } from "document-model";
import { reasonOf } from "./compile.js";
import { CodeFirstSubgraphError } from "./errors.js";

/**
 * When the host checks a subgraph: its class before construction, its
 * instance after construction, and its instance after `onSetup`.
 */
export type CodeFirstPhase = "registration" | "construction" | "setup";

const SUPPORTED_PROTOCOL_VERSION = 1;

/**
 * Refuses a code-first subgraph that the host must not serve, by throwing a
 * `CodeFirstSubgraphError`. `target` is the class at registration and the
 * instance after it. A schema-first class, its instances and plain objects
 * return at once.
 *
 * The protocol runs in the copy of reactor-api that defined the class, so a
 * class from another copy is described and validated by its own copy.
 */
export function codeFirstCheck(target: unknown, phase: CodeFirstPhase): void {
  const cls =
    phase === "registration"
      ? target
      : (target as { constructor?: unknown } | null)?.constructor;
  const read = readSubgraphProtocol(cls);
  if (read.kind === "schema-first") return;
  const label = (cls as { name?: unknown }).name;
  if (read.kind === "unsupported") {
    const spoken =
      read.version === SUPPORTED_PROTOCOL_VERSION
        ? `a malformed subgraph protocol version ${SUPPORTED_PROTOCOL_VERSION}`
        : `subgraph protocol version ${String(read.version)}`;
    throw new CodeFirstSubgraphError(
      `Refusing ${String(label)}: it speaks ${spoken}, but this host supports version ${SUPPORTED_PROTOCOL_VERSION}`,
    );
  }
  if (phase === "registration") {
    const { name, diagnostics } = read.protocol.describe();
    const reason =
      name === undefined
        ? `${String(label)} has no static subgraphName`
        : reasonOf(diagnostics);
    if (reason !== "") {
      throw new CodeFirstSubgraphError(`Refusing ${String(label)}: ${reason}`);
    }
    return;
  }
  const result = read.protocol.validate(target);
  if (!result.ok) {
    throw new CodeFirstSubgraphError(
      `Refusing ${String(label)} after ${phase === "setup" ? "onSetup" : "construction"}: ${result.message}`,
    );
  }
}

export function isCodeFirstBase(candidate: unknown): boolean {
  const read = readSubgraphProtocol(candidate);
  return (
    read.kind === "code-first" && read.protocol.describe().name === undefined
  );
}
