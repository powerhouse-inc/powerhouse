"use client";

import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Issue } from "document-models/atlas-feedback-issues";
import { ViewNode } from "@powerhousedao/mips-parser";
import {
  dispatchAddNotionIdToIssueEvent,
  dispatchCreateIssueEvent,
  dispatchRemoveNotionIdFromIssueEvent,
} from "../utils/events";

type Props = {
  viewNode: ViewNode;
  issue: Issue | null;
  issues: Issue[];
};
export function NodeOptionsCombobox(props: Props) {
  const { viewNode, issues, issue } = props;
  const [open, setOpen] = useState(false);
  const [isAddToExistingIssue, setIsAddToExistingIssue] = useState(false);
  const issuesToShow = issues.filter((i) => i.phid !== issue?.phid);
  const hasIssuesToShow = issuesToShow.length > 0;
  const triggerIcon = (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.625 2.5C8.625 3.12132 8.12132 3.625 7.5 3.625C6.87868 3.625 6.375 3.12132 6.375 2.5C6.375 1.87868 6.87868 1.375 7.5 1.375C8.12132 1.375 8.625 1.87868 8.625 2.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM7.5 13.625C8.12132 13.625 8.625 13.1213 8.625 12.5C8.625 11.8787 8.12132 11.375 7.5 11.375C6.87868 11.375 6.375 11.8787 6.375 12.5C6.375 13.1213 6.87868 13.625 7.5 13.625Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      ></path>
    </svg>
  );

  const initialIssueCommands = (
    <Command>
      <CommandList>
        <CommandGroup>
          <CommandItem
            value="create-new-issue"
            onSelect={() => {
              setIsAddToExistingIssue(false);
              setOpen(false);
              dispatchCreateIssueEvent([viewNode.slugSuffix]);
            }}
          >
            Create new issue
          </CommandItem>
          {hasIssuesToShow && (
            <CommandItem
              key="add-to-existing-issue"
              value="add-to-existing-issue"
              onSelect={() => {
                setIsAddToExistingIssue(true);
              }}
            >
              Add to existing issue
            </CommandItem>
          )}
          {!!issue && (
            <CommandItem
              key="remove-from-issue"
              value="remove-from-issue"
              onSelect={() => {
                dispatchRemoveNotionIdFromIssueEvent(
                  viewNode.slugSuffix,
                  issue.phid,
                );
                setIsAddToExistingIssue(false);
                setOpen(false);
              }}
            >
              Remove from issue
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  const addToExistingIssueCommands = (
    <Command>
      <CommandInput placeholder="Search issue..." />
      <CommandList>
        <CommandEmpty>No issue found.</CommandEmpty>
        <CommandGroup>
          {issuesToShow.map((issue, index) => (
            <CommandItem
              key={issue.phid}
              value={issue.phid}
              onSelect={(issuePhid) => {
                dispatchAddNotionIdToIssueEvent(viewNode.slugSuffix, issuePhid);
                setOpen(false);
              }}
            >
              Issue #{index + 1}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          setIsAddToExistingIssue(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button role="combobox" aria-expanded={open} className="">
          {triggerIcon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        {isAddToExistingIssue
          ? addToExistingIssueCommands
          : initialIssueCommands}
      </PopoverContent>
    </Popover>
  );
}
