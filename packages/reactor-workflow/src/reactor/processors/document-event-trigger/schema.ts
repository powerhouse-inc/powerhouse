// The processor writes nothing; its namespace exists only so the host can hand
// it a relational db.
export type DB = Record<string, never>;
