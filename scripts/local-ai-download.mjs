// Compatibility entrypoint: multi-user sync now downloads every account into
// its own data/local-ai/workspaces/<threads-user-id>/ directory.
await import("./local-ai-workspaces.mjs");
