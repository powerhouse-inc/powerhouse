---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/schema.ts"
unless_exists: true
---
export interface Todo {
  status: boolean | null;
  task: string;
}

export interface DB {
  todo: Todo;
}

