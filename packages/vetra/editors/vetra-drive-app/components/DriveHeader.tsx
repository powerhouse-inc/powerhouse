import type React from 'react';
import { InfoIcon } from '../icons/InfoIcon.js';
import { ShareIcon } from '../icons/ShareIcon.js';
import { VetraIcon } from '../icons/VetraIcon.js';

interface DriveHeaderProps {
  onShareClick?: () => void;
}

export const DriveHeader: React.FC<DriveHeaderProps> = ({ onShareClick }) => {
  return (
    <div className="bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VetraIcon width={20} height={20} />
          <h1 className="text-lg font-semibold text-gray-900">Vetra Studio Drive</h1>
          <button className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <InfoIcon className="text-gray-500" />
          </button>
        </div>
        <button 
          onClick={onShareClick}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          <ShareIcon />
          Share Drive
        </button>
      </div>
    </div>
  );
};