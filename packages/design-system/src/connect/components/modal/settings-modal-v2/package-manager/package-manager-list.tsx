import { ConnectDropdownMenu } from "#connect";
import { Icon } from "#powerhouse";

import { useCallback, useState, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type PackageDetails = {
  id: string;
  name: string;
  description: string;
  category: string;
  publisher: string;
  publisherUrl: string;
  modules: string[];
  removable: boolean;
};

export type PackageManagerListProps = {
  mutable: boolean;
  packages: PackageDetails[];
  onUninstall: (id: string) => void;
  className?: string;
};

export type PackageManagerListItemProps = {
  mutable: boolean;
  package: PackageDetails;
  onUninstall: (id: string) => void;
  className?: string;
};

const PackageDetail: React.FC<{ label: string; value: ReactNode }> = ({
  label,
  value,
}) => {
  return (
    <div className="flex items-start gap-2 text-sm">
      <p className="text-gray-600">{label}:</p>
      <p className="text-gray-600">{value}</p>
    </div>
  );
};

export const PackageManagerListItem: React.FC<PackageManagerListItemProps> = (
  props,
) => {
  const {
    package: {
      name,
      description,
      category,
      publisher,
      publisherUrl,
      modules,
      id,
      removable,
    },
    mutable,
    onUninstall,
    className,
  } = props;
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  return (
    <li
      className={twMerge(
        "relative flex flex-col items-start rounded-md border border-gray-200 p-3 text-sm leading-5 shadow-sm",
        className,
      )}
    >
      <h3 className="font-semibold text-gray-900">{name}</h3>
      <PackageDetail label="Description" value={description} />
      <PackageDetail label="Category" value={category} />
      <PackageDetail label="Publisher" value={publisher} />
      <PackageDetail
        label="Publisher URL"
        value={
          <a className="underline" href={publisherUrl}>
            {publisherUrl}
          </a>
        }
      />
      <p className="text-sm text-gray-600">Modules included:</p>
      <ul className="list-disc pl-5">
        {modules.map((module) => (
          <li key={module}>
            <span className="text-gray-600">{module}</span>
          </li>
        ))}
      </ul>
      {mutable && removable && (
        <ConnectDropdownMenu
          items={[
            {
              id: "uninstall",
              label: "Uninstall",
              icon: <Icon name="Trash" />,
              className: "text-red-900",
            },
          ]}
          onItemClick={(optionId) => {
            if (optionId === "uninstall") {
              onUninstall(id);
            }
          }}
          onOpenChange={setIsDropdownMenuOpen}
          open={isDropdownMenuOpen}
        >
          <button
            className="group absolute right-3 top-3"
            onClick={(e) => {
              e.stopPropagation();
              setIsDropdownMenuOpen(true);
            }}
          >
            <Icon
              className="text-gray-600 group-hover:text-gray-900"
              name="VerticalDots"
            />
          </button>
        </ConnectDropdownMenu>
      )}
    </li>
  );
};

export const PackageManagerList: React.FC<PackageManagerListProps> = (
  props,
) => {
  const { className, packages, onUninstall, mutable, ...rest } = props;

  const handleUninstall = useCallback(
    (id: string) => {
      onUninstall(id);
    },
    [onUninstall],
  );

  return (
    <div
      {...rest}
      className={twMerge(
        "flex max-h-[370px] flex-col items-stretch overflow-hidden",
        className,
      )}
    >
      <h3 className="mb-4 font-semibold text-gray-900">Installed Packages</h3>
      <div className="flex-1 overflow-y-auto pr-2">
        <ul className="flex flex-col items-stretch gap-4 pr-2">
          {packages.map((pkg) => (
            <PackageManagerListItem
              key={pkg.id}
              package={pkg}
              onUninstall={handleUninstall}
              mutable={mutable}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};
