import { createReactor } from "../store/reactor.js";

export function loader() {
  return { reactor: createReactor() };
}
