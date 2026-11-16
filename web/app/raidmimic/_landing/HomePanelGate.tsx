'use client';
// The intro video's door on the For guild leaders page (/register), the only page it plays on now (the guild lead, 2026-11-16, card
// rm-home: "Only on the For guild leaders page"). A "Watch the 80 second story" button (or `#video` in the address) reveals the
// story stage in place; the stage's own Skip folds it away again. It began as the signed-in landing's "Rewatch the video" gate
// (2026-11-09); the landing no longer shows a video, so `panel` is gone and the label is the caller's.
import { useEffect, useState } from 'react';
import { REWATCH_HASH, SKIP_KEY } from '@/lib/raidmimicHome';
import StoryStage from './StoryStage';

export default function HomePanelGate({ label, downloadUrl, onHost }: { label: string; downloadUrl: string; onHost: boolean }) {
  const [stage, setStage] = useState(false);
  useEffect(() => {
    if (window.location.hash === REWATCH_HASH) setStage(true);
  }, []);
  // An earlier "Skip" is remembered per viewer; asking to watch outranks it, or the stage would open already folded.
  const open = () => {
    try { window.localStorage.removeItem(SKIP_KEY); } catch { /* storage blocked: nothing was remembered */ }
    setStage(true);
  };
  if (stage) return <StoryStage downloadUrl={downloadUrl} onHost={onHost} />;
  return (
    <p className="m-0">
      <button type="button" data-rewatch onClick={open} className="inline-flex min-h-11 items-center bg-transparent text-sm text-blue underline">{label}</button>
    </p>
  );
}
