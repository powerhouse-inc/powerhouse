"use client";
import GraphQLIframe from "@/components/graphql/iframe";
import { Suspense } from "react";

export default function GraphQL() {
  return (
    <Suspense>
      <GraphQLIframe url={`/explorer`} />
    </Suspense>
  );
}
