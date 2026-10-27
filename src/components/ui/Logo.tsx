/** The Shiftly mark: a two-tone S (day and night halves) stamped into a white coin, on a blue tile. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="512" height="512" rx="128" fill="#2563EB" />
      <circle cx="256" cy="256" r="152" fill="#fff" />
      <path d="M316 184H235A36 36 0 0 0 235 256H256" fill="none" stroke="#2563EB" strokeWidth="36" strokeLinecap="round" />
      <path d="M256 256H277A36 36 0 0 1 277 328H196" fill="none" stroke="#60A5FA" strokeWidth="36" strokeLinecap="round" />
    </svg>
  );
}
