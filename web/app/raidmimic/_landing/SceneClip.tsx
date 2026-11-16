'use client';
// One looping, muted recording: the first screen's mascot loop and each overlay clip of "See it run" (the guild lead,
// 2026-10-22 and 2026-11-15). Both the <video> and its poster <img> are in the markup and CSS (`motion-reduce:`) picks one before
// any script runs; the effect then pauses the clip for a reduced-motion visitor, and pauses it whenever it is off screen so a
// page of clips does not keep decoders busy. Size comes from `w` / `h`, so a corrected number just works.
import { useEffect, useRef } from 'react';

export default function SceneClip({ src, poster, w, h, alt, className = '' }: {
  src: string; poster: string; w: number; h: number; alt: string; className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let still = false;
    try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* the CSS swap still applies */ }
    if (still) { v.pause(); return; }
    v.muted = true;
    const play = () => { void v.play().catch(() => { /* autoplay refused (data saver, low power): the poster stays up */ }); };
    if (typeof IntersectionObserver === 'undefined') { play(); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) { if (e.isIntersecting) play(); else v.pause(); }
    }, { threshold: 0.15 });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return (
    <>
      <video ref={ref} src={src} poster={poster} width={w} height={h}
        autoPlay muted loop playsInline preload="metadata" aria-label={alt}
        className={`block h-auto w-full motion-reduce:hidden ${className}`} />
      <img src={poster} width={w} height={h} alt={alt} decoding="async"
        className={`hidden h-auto w-full motion-reduce:block ${className}`} />
    </>
  );
}
