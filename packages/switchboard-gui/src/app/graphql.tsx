import GraphQLIframe from "../components/graphql/iframe.js";
import { Suspense } from "preact/compat";

export default function GraphQL() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GraphQLIframe url={`/system`} />
    </Suspense>
  );
}
