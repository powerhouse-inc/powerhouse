import { useConfig } from '@powerhousedao/common';
import { About as BaseAbout } from '@powerhousedao/design-system';
import packageJson from '../../../../../package.json' with { type: 'json' };

export const About: React.FC = () => {
    const connectConfig = useConfig();
    return (
        <BaseAbout
            packageJson={packageJson}
            phCliVersion={
                typeof connectConfig.phCliVersion === 'string'
                    ? connectConfig.phCliVersion
                    : undefined
            }
        />
    );
};
