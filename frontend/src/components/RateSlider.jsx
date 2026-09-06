const PRESETS = [0.5, 1, 1.5, 2, 3];

/**
 * A 0.5x – 3.0x rate slider with a live value badge and quick presets.
 * `dirty` highlights the field when it differs from what is on disk.
 */
export default function RateSlider({
  id, label, hint, value, onChange, disabled = false, dirty = false,
  min = 0.5, max = 3, step = 0.1,
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="label mb-0">
          {label}
          {dirty && (
            <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px]
                             font-semibold text-amber-300">
              đã đổi
            </span>
          )}
        </label>
        <span className="rounded-lg bg-pal-500/15 px-2.5 py-1 font-mono text-sm
                         font-semibold text-pal-400 tabular-nums">
          {value.toFixed(1)}x
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={hint ? `${id}-hint` : undefined}
        // Paint the filled part of the track up to the current value.
        style={{
          background:
            `linear-gradient(to right, #0ea5e9 ${pct}%, rgb(255 255 255 / 0.08) ${pct}%)`,
        }}
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition
                ${value === p
                  ? 'bg-pal-500/25 text-pal-400'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
            >
              {p}x
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-slate-600">{min}x – {max}x</span>
      </div>

      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
