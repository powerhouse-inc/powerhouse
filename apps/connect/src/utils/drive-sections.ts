import {
    ConnectDropdownMenuItem,
    defaultDropdownMenuOptions as defOptions,
} from '@powerhousedao/design-system';
import connectConfig from 'connect-config';

// Enables debug options for the drive
const connectDebug = localStorage.getItem('CONNECT_DEBUG') === 'true';
const debugOptions = connectDebug
    ? [
          { id: 'remove-trigger', label: 'Remove Trigger' },
          { id: 'add-invalid-trigger', label: 'Add Invalid Trigger' },
          { id: 'add-trigger', label: 'Add Trigger' },
      ]
    : [];

const defaultDropdownMenuOptions = [...defOptions, ...debugOptions];

type DriveSectionKey = 'public' | 'cloud' | 'local';

const DriveSections = [
    { key: 'public', name: 'Public Drives', type: 'PUBLIC_DRIVE' },
    { key: 'cloud', name: 'Secure Cloud Drives', type: 'CLOUD_DRIVE' },
    { key: 'local', name: 'My Local Drives', type: 'LOCAL_DRIVE' },
] as const;

const getSectionConfig = (key: DriveSectionKey) => {
    return connectConfig.drives.sections[key];
};

const getDriveOptions = (driveType: DriveSectionKey) => {
    const options = connectConfig.drives.sections[driveType].allowDelete
        ? defaultDropdownMenuOptions
        : defaultDropdownMenuOptions.filter(option => option.id !== 'delete');

    return options as ConnectDropdownMenuItem[];
};

export const driveSections = DriveSections.filter(
    section => getSectionConfig(section.key).enabled,
).map(section => {
    const sectionConfig = getSectionConfig(section.key);

    return {
        ...section,
        disableAddDrives: !sectionConfig.allowAdd,
        defaultItemOptions: getDriveOptions(section.key),
    };
});
