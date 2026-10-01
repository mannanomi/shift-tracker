/** The Shiftly mark: an open clock ring with a sky-blue dot, on a blue tile. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="512" height="512" rx="128" fill="#2563EB" />
      <path d="M256 106 A150 150 0 1 1 126.1 181" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" />
      <path d="M256 186 V 262 L 312 296" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="126.1" cy="181" r="34" fill="#7DD3FC" />
    </svg>
  );
}
