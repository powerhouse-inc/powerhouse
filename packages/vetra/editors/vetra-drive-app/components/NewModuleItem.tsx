import type React from 'react';
import { AddNewIcon } from '../icons/AddNewIcon.js';

interface NewModuleItemProps {
  title: string;
  subtitle: string;
  onClick: () => void;
  className?: string;
}

export const NewModuleItem: React.FC<NewModuleItemProps> = ({
  title,
  subtitle,
  onClick,
  className = ''
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-1 w-full text-left hover:bg-zinc-200 rounded-md transition-colors bg-zinc-100 ${className}`}
    >
      <div className="flex-shrink-0">
        <AddNewIcon />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900 truncate">
          {title}
        </h3>
        <p className="text-xs text-gray-500 truncate">
          {subtitle}
        </p>
      </div>
    </button>
  );
};