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
  const comments = issue
    ? issue.comments.filter(
        (comment) => comment.notionId === viewNode.slugSuffix,
      )
    : issues
        .flatMap((i) => i.comments)
        .filter((comment) => comment.notionId === viewNode.slugSuffix);
  const commentCount = comments.length ?? 0;
  const hasComments = commentCount > 0;
  const commentIcon = (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.01042 2.66406C2.53775 2.66406 1.34375 3.85806 1.34375 5.33073V13.3307C1.34375 13.9247 2.06975 14.2301 2.48975 13.8101L4.96908 11.9974H12.0104C13.4831 11.9974 14.6771 10.8034 14.6771 9.33073V5.33073C14.6771 3.85806 13.4831 2.66406 12.0104 2.66406H4.01042ZM4.67708 5.33073H11.3437C11.7117 5.33073 12.0104 5.6294 12.0104 5.9974C12.0104 6.3654 11.7117 6.66406 11.3437 6.66406H4.67708C4.30908 6.66406 4.01042 6.3654 4.01042 5.9974C4.01042 5.6294 4.30908 5.33073 4.67708 5.33073ZM4.67708 7.9974H9.34375C9.71175 7.9974 10.0104 8.29606 10.0104 8.66406C10.0104 9.03206 9.71175 9.33073 9.34375 9.33073H4.67708C4.30908 9.33073 4.01042 9.03206 4.01042 8.66406C4.01042 8.29606 4.30908 7.9974 4.67708 7.9974Z"
        fill="currentColor"
      />
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
          {
            <span className="flex items-center gap-1">
              <span className="w-4">{commentIcon}</span>
              {hasComments && <span>{commentCount}</span>}
            </span>
          }
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
