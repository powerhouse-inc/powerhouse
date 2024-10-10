'use client';
import GraphQLIframe from '@/components/graphql/iframe';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';

export default function GraphQLDrive() {
    const { driveId } = useParams<{ driveId: string }>();

    return (
        <Suspense>
            <GraphQLIframe url={`/explorer/${driveId}`} />
        </Suspense>
    );
}
