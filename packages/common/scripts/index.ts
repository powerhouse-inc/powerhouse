import { detectSync } from 'package-manager-detector/detect';
import { resolveCommand } from 'package-manager-detector/commands';
import { AgentName } from 'package-manager-detector';
import { execSync } from 'child_process';

import pkg from '../package.json';

const packageJson = pkg as { dependencies?: Record<string, string>, devDependencies?: Record<string, string> };

const storybookPackages = [
    '@storybook/addon-essentials@^8.4.4',
    '@storybook/addon-interactions@^8.4.4',
    '@storybook/addon-links@^8.4.4',
    '@storybook/blocks@^8.4.4',
    '@storybook/components@^8.4.4',
    '@storybook/manager-api@^8.4.4',
    '@storybook/preview-api@^8.4.4',
    '@storybook/react@^8.4.4',
    '@storybook/react-vite@^8.4.4',
    '@storybook/test@^8.0.2',
    '@storybook/types@^8.4.4',
    'storybook@^8.4.4',
    'storybook-mock-date-decorator@^2.0.6',
];

const runCommand = (command: string) => {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: "inherit" });
};

const devDependencies = packageJson.devDependencies || {};
const dependencies = packageJson.dependencies || {};

if (devDependencies.storybook || dependencies.storybook) {
    console.log('Storybook already installed');
    process.exit(0);
}

const pm = detectSync();

const getAddDevOption = (pm: AgentName) => {
    return pm === 'bun' ? '-d' : '-D';
};

if (pm) {
    const result = resolveCommand(pm.agent, 'add', storybookPackages);
    if (!result) {
        console.error('Could not resolve package manager.');
        process.exit(1);
    }

    runCommand(`${result.command} ${result.args.join(' ')} ${getAddDevOption(pm.name)}`);
}