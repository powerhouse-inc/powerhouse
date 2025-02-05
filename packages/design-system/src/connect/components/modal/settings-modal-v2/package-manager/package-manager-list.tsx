import React, { ComponentPropsWithoutRef, ReactNode, useCallback } from "react";
import { twMerge } from "tailwind-merge";

export type PackageDetails = {
  id: string;
  name: string;
  description: string;
  category: string;
  publisher: string;
  publisherUrl: string;
  modules: string[];
};

export type PackageManagerListProps = {
  readonly packages: PackageDetails[];
  readonly onUninstall: (id: string) => void;
} & ComponentPropsWithoutRef<"div">;

export type PackageManagerListItemProps = {
  readonly package: PackageDetails;
  readonly onUninstall: (id: string) => void;
} & ComponentPropsWithoutRef<"li">;

const PackageDetail: React.FC<{ label: string; value: ReactNode }> = ({
  label,
  value,
}) => {
  return (
    <div className="flex items-start gap-2 text-sm">
      <p className="font-medium text-gray-600">{label}:</p>
      <p className="text-gray-600">{value}</p>
    </div>
  );
};

export const PackageManagerListItem: React.FC<PackageManagerListItemProps> = (
  props,
) => {
  const {
    package: { name, description, category, publisher, publisherUrl, modules },
    onUninstall,
    className,
    ...rest
  } = props;
  return (
    <li
      {...rest}
      className={twMerge(
        "flex flex-col items-start rounded-md bg-slate-50 p-3 text-sm leading-5 shadow-sm",
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
      <p className="text-sm font-medium text-gray-600">Modules included:</p>
      <ul className="list-disc pl-5">
        {modules.map((module) => (
          <li key={module}>
            <span className="text-gray-500">{module}</span>
          </li>
        ))}
      </ul>
    </li>
  );
};

export const PackageManagerList: React.FC<PackageManagerListProps> = (
  props,
) => {
  const { className, packages, onUninstall, ...rest } = props;

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
        "flex flex-col items-stretch overflow-hidden",
        className,
      )}
    >
      <h3 className="mb-4 font-semibold text-gray-900">Installed Packages</h3>
      <div className="flex-1 overflow-y-auto">
        <ul className="flex flex-col items-stretch gap-4 pr-2">
          {packages.map((pkg) => (
            <PackageManagerListItem
              key={pkg.id}
              package={pkg}
              onUninstall={handleUninstall}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};
