'use client';
// ?v=a|b|c on the raidmimic landing swaps the whole page for a player-first draft (design lab, rm-home). No ?v=, or any
// other value, renders the children untouched: the default page. It reads the query here, not in page.tsx, which reads
// none by rule (test/raidmimic-landing-variants.test.js). page.tsx only mounts this on a beta build, so production's
// render is the children alone and never carries the drafts' markup.
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { isHomeVariant } from '@/lib/lab/fixtures/rm-home';

export default function RmHomeSwitch({ a, b, c, children }: { a: ReactNode; b: ReactNode; c: ReactNode; children: ReactNode }) {
  const v = useSearchParams()?.get('v');
  if (!isHomeVariant(v)) return <>{children}</>;
  return <>{v === 'a' ? a : v === 'b' ? b : c}</>;
}
