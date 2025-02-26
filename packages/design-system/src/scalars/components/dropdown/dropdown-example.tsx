/* eslint-disable react/jsx-max-depth */
import { DropdownContent, DropdownItem, Dropdown } from ".";
import ExportZip from "@/assets/icon-components/ExportZip";
import ExportUbl from "@/assets/icon-components/ExportUbl";
import ExportPdf from "@/assets/icon-components/ExportPdf";

import { DropdownTrigger } from "./subcomponents/dropdown-trigger";

import DownloadFile from "@/assets/icon-components/DownloadFile";

const DropdownExample = () => {
  return (
    <Dropdown>
      <DropdownTrigger className="w-[184px]">
        <DownloadFile width={16} height={16} />
        Export as
      </DropdownTrigger>
      <DropdownContent className="w-[184px]">
        <DropdownItem onClick={() => alert("Powerhouse Invoice")}>
          <ExportZip width={16} height={16} />
          <span>Powerhouse Invoice</span>
        </DropdownItem>
        <DropdownItem onClick={() => alert("UBL file")}>
          <ExportUbl width={16} height={16} />
          <span>UBL file</span>
        </DropdownItem>
        <DropdownItem onClick={() => alert("PDF file")}>
          <ExportPdf width={16} height={16} />
          <span>PDF file</span>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
};

export default DropdownExample;
