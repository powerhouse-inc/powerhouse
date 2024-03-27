import {
    ConnectDropdownMenuItem,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import connectConfig from 'connect-config';

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
