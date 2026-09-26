function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/60 ${className}`} />;
}

/** Placeholder layout shown while data loads or syncs, shaped like the Dashboard. */
export function AppSkeleton({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-6 lg:block dark:border-slate-800 dark:bg-slate-900">
        <Bone className="mb-8 h-9 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="mb-3 h-9 w-full" />
        ))}
      </div>
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] lg:ml-64 lg:max-w-6xl lg:px-10 lg:pt-10">
        <div className="flex items-center justify-between">
          <Bone className="h-9 w-40" />
          <Bone className="h-9 w-28" />
        </div>
        <Bone className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Bone className="h-28 rounded-2xl" />
          <Bone className="h-28 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Bone className="h-44 rounded-2xl" />
          <Bone className="h-44 rounded-2xl" />
        </div>
        <p className="text-center text-xs font-medium text-slate-400 dark:text-slate-500">{message}</p>
      </div>
    </div>
  );
}
