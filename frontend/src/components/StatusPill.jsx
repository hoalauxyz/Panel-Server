export default function StatusPill({ status, loading }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10
                       bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
        Đang kiểm tra…
      </span>
    );
  }

  const running = status?.running;
  const tone = running
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-400/30 bg-rose-500/10 text-rose-300';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5
                      text-xs font-medium ${tone}`}>
      <span className={`h-2 w-2 rounded-full ${running ? 'bg-emerald-400' : 'bg-rose-400'}`}>
        {running && (
          <span className="block h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
      </span>
      {running ? 'Đang chạy' : (status?.status || 'Không rõ')}
      <span className="font-mono opacity-60">{status?.container}</span>
    </span>
  );
}
