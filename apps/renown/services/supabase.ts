import { createClient } from "@supabase/supabase-js";
import { Challenge } from "./challenge";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase env variables not defined");
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export function saveChallenge(challenge: Challenge) {
    return supabase.from("challenges").insert(challenge);
}

export function getChallenge(challenge: Challenge) {
    return (
        supabase
            .from("challenges")
            .select<any, Challenge>()
            .limit(1)
            .eq("address", challenge.address)
            .eq("publicKey", challenge.publicKey)
            .eq("challenge", challenge.challenge)
            // TODO check expiration
            .then((result) => {
                return result.data?.length ? result.data[0] : undefined;
            })
    );
}
