/* eslint-disable react/jsx-max-depth */
import DownloadFile from "../../../powerhouse/components/icon-components/DownloadFile.js";
import ExportPdf from "../../../powerhouse/components/icon-components/ExportPdf.js";
import ExportUbl from "../../../powerhouse/components/icon-components/ExportUbl.js";
import ExportZip from "../../../powerhouse/components/icon-components/ExportZip.js";
import { Dropdown, DropdownContent, DropdownItem } from "./index.js";
import { DropdownTrigger } from "./subcomponents/dropdown-trigger.js";

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
