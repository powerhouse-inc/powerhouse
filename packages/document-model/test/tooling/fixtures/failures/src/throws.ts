/**
 * An ordinary module-evaluation failure — a missing environment variable, a
 * bad import, a typo in top-level code. It is a tooling failure, not a
 * statement about any definition, and it must not take its siblings' reports
 * down with it.
 */
throw new Error("this source cannot be imported");
