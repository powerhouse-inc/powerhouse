import {
    CLOUD,
    defaultDriveOptions,
    DELETE,
    LOCAL,
    NodeDropdownMenuOption,
    PUBLIC,
    SharingType,
} from '@powerhousedao/design-system';
import connectConfig from 'connect-config';
import { ReactNode } from 'react';

// Enables debug options for the drive
const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';
const debugOptions = connectDebug
    ? [
          { id: 'remove-trigger', label: 'Remove Trigger' },
          { id: 'add-invalid-trigger', label: 'Add Invalid Trigger' },
          { id: 'add-trigger', label: 'Add Trigger' },
      ]
    : [];

const DriveSections: {
    sharingType: SharingType;
    label: ReactNode;
}[] = [
    { sharingType: PUBLIC, label: 'Public Drives' },
    { sharingType: CLOUD, label: 'Secure Cloud Drives' },
    { sharingType: LOCAL, label: 'My Local Drives' },
] as const;

const getSectionConfig = (sharingType: SharingType) => {
    return connectConfig.drives.sections[sharingType];
};

export function getOptionsForDriveSharingType(sharingType: SharingType) {
    const options = connectConfig.drives.sections[sharingType].allowDelete
        ? [...defaultDriveOptions, DELETE]
        : [...defaultDriveOptions];

    return options as NodeDropdownMenuOption[];
}

export const driveSections = DriveSections.filter(
    section => getSectionConfig(section.sharingType).enabled,
).map(section => {
    const sectionConfig = getSectionConfig(section.sharingType);

    return {
        ...section,
        disableAddDrives: !sectionConfig.allowAdd,
    };
});
