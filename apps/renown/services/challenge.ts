import { verifyAsync } from "@noble/ed25519";
import * as supabase from "./supabase";

export type Challenge = {
    address: string;
    publicKey: string;
    challenge: string;
};

export function generateChallenge(): string {
    return crypto.randomUUID();
}

export async function verifyChallenge(
    publicKey: string,
    challenge: string,
    signedChallenge: string
) {
    const publicKeyHex = Buffer.from(publicKey, "base64").toString("hex");
    const signatureHex = Buffer.from(signedChallenge, "base64").toString("hex");
    const messageHex = Buffer.from(challenge).toString("hex");
    return verifyAsync(signatureHex, messageHex, publicKeyHex);
}

export const getChallenge = supabase.getChallenge;
export const saveChallenge = supabase.saveChallenge;
