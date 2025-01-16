import { Icon } from "@/index";
import { Input } from "../../fragments";
import { useCallback, useRef } from "react";
import { useSidebar } from "./sidebar-provider";

export const SidebarSearch = () => {
  const { changeSearchTerm, searchTerm } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);

  const handleReset = useCallback(() => {
    changeSearchTerm("");
  }, [changeSearchTerm]);

  return (
    <div className="w-full border-t border-gray-300 p-2">
      <div className="relative">
        <Input
          value={searchTerm}
          onChange={(e) => changeSearchTerm(e.target.value)}
          placeholder="Search"
          className="w-full pl-8"
          style={{
            paddingRight: (ref.current?.clientWidth ?? 0) + 16,
          }}
        />
        <Icon
          name="Search"
          size={16}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700"
        />
        {searchTerm && (
          <div
            ref={ref}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2"
          >
            <div className="text-xs">
              <span className="text-gray-700">12</span>
              <span className="text-gray-500">/16</span>
            </div>

            <div className="flex flex-col text-gray-500">
              <div className="cursor-pointer px-1 py-0.5 hover:text-gray-700">
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* eslint-disable-next-line react/jsx-max-depth */}
                  <path
                    d="M0.266663 5.6001H7.73333L4 0.800097L0.266663 5.6001Z"
                    fill="currentcolor"
                  />
                </svg>
              </div>

              <div className="cursor-pointer px-1 py-0.5 hover:text-gray-700">
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* eslint-disable-next-line react/jsx-max-depth */}
                  <path
                    d="M0.266663 0.399902H7.73333L4 5.1999L0.266663 0.399902Z"
                    fill="currentcolor"
                  />
                </svg>
              </div>
            </div>

            <Icon
              onClick={handleReset}
              name="CrossCircle"
              size={16}
              className="cursor-pointer text-gray-500 hover:text-gray-700 active:text-gray-900"
            />
          </div>
        )}
      </div>
    </div>
  );
};
