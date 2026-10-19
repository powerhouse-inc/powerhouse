// Icons the shell, sidebar, home and drive views show at first render; the rest load lazily.
import type { IconComponentProps } from "#design-system";
import ArrowCouterclockwise from "../icon-components/ArrowCouterclockwise.js";
import ArrowLeft from "../icon-components/ArrowLeft.js";
import BrickGlobe from "../icon-components/BrickGlobe.js";
import CaretDown from "../icon-components/CaretDown.js";
import CaretRight from "../icon-components/CaretRight.js";
import CheckCircleFill from "../icon-components/CheckCircleFill.js";
import ChevronDown from "../icon-components/ChevronDown.js";
import CloudSlash from "../icon-components/CloudSlash.js";
import ConnectSmall from "../icon-components/ConnectSmall.js";
import Drive from "../icon-components/Drive.js";
import File from "../icon-components/File.js";
import FolderClose from "../icon-components/FolderClose.js";
import FolderOpen from "../icon-components/FolderOpen.js";
import Hdd from "../icon-components/Hdd.js";
import History from "../icon-components/History.js";
import Plus from "../icon-components/Plus.js";
import PlusSquare from "../icon-components/PlusSquare.js";
import PowerhouseLogoSmall from "../icon-components/PowerhouseLogoSmall.js";
import Synced from "../icon-components/Synced.js";
import Syncing from "../icon-components/Syncing.js";
import VerticalDots from "../icon-components/VerticalDots.js";
import XmarkLight from "../icon-components/XmarkLight.js";
import type { IconName } from "../icon-components/types.js";

export const criticalIcons: Partial<
  Record<IconName, (props: IconComponentProps) => React.JSX.Element>
> = {
  ArrowCouterclockwise,
  ArrowLeft,
  BrickGlobe,
  CaretDown,
  CaretRight,
  CheckCircleFill,
  ChevronDown,
  CloudSlash,
  ConnectSmall,
  Drive,
  File,
  FolderClose,
  FolderOpen,
  Hdd,
  History,
  Plus,
  PlusSquare,
  PowerhouseLogoSmall,
  Synced,
  Syncing,
  VerticalDots,
  XmarkLight,
};
