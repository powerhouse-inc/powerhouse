"use client";
import GraphQLIframe from "@/components/graphql/iframe";
import { env } from "next-runtime-env";
import { useParams } from "next/navigation";
import { Suspense } from "react";

export default function GraphQLDrive() {
  const params = useParams<{ driveId: string }>();
  const NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST = env(
    "NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST"
  );

  return (
    <Suspense>
      <GraphQLIframe
        url={`${NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST}/explorer/${params?.driveId}`}
      />
    </Suspense>
  );
}
