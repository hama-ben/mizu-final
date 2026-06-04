---
name: Al-Shaibia stack quirks
description: Workspace lib layout quirks and the src/src generated-file split
---

## The src/src/generated problem

Both `lib/api-zod` and `lib/api-client-react` have a duplicate directory:
- `lib/<name>/src/generated/` — stale/thin files (only healthCheck in api-client)
- `lib/<name>/src/src/generated/` — the actual full generated output from Orval

**Why:** The codegen was originally run inside `src/src/` instead of `src/`, leaving a nested copy.

**How to apply:** Whenever regenerating types or client hooks, always copy the output:
```
cp lib/api-zod/src/src/generated/api.ts lib/api-zod/src/generated/api.ts
cp lib/api-zod/src/src/generated/types.ts lib/api-zod/src/generated/types.ts
cp lib/api-client-react/src/src/generated/api.ts lib/api-client-react/src/generated/api.ts
cp lib/api-client-react/src/src/generated/api.schemas.ts lib/api-client-react/src/generated/api.schemas.ts
```
The index.ts files at `src/index.ts` correctly re-export from `./generated/*`, so the copy step is all that's needed.
