// v421 (Ravi, 10 Nov 2026): Supabase restricted the free project (402 on every request), so the admin switch
// (maintenance_mode row) could not be read. FORCE_MAINTENANCE=1 in the server's env shows the maintenance page to
// everyone without touching the database. Remove the env var (or set it to 0) and redeploy/restart to switch it off.
export const forcedMaintenance = (): boolean => /^(1|true|on|yes)$/i.test(String(process.env.FORCE_MAINTENANCE || "").trim());
export const forcedMaintenanceMessage = (): string =>
  String(process.env.FORCE_MAINTENANCE_MESSAGE || "").trim() || "Ybex is under maintenance. We'll be back shortly — thank you for your patience!";
