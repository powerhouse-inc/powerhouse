import type { Meta, StoryObj } from "@storybook/react";
import DropdownExample from "./dropdown-example";
import { StorybookControlCategory } from "@/scalars/lib/storybook-arg-types";
/**
 * The `Dropdown` component system provides a flexible way to create interactive menus.
 * It follows a strict parent-child component structure where:
 * - `Dropdown` is the root container
 * - `DropdownTrigger` activates the menu
 * - `DropdownContent` wraps the menu items
 * - `DropdownItem` represents individual menu options
 *
 * Basic usage with icons:
 * ```
 * <Dropdown>
 *   <DropdownTrigger className="w-[184px]">
 *     <DownloadIcon width={16} height={16} />
 *     Export Options
 *   </DropdownTrigger>
 *   <DropdownContent>
 *     <DropdownItem>
 *       <PDFIcon width={16} height={16} />
 *       Save as PDF
 *     </DropdownItem>
 *     <DropdownItem>
 *       <CSVIcon width={16} height={16} />
 *       Export CSV
 *     </DropdownItem>
 *   </DropdownContent>
 * </Dropdown>
 * ```
 *
 * ## Component Structure Rules
 * 1. `DropdownItem` must always be wrapped in `DropdownContent`
 * 2. `DropdownContent` must be a direct child of `Dropdown`
 * 3. Icons should be placed as direct children before text content
 *
 * ## Creating Different Menu Types
 *
 * Example 1: Export Menu (from current implementation)
 * ```
 * <Dropdown>
 *   <DropdownTrigger>
 *     <DownloadFileIcon />
 *     Export Format
 *   </DropdownTrigger>
 *   <DropdownContent>
 *     <DropdownItem><ZipIcon /> ZIP Archive</DropdownItem>
 *     <DropdownItem><UBLIcon /> UBL Format</DropdownItem>
 *     <DropdownItem><PDFIcon /> PDF Document</DropdownItem>
 *   </DropdownContent>
 * </Dropdown>
 * ```
 *
 * Example 2: Settings Menu
 * ```
 * <Dropdown>
 *   <DropdownTrigger>
 *     <SettingsIcon />
 *     Configuration
 *   </DropdownTrigger>
 *   <DropdownContent>
 *     <DropdownItem><UserIcon /> Profile</DropdownItem>
 *     <DropdownItem><SecurityIcon /> Privacy</DropdownItem>
 *     <DropdownItem><NotificationIcon /> Alerts</DropdownItem>
 *   </DropdownContent>
 * </Dropdown>
 * ```
 *
 * Example 3: Navigation Menu
 * ```
 * <Dropdown>
 *   <DropdownTrigger>
 *     <MenuIcon />
 *     Quick Links
 *   </DropdownTrigger>
 *   <DropdownContent>
 *     <DropdownItem><HomeIcon /> Dashboard</DropdownItem>
 *     <DropdownItem><AnalyticsIcon /> Reports</DropdownItem>
 *     <DropdownItem><SupportIcon /> Help Center</DropdownItem>
 *   </DropdownContent>
 * </Dropdown>
 * ```
 *
 * ## Icon Implementation
 * Icons can be used in two ways:
 *
 * ** Direct SVG Import** (Recommended for custom icons):
 * ```
 * import DownloadFile from "@/assets/icon-components/DownloadFile";
 * <DropdownItem>
 *   <DownloadFile width={16} height={16} /> Download File
 * </DropdownItem>
 * ```
 *
 *
 * ** Using Icon Component** (Recommended for dynamic icons):
 * ```
 * import { Icon } from "@/powerhouse";
 * <Dropdown>
 *   <DropdownTrigger>
 *     <Icon name="DownloadFile" />
 *     Download File
 *   </DropdownTrigger>
 *   <DropdownContent>
 *     <DropdownItem>
 *       <Icon name="DownloadFile" />
 *       Download File
 *     </DropdownItem>
 *     <DropdownItem>
 *       <Icon name="Settings" />
 *       Configuration
 *     </DropdownItem>
 *   </DropdownContent>
 * </Dropdown>
 * ```
 *
 * ## Event Handling
 * `DropdownItem` component extends `HTMLDivElement` attributes. To handle click events:
 *
 * **Inline implementation:**
 * ```
 * <DropdownItem onClick={() => console.log('Item clicked')}>
 *   <SettingsIcon /> Configuration
 * </DropdownItem>
 * ```
 *
 * The component accepts all `div` element props including:
 * - `onClick`: Mouse click handler
 * - `onMouseEnter`: Hover handler
 * - `data-*`: Custom data attributes
 * - `aria-*`: Accessibility attributes
 *
 * TypeScript users get full type checking for native div element props.
 */
const meta: Meta<typeof DropdownExample> = {
  title: "Document Engineering/Simple Components/Dropdown",
  component: DropdownExample,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],

  argTypes: {
    label: {
      label: {
        control: "text",
        description: "Sets the visible label text for the input field",
        table: {
          type: { summary: "string" },
          category: StorybookControlCategory.COMPONENT_SPECIFIC,
        },
      },
    },
  },
} satisfies Meta<typeof DropdownExample>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    label: "Export as",
  },
};
