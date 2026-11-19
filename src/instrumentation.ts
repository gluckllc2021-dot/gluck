export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureInitialAdmin } = await import("./lib/initial-admin");
    await ensureInitialAdmin();
    const { startSyncLoop } = await import("./lib/sheet-sync");
    startSyncLoop();
  }
}
