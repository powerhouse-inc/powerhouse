import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";

export function Tabs({ children }: { children: React.ReactNode }) {
  return (
    <Root defaultValue="Portfolio" className="flex flex-col gap-2">
      <div className="flex w-full justify-between">
        {/* <EditorUndoRedoButtons {...props} /> */}
        <List className="flex w-full gap-x-2 rounded-xl bg-slate-50 p-1 text-sm font-semibold text-gray-600 outline-none">
          {children &&
            Array.isArray(children) &&
            children.map((child) => (
              <Trigger
                className="data-[state='active']:tab-shadow ata-disabled:cursor-not-allowed 
              data-disabled:text-gray-400 flex h-7 flex-1 items-center justify-center rounded-lg transition duration-300 data-[state='active']:bg-gray-50 data-[state='active']:text-gray-900"
                key={child.props.label}
                value={child.props.label}
              >
                {child.props.label}
              </Trigger>
            ))}
        </List>
      </div>
      <div className="mt-3 rounded-md bg-white">
        {children &&
          Array.isArray(children) &&
          children.map((child) => (
            <Content value={child.props.label}>{child}</Content>
          ))}
      </div>
    </Root>
  );
}
