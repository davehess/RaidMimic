// The one line that says what the desktop app does about this, worded as it is TRUE today: Raid Mimic sends a player's
// PoP flags on its own (utils/hubSync.js); its automatic inventory and Quarmy upload (the agent's scanQuarmyExports ->
// /api/agent/quarmy) is accepted for Wolf Pack members' characters only, so for a Raid Mimic player the files go up here.
export default function MimicNote() {
  return (
    <p className="mt-2 text-xs text-dim">
      The Mimic app sends your PoP flags itself. Inventory and Quarmy files: upload them here.
    </p>
  );
}
