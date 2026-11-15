// The one line that says what the desktop app does about this, worded as it is TRUE today: Raid Mimic sends a player's
// PoP flags on its own (utils/hubSync.js); its automatic inventory and Quarmy upload (the agent's scanQuarmyExports ->
// /api/agent/quarmy) is accepted for Wolf Pack members' characters only, so for a Raid Mimic player the files go up here.
export default function MimicNote() {
  return (
    <p className="mt-2 text-xs text-dim">
      Mimic, the Raid Mimic desktop app, already sends your PoP flags for you. It can send inventory and Quarmy files
      automatically too, but that works only for Wolf Pack members&rsquo; characters so far, so upload them here for now.
    </p>
  );
}
