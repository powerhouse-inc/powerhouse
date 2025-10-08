import * as chains from "viem/chains";

export type Chain = chains.Chain;

export function getChain(id: number): Chain | undefined {
    return Object.values(chains).find((x) => x.id === id);
}
