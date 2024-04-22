import { useState } from 'react';
import { Disclosure } from '../../../disclosure';

export type ConnectAppPackageJson = {
    version: string;
    dependencies: {
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
    if (!('dependencies' in packageJson)) {
        throw new Error('Missing dependencies field in package.json');
    }
    if (!('devDependencies' in packageJson)) {
        throw new Error('Missing devDependencies field in package.json');
    }
    if (typeof packageJson.version !== 'string') {
        throw new Error('Invalid version field in package.json');
    }
    if (
        !packageJson.dependencies ||
        typeof packageJson.dependencies !== 'object'
    ) {
        throw new Error('Invalid dependencies field in package.json');
    }
    if (
        !packageJson.devDependencies ||
        typeof packageJson.devDependencies !== 'object'
    ) {
        throw new Error('Invalid devDependencies field in package.json');
    }
    if (
        !('@powerhousedao/design-system' in packageJson.dependencies) ||
        typeof packageJson.dependencies['@powerhousedao/design-system'] !==
            'string'
    ) {
        throw new Error('Invalid @powerhousedao/design-system dependency');
    }
    if (
        !('document-drive' in packageJson.dependencies) ||
        typeof packageJson.dependencies['document-drive'] !== 'string'
    ) {
        throw new Error('Invalid document-drive dependency');
    }
    if (
        !('document-model' in packageJson.dependencies) ||
        typeof packageJson.dependencies['document-model'] !== 'string'
    ) {
        throw new Error('Invalid document-model dependency');
    }
    if (
        !('document-model-libs' in packageJson.dependencies) ||
        typeof packageJson.dependencies['document-model-libs'] !== 'string'
    ) {
        throw new Error('Invalid document-model-libs dependency');
    }
}

type Props = {
    packageJson: unknown;
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
            title={`App version: ${packageJson.version}`}
            isOpen={isOpen}
            onOpenChange={() => setIsOpen(!isOpen)}
        >
            <ul className="text-gray-800">
                <li className="my-1 flex justify-between pr-1">
                    <span>design-system:</span>
                    <span className="font-medium">
                        {
                            packageJson.dependencies[
                                '@powerhousedao/design-system'
                            ]
                        }
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-drive:</span>{' '}
                    <span className="font-medium">
                        {packageJson.dependencies['document-drive']}
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-model:</span>{' '}
                    <span className="font-medium">
                        {packageJson.dependencies['document-model']}
                    </span>
                </li>
                <li className="my-1 flex justify-between pr-1">
                    <span>document-model-libs:</span>{' '}
                    <span className="font-medium">
                        {packageJson.dependencies['document-model-libs']}
                    </span>
                </li>
            </ul>
        </Disclosure>
    );
}
