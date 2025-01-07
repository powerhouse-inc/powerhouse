import { Suspense } from "react";
import GraphQLIframe from "../../components/graphql/iframe";

export default function GraphQLDrive({ driveId }: { driveId: string }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GraphQLIframe url={`/d/${driveId}`} />
    </Suspense>
  );
}
