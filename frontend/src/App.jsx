import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RateSlider from './components/RateSlider.jsx';
import TextField from './components/TextField.jsx';
import StatusPill from './components/StatusPill.jsx';
import Toast from './components/Toast.jsx';
import { api, ApiError } from './lib/api.js';

const RATE_FIELDS = [
  {
    key: 'ExpRate',
    label: 'Tỉ lệ kinh nghiệm (EXP)',
    hint: 'Nhân lượng EXP mà người chơi và Pal nhận được. 2.0x hợp cho server ít người, cày nhanh.',
  },
  {
    key: 'PalCaptureRate',
    label: 'Tỉ lệ bắt Pal',
    hint: 'Nhân xác suất bắt thành công. Càng cao càng dễ bắt Pal hiếm.',
  },
  {
    key: 'DayTimeSpeedRate',
    label: 'Tốc độ ban ngày',
    hint: 'Càng cao thì ban ngày trôi càng nhanh. Giảm xuống nếu muốn ngày dài hơn để xây base.',
  },
];

const EMPTY = {
  ExpRate: 1,
  PalCaptureRate: 1,
  DayTimeSpeedRate: 1,
  ServerName: '',
  ServerPassword: '',
};

export default function App() {
  const [saved, setSaved] = useState(null);     // last known state on disk
  const [draft, setDraft] = useState(EMPTY);    // what the form shows
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState(null);       // 'save' | 'restart' | null
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);

  const notify = useCallback((tone, message, details) => {
    clearTimeout(toastTimer.current);
    setToast({ tone, message, details });
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 12000 : 6000);
  }, []);

  const dirty = useMemo(() => {
    if (!saved) return {};
    return Object.fromEntries(
      Object.keys(EMPTY).map((k) => [k, saved[k] !== draft[k]]),
    );
  }, [saved, draft]);

  const hasChanges = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

  const loadConfig = useCallback(async (signal) => {
    setLoading(true);
    try {
      const data = await api.getConfig(signal);
      setSaved(data.settings);
      setDraft(data.settings);
      setMeta(data.meta);
      if (data.meta?.missingKeys?.length) {
        notify(
          'info',
          'File cấu hình thiếu một số key, panel đang hiển thị giá trị mặc định.',
          data.meta.missingKeys,
        );
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      notify('error', err.message, err.details);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadStatus = useCallback(async (signal) => {
    try {
      setStatus(await api.status(signal));
    } catch {
      setStatus(null); // header just shows "không rõ"; not worth a toast
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    loadConfig(ac.signal);
    loadStatus(ac.signal);

    const poll = setInterval(() => loadStatus(), 20_000);
    return () => { ac.abort(); clearInterval(poll); clearTimeout(toastTimer.current); };
  }, [loadConfig, loadStatus]);

  // Guard against closing the tab with unsaved slider changes.
  useEffect(() => {
    if (!hasChanges) return undefined;
    const onLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [hasChanges]);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  /** Write the ini. Returns true on success. */
  const save = async () => {
    const data = await api.saveConfig(draft);
    setSaved(data.settings);
    setDraft(data.settings);
    setMeta((m) => ({ ...m, ...data.meta }));
    return data.changed;
  };

  const handleSaveOnly = async () => {
    setBusy('save');
    try {
      const changed = await save();
      notify('success', changed
        ? 'Đã ghi cấu hình vào file .ini. Khởi động lại server để áp dụng.'
        : 'Không có thay đổi nào để ghi.');
    } catch (err) {
      notify('error', err.message, err instanceof ApiError ? err.details : undefined);
    } finally {
      setBusy(null);
    }
  };

  /**
   * The main action. The write must land before the restart, otherwise the
   * container would boot with the old ini — so these run in sequence, not in
   * parallel, and a failed write aborts the restart.
   */
  const handleSaveAndRestart = async () => {
    const ok = window.confirm(
      'Khởi động lại server sẽ ngắt kết nối tất cả người chơi đang online.\n\nTiếp tục?',
    );
    if (!ok) return;

    setBusy('restart');
    try {
      await save();
    } catch (err) {
      notify('error', `Ghi file thất bại, đã huỷ restart: ${err.message}`, err.details);
      setBusy(null);
      return;
    }

    try {
      const res = await api.restart();
      notify('success', `${res.message} Server sẽ online lại sau khoảng 30–60 giây.`);
      setStatusLoading(true);
      setTimeout(() => loadStatus(), 5_000);
    } catch (err) {
      notify('error', `Đã ghi file nhưng restart thất bại: ${err.message}`, err.details);
    } finally {
      setBusy(null);
    }
  };

  const disabled = loading || busy !== null;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">

        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Palworld <span className="text-pal-400">Server Panel</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Chỉnh cấu hình game, ghi thẳng vào <code className="font-mono text-slate-300">
                PalWorldSettings.ini
              </code> rồi khởi động lại container.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill status={status} loading={statusLoading} />
            <button
              type="button"
              className="btn-ghost !px-3 !py-1.5 !text-xs"
              disabled={disabled}
              onClick={() => { loadConfig(); loadStatus(); }}
            >
              Tải lại
            </button>
          </div>
        </header>

        {loading ? (
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="card animate-pulse space-y-4">
                <div className="h-4 w-40 rounded bg-white/10" />
                <div className="h-2 w-full rounded bg-white/5" />
                <div className="h-2 w-2/3 rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">

            <section className="card space-y-8 lg:col-span-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Tỉ lệ gameplay</h2>
                <p className="mt-1 text-sm text-slate-500">Điều chỉnh từ 0.5x đến 3.0x.</p>
              </div>

              {RATE_FIELDS.map((f) => (
                <RateSlider
                  key={f.key}
                  id={f.key}
                  label={f.label}
                  hint={f.hint}
                  value={draft[f.key]}
                  dirty={dirty[f.key]}
                  disabled={disabled}
                  onChange={set(f.key)}
                />
              ))}
            </section>

            <section className="card space-y-6 lg:col-span-2">
              <div>
                <h2 className="text-lg font-semibold text-white">Thông tin server</h2>
                <p className="mt-1 text-sm text-slate-500">Tên hiển thị trong danh sách server.</p>
              </div>

              <TextField
                id="ServerName"
                label="Tên server"
                placeholder="Palworld Việt Nam"
                hint="Hiện trong trình duyệt server của game."
                value={draft.ServerName}
                dirty={dirty.ServerName}
                disabled={disabled}
                onChange={set('ServerName')}
              />

              <TextField
                id="ServerPassword"
                label="Mật khẩu"
                secret
                placeholder="Để trống nếu server công khai"
                hint="Bỏ trống để bất kỳ ai cũng vào được."
                value={draft.ServerPassword}
                dirty={dirty.ServerPassword}
                disabled={disabled}
                onChange={set('ServerPassword')}
              />

              {meta?.path && (
                <p className="break-all border-t border-white/5 pt-4 font-mono text-[11px]
                              leading-relaxed text-slate-600">
                  {meta.path}
                </p>
              )}
            </section>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={disabled || !hasChanges}
            onClick={handleSaveAndRestart}
          >
            {busy === 'restart' ? 'Đang xử lý…' : 'Lưu & Khởi động lại Server'}
          </button>

          <button
            type="button"
            className="btn-ghost"
            disabled={disabled || !hasChanges}
            onClick={handleSaveOnly}
          >
            {busy === 'save' ? 'Đang lưu…' : 'Chỉ lưu'}
          </button>

          {hasChanges && !busy && (
            <button
              type="button"
              className="text-sm text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
              onClick={() => setDraft(saved)}
            >
              Huỷ thay đổi
            </button>
          )}

          <span className="ml-auto text-xs text-slate-500">
            {hasChanges ? 'Có thay đổi chưa lưu' : 'Đã đồng bộ với file cấu hình'}
          </span>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
