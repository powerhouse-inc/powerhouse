import request, { GraphQLClient, gql } from 'graphql-request';
import { logger } from './logger';

export { gql } from 'graphql-request';

export type DriveInfo = {
    id: string;
    name: string;
    slug: string;
    icon?: string;
};

// replaces fetch so it can be used in Node and Browser envs
export async function requestGraphql<T>(...args: Parameters<typeof request>) {
    const [url, ...requestArgs] = args;
    const client = new GraphQLClient(url, { fetch });
    return client.request<T>(...requestArgs);
}

export async function requestPublicDrive(url: string): Promise<DriveInfo> {
    let drive: DriveInfo;
    try {
        const result = await requestGraphql<{ drive: DriveInfo }>(
            url,
            gql`
                query getDrive {
                    drive {
                        id
                        name
                        icon
                        slug
                    }
                }
            `
        );
        drive = result.drive;
    } catch (e) {
        logger.error(e);
        throw new Error("Couldn't find drive info");
    }

    if (!drive) {
        throw new Error('Drive not found');
    }

    return drive;
}
