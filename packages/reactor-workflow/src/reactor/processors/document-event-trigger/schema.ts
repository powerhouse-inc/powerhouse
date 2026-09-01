export interface Todo {
  status: boolean | null;
  task: string;
}

export interface DB {
  todo: Todo;
}
