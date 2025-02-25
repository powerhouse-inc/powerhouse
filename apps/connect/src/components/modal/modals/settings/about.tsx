import { useConnectConfig } from '#hooks/useConnectConfig';
import { About as BaseAbout } from '@powerhousedao/design-system';
import packageJson from '../../../../../package.json';

export const About: React.FC = () => {
    const [connectConfig] = useConnectConfig();
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
