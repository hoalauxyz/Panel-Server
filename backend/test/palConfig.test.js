import assert from 'node:assert/strict';
import test from 'node:test';
import { applySettings, toJson, validate, ConfigError } from '../src/services/palConfig.js';

const SAMPLE = [
  '[/Script/Pal.PalGameWorldSettings]',
  'OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,NightTimeSpeedRate=1.000000,'
    + 'ExpRate=1.000000,PalCaptureRate=1.000000,BaseCampWorkerMaxNum=15,'
    + 'ServerName="Default Palworld Server",ServerPassword="",bIsPvP=False)',
  '',
].join('\n');

test('parses the managed keys into JSON', () => {
  const { settings, missingKeys } = toJson(SAMPLE);
  assert.deepEqual(settings, {
    ExpRate: 1,
    PalCaptureRate: 1,
    DayTimeSpeedRate: 1,
    ServerName: 'Default Palworld Server',
    ServerPassword: '',
  });
  assert.deepEqual(missingKeys, []);
});

test('a comma inside ServerName does not split the entry', () => {
  const text = SAMPLE.replace('"Default Palworld Server"', '"Hello, World"');
  assert.equal(toJson(text).settings.ServerName, 'Hello, World');
  assert.equal(toJson(text).totalKeys, toJson(SAMPLE).totalKeys);
});

test('writes floats with six decimals and preserves unmanaged keys', () => {
  const out = applySettings(SAMPLE, validate({ ExpRate: 2.5, PalCaptureRate: 3 }));
  assert.match(out, /ExpRate=2\.500000/);
  assert.match(out, /PalCaptureRate=3\.000000/);
  assert.match(out, /BaseCampWorkerMaxNum=15/);
  assert.match(out, /bIsPvP=False/);
  assert.match(out, /Difficulty=None/);
});

test('round-trips a name containing quotes and commas', () => {
  const name = 'My, "Cool" Server';
  const out = applySettings(SAMPLE, validate({ ServerName: name }));
  assert.equal(toJson(out).settings.ServerName, name);
});

test('rejects rates outside 0.5 - 3.0', () => {
  assert.throws(() => validate({ ExpRate: 9 }), (e) => e instanceof ConfigError && e.status === 422);
  assert.throws(() => validate({ ExpRate: 0.1 }), ConfigError);
  assert.doesNotThrow(() => validate({ ExpRate: 0.5 }));
  assert.doesNotThrow(() => validate({ ExpRate: 3 }));
});

test('rejects newline injection into string fields', () => {
  assert.throws(() => validate({ ServerName: 'evil\nOptionSettings=(x)' }), ConfigError);
});

test('ignores unknown keys in the payload', () => {
  assert.throws(() => validate({ Nope: 1 }), ConfigError);
  assert.deepEqual(validate({ Nope: 1, ExpRate: 2 }), { ExpRate: 2 });
});

test('appends a managed key that is missing from the file', () => {
  const text = '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty=None)\n';
  assert.deepEqual(toJson(text).missingKeys.sort(), [
    'DayTimeSpeedRate', 'ExpRate', 'PalCaptureRate', 'ServerName', 'ServerPassword',
  ]);
  const out = applySettings(text, validate({ ExpRate: 2 }));
  assert.match(out, /Difficulty=None,ExpRate=2\.000000/);
});

test('throws a 422 when the OptionSettings line is absent', () => {
  assert.throws(() => toJson('[/Script/Pal.PalGameWorldSettings]\n'), (e) => e.status === 422);
});
