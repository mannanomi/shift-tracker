export function Card({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`animate-fade-up rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-800/60 dark:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}
