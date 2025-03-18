import Created from "../../../../powerhouse/components/icon-components/Created.js";
import DescendenceModified from "../../../../powerhouse/components/icon-components/DescendenceModified.js";
import Duplicated from "../../../../powerhouse/components/icon-components/Duplicated.js";
import Modified from "../../../../powerhouse/components/icon-components/Modified.js";
import Moved from "../../../../powerhouse/components/icon-components/Moved.js";
import Removed from "../../../../powerhouse/components/icon-components/Removed.js";
import { NodeStatus } from "../types.js";

interface StatusIconProps {
  status: NodeStatus;
  isDescendenceModified?: boolean;
}

const STATUS_ICON_MAP: Record<
  Exclude<NodeStatus, NodeStatus.UNCHANGED>,
  { icon: React.ReactNode }
> = {
  [NodeStatus.CREATED]: {
    icon: <Created height={16} width={16} className="text-green-900" />,
  },
  [NodeStatus.MODIFIED]: {
    icon: <Modified height={16} width={16} className="text-blue-900" />,
  },
  [NodeStatus.REMOVED]: {
    icon: <Removed height={16} width={16} className="text-red-900" />,
  },
  [NodeStatus.MOVED]: {
    icon: <Moved height={16} width={16} className="text-blue-900" />,
  },
  [NodeStatus.DUPLICATED]: {
    icon: <Duplicated height={16} width={16} className="text-blue-900" />,
  },
};

export const StatusIcon = ({
  status,
  isDescendenceModified,
}: StatusIconProps) => {
  if (status === NodeStatus.UNCHANGED) {
    return isDescendenceModified ? (
      <DescendenceModified height={16} width={16} className="text-gray-500" />
    ) : null;
  }

  return STATUS_ICON_MAP[status].icon;
};
