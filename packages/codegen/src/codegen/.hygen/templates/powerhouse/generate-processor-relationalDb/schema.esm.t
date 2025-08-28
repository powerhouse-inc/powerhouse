---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/schema.ts"
force: true
---
export interface Todo {
  status: boolean | null;
  task: string;
}

export interface DB {
  todo: Todo;
}

