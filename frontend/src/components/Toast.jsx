const TONES = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  info: 'border-pal-400/30 bg-pal-500/10 text-pal-200',
};

const ICONS = { success: '✓', error: '!', info: 'i' };

export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:right-6 sm:w-[26rem]"
    >
      <div className={`flex items-start gap-3 rounded-2xl border p-4 shadow-2xl
                       backdrop-blur ${TONES[toast.tone] || TONES.info}`}>
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center
                         rounded-full bg-current/20 text-xs font-bold">
          {ICONS[toast.tone] || ICONS.info}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{toast.message}</p>
          {toast.details?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs opacity-80">
              {toast.details.map((d) => <li key={d}>• {d}</li>)}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng thông báo"
          className="shrink-0 rounded-lg px-2 text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
