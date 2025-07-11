import type { ColumnType } from "kysely";

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type Json = JsonValue;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [K in string]?: JsonValue;
};

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface Listener {
  block: Generated<boolean>;
  call_info: Json | null;
  filter: Json;
  label: string | null;
  listener_id: string;
  parent_id: string;
  system: Generated<boolean>;
}

export interface DB {
  listener: Listener;
}
