import { useState } from 'react';

export default function TextField({
  id, label, hint, value, onChange, disabled = false, dirty = false,
  placeholder, maxLength = 64, secret = false,
}) {
  const [revealed, setRevealed] = useState(false);
  const over = value.length > maxLength;

  return (
    <div className="space-y-2">
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
        <span className={`font-mono text-[11px] tabular-nums
                          ${over ? 'text-rose-400' : 'text-slate-600'}`}>
          {value.length}/{maxLength}
        </span>
      </div>

      <div className="relative">
        <input
          id={id}
          type={secret && !revealed ? 'password' : 'text'}
          className={`input ${secret ? 'pr-20' : ''} ${over ? 'border-rose-500/60' : ''}`}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete={secret ? 'new-password' : 'off'}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1
                       text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            {revealed ? 'Ẩn' : 'Hiện'}
          </button>
        )}
      </div>

      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
