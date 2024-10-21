"use client";
import GraphQLIframe from "../components/graphql/iframe";
import { Suspense } from "react";

export default function GraphQL() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GraphQLIframe url={`/explorer`} />
    </Suspense>
  );
}
