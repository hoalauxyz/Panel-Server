/**
 * Parser / serializer for PalWorldSettings.ini
 *
 * The file looks like this (OptionSettings is ONE very long line):
 *
 *   [/Script/Pal.PalGameWorldSettings]
 *   OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,...,ServerName="My Server",...)
 *
 * We never rebuild the file from scratch: unknown keys are preserved byte for
 * byte and only the managed keys are rewritten. That keeps every setting the
 * panel does not expose (and any future key Pocketpair adds) intact.
 */

const SECTION = '[/Script/Pal.PalGameWorldSettings]';
const OPTION_LINE_RE = /^(\s*OptionSettings\s*=\s*\()(.*)(\)\s*)$/;

/** Keys the panel exposes, with their type and validation rules. */
export const SCHEMA = {
  ExpRate:          { type: 'float',  min: 0.5, max: 3.0, default: 1.0 },
  PalCaptureRate:   { type: 'float',  min: 0.5, max: 3.0, default: 1.0 },
  DayTimeSpeedRate: { type: 'float',  min: 0.5, max: 3.0, default: 1.0 },
  ServerName:       { type: 'string', maxLength: 64, default: 'Palworld Server' },
  ServerPassword:   { type: 'string', maxLength: 64, default: '' },
};

export const MANAGED_KEYS = Object.keys(SCHEMA);

export class ConfigError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.name = 'ConfigError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Split `A=1,B=(x,y),C="a,b"` on commas that are at nesting depth 0 and outside
 * a quoted string. A naive raw.split(',') corrupts any ServerName that
 * contains a comma, which is the most common way this parser gets written wrong.
 */
function splitTopLevel(raw) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inQuotes) {
      current += ch;
      if (ch === '\\' && i + 1 < raw.length) {
        current += raw[i + 1]; // keep escape pairs together
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; current += ch; continue; }
    if (ch === '(') { depth += 1; current += ch; continue; }
    if (ch === ')') { depth -= 1; current += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }

    current += ch;
  }

  if (current.trim() !== '') parts.push(current);
  return parts;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function quote(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Palworld writes floats with six decimals; match that so diffs stay clean. */
function formatFloat(value) {
  return Number(value).toFixed(6);
}

/**
 * Parse the whole file into a structure that can round-trip back to text.
 * @returns {{ lines: string[], optionLineIndex: number, entries: Array<{key: string|null, raw: string}> }}
 */
export function parseIniDocument(text) {
  const lines = text.split(/\r?\n/);
  const optionLineIndex = lines.findIndex((line) => OPTION_LINE_RE.test(line));

  if (optionLineIndex === -1) {
    throw new ConfigError(
      'Không tìm thấy dòng "OptionSettings=(...)" trong file cấu hình.',
      422,
    );
  }

  const [, , body] = lines[optionLineIndex].match(OPTION_LINE_RE);

  const entries = splitTopLevel(body).map((chunk) => {
    const eq = chunk.indexOf('=');
    if (eq === -1) return { key: null, raw: chunk };
    return { key: chunk.slice(0, eq).trim(), raw: chunk.slice(eq + 1) };
  });

  return { lines, optionLineIndex, entries };
}

/**
 * Extract the managed keys as JSON for the frontend.
 * Missing keys fall back to the schema default so the UI always renders.
 */
export function toJson(text) {
  const { entries } = parseIniDocument(text);
  const found = new Map(entries.filter((e) => e.key).map((e) => [e.key, e.raw]));

  const settings = {};
  const missingKeys = [];

  for (const [key, spec] of Object.entries(SCHEMA)) {
    if (!found.has(key)) {
      missingKeys.push(key);
      settings[key] = spec.default;
      continue;
    }
    const raw = found.get(key);
    if (spec.type === 'float') {
      const num = Number.parseFloat(raw);
      settings[key] = Number.isFinite(num) ? num : spec.default;
    } else {
      settings[key] = unquote(raw);
    }
  }

  return { settings, missingKeys, totalKeys: found.size };
}

/** Validate an incoming JSON payload against SCHEMA. Throws ConfigError on bad input. */
export function validate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConfigError('Body phải là một JSON object.');
  }

  const clean = {};
  const errors = [];

  for (const [key, spec] of Object.entries(SCHEMA)) {
    if (!(key in payload)) continue; // partial updates are allowed

    const value = payload[key];

    if (spec.type === 'float') {
      const num = typeof value === 'number' ? value : Number.parseFloat(value);
      if (!Number.isFinite(num)) {
        errors.push(`${key}: phải là số.`);
      } else if (num < spec.min || num > spec.max) {
        errors.push(`${key}: phải nằm trong khoảng ${spec.min} – ${spec.max} (nhận ${num}).`);
      } else {
        clean[key] = Math.round(num * 1e6) / 1e6;
      }
      continue;
    }

    if (typeof value !== 'string') {
      errors.push(`${key}: phải là chuỗi.`);
    } else if (value.length > spec.maxLength) {
      errors.push(`${key}: tối đa ${spec.maxLength} ký tự.`);
    } else if (/[\r\n]/.test(value)) {
      errors.push(`${key}: không được chứa ký tự xuống dòng.`);
    } else {
      clean[key] = value;
    }
  }

  if (errors.length) throw new ConfigError('Dữ liệu không hợp lệ.', 422, errors);
  if (Object.keys(clean).length === 0) {
    throw new ConfigError('Không có trường hợp lệ nào để cập nhật.');
  }

  return clean;
}

/**
 * Apply validated settings onto the original file text, preserving every other
 * key, comment and line. Returns the new file content.
 */
export function applySettings(text, settings) {
  const doc = parseIniDocument(text);
  const [, prefix, , suffix] = doc.lines[doc.optionLineIndex].match(OPTION_LINE_RE);

  const seen = new Set();
  const entries = doc.entries.map((entry) => {
    if (!entry.key || !(entry.key in settings)) return entry;
    seen.add(entry.key);
    const spec = SCHEMA[entry.key];
    const raw = spec.type === 'float'
      ? formatFloat(settings[entry.key])
      : quote(settings[entry.key]);
    return { key: entry.key, raw };
  });

  // Append managed keys that were absent from the original file.
  for (const [key, value] of Object.entries(settings)) {
    if (seen.has(key)) continue;
    const spec = SCHEMA[key];
    entries.push({ key, raw: spec.type === 'float' ? formatFloat(value) : quote(value) });
  }

  const body = entries
    .map((e) => (e.key === null ? e.raw : `${e.key}=${e.raw}`))
    .join(',');

  const lines = [...doc.lines];
  lines[doc.optionLineIndex] = `${prefix}${body}${suffix}`;
  return lines.join('\n');
}

/** Minimal valid file, used when the ini does not exist yet. */
export function scaffold() {
  const body = Object.entries(SCHEMA)
    .map(([key, spec]) => `${key}=${spec.type === 'float' ? formatFloat(spec.default) : quote(spec.default)}`)
    .join(',');
  return `${SECTION}\nOptionSettings=(${body})\n`;
}
