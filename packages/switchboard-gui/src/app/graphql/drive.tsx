import { Suspense } from "preact/compat";
import GraphQLIframe from "../../components/graphql/iframe.js";

export default function GraphQLDrive({ driveId }: { driveId: string }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GraphQLIframe url={`/d/${driveId}`} />
    </Suspense>
  );
}
