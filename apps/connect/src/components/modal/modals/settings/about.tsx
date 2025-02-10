import { About as BaseAbout } from '@powerhousedao/design-system';
import packageJson from '../../../../../package.json';

export const About: React.FC = () => {
    return <BaseAbout packageJson={packageJson} />;
};
