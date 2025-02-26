import { DropdownContent, DropdownItem, Dropdown } from ".";
import ExportZip from "@/assets/icon-components/ExportZip";
import ExportUbl from "@/assets/icon-components/ExportUbl";
import ExportPdf from "@/assets/icon-components/ExportPdf";

import { CustomTrigger } from "./subcomponents/dropdow-trigger";

import DownloadFile from "@/assets/icon-components/DownloadFile";

const DropdownExample = () => {
  return (
    <Dropdown>
      <CustomTrigger className="w-[184px]">
        <DownloadFile width={16} height={16} />
        Export as
      </CustomTrigger>
      <DropdownContent className="w-[184px]">
        <DropdownItem>
          <ExportZip width={16} height={16} />
          <span>Powerhouse Invoice</span>
        </DropdownItem>
        <DropdownItem>
          <ExportUbl width={16} height={16} />
          <span>UBL file</span>
        </DropdownItem>
        <DropdownItem>
          <ExportPdf width={16} height={16} />
          <span>PDF file</span>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
};

export default DropdownExample;
