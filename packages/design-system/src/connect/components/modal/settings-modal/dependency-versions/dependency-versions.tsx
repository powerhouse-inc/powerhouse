import { useState } from 'react';
import { Disclosure } from '../../../disclosure';

export type ConnectAppPackageJson = {
    version: string;
    devDependencies: {
        '@powerhousedao/design-system': string;
        'document-drive': string;
        'document-model': string;
        'document-model-libs': string;
    };
};

export function verifyPackageJsonFields(
    packageJson: unknown,
): asserts packageJson is ConnectAppPackageJson {
    if (!packageJson || typeof packageJson !== 'object') {
        throw new Error('Invalid package.json');
    }
    if (!('version' in packageJson)) {
        throw new Error('Missing version field in package.json');
    }
    if (!('devDependencies' in packageJson)) {
        throw new Error('Missing devDependencies field in package.json');
    }
    if (typeof packageJson.version !== 'string') {
        throw new Error('Invalid version field in package.json');
    }
    if (
        !packageJson.devDependencies ||
        typeof packageJson.devDependencies !== 'object'
    ) {
        throw new Error('Invalid devDependencies field in package.json');
    }
    if (
        !('@powerhousedao/design-system' in packageJson.devDependencies) ||
        typeof packageJson.devDependencies['@powerhousedao/design-system'] !==
            'string'
    ) {
        throw new Error('Invalid @powerhousedao/design-system dependency');
    }
    if (
        !('document-drive' in packageJson.devDependencies) ||
        typeof packageJson.devDependencies['document-drive'] !== 'string'
    ) {
        throw new Error('Invalid document-drive dependency');
    }
    if (
        !('document-model' in packageJson.devDependencies) ||
        typeof packageJson.devDependencies['document-model'] !== 'string'
    ) {
        throw new Error('Invalid document-model dependency');
    }
    if (
        !('document-model-libs' in packageJson.devDependencies) ||
        typeof packageJson.devDependencies['document-model-libs'] !== 'string'
    ) {
        throw new Error('Invalid document-model-libs dependency');
    }
}

type Props = {
    readonly packageJson: unknown;
};
export function DependencyVersions(props: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const { packageJson } = props;

    try {
        verifyPackageJsonFields(packageJson);
    } catch (e) {
        console.error(e);
        return null;
    }

    return (
        <Disclosure
            isOpen={isOpen}
            onOpenChange={() => setIsOpen(!isOpen)}
            title={`App version: ${packageJson.version}`}
        >
            <ul className="text-gray-800">
                <li className="my-1 flex justify-between pr-1">
                    <span>design-system:</span>
                    <span className="font-medium">
                        {
                            packageJson.devDependencies[
                                '@powerhousedao/design-system'
                            ]
                        }
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-drive:</span>{' '}
                    <span className="font-medium">
                        {packageJson.devDependencies['document-drive']}
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-model:</span>{' '}
                    <span className="font-medium">
                        {packageJson.devDependencies['document-model']}
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-model-libs:</span>{' '}
                    <span className="font-medium">
                        {packageJson.devDependencies['document-model-libs']}
                    </span>
                </li>
            </ul>
        </Disclosure>
    );
}
