export function Card({
  children,
  className = '',
  style,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Lifts on hover and presses in on tap, for cards you can click. */
  interactive?: boolean;
}) {
  return (
    <div
      style={style}
      className={`animate-fade-up rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-800/60 dark:shadow-none ${
        interactive
          ? 'transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80 active:scale-[0.99] dark:hover:border-slate-700'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
