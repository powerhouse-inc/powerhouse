import { Meta, StoryObj } from '@storybook/react';
import { DependencyVersions } from './dependency-versions';
import mockPackageJson from './mock-package-json.json';

const meta = {
    title: 'Connect/Components/Dependency Versions',
    component: DependencyVersions,
} satisfies Meta<typeof DependencyVersions>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    decorators: [
        Story => (
            <div className="w-[320px]">
                <Story />
            </div>
        ),
    ],
    args: {
        packageJson: mockPackageJson,
    },
};
