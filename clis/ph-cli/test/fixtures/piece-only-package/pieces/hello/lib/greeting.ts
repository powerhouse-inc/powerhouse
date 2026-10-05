// zod on purpose: the node build externalizes it with the rest of the shared
// set, so its absence from the built piece proves the piece build inlines it.
import { z } from "zod";

const name = z.string().min(1);

export function greet(who: string): string {
  return `hello, ${name.parse(who)}`;
}

export const LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
