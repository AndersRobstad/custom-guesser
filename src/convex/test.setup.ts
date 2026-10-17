/// <reference types="vite/client" />
// Module map for convex-test (functions live in src/convex/ via convex.json).
// Convex itself skips files with more than one dot, like this one and *.test.ts.
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.test.ts', '!./test.setup.ts']);
