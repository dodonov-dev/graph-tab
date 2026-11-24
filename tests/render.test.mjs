import assert from 'node:assert/strict';
import test from 'node:test';

// render.js only touches the DOM when it renders; dates need <html lang>.
globalThis.document = { documentElement: { lang: '' } };
const { relTime, pageLocale } = await import('../src/render.js');

const old = new Date(2020, 8, 21);
const withLang = (lang, fn) => {
  document.documentElement.lang = lang;
  try { return fn(); } finally { document.documentElement.lang = ''; }
};

test('dates follow the page language, not the browser', () => {
  assert.equal(withLang('en', () => relTime(old)), 'Sep 21, 2020');
  assert.equal(withLang('zh-CN', () => relTime(old)), '2020年9月21日');
});

test('an unusable page language falls back instead of throwing', () => {
  assert.equal(withLang('', pageLocale), undefined);
  assert.equal(withLang('not a tag!', pageLocale), undefined);
  assert.doesNotThrow(() => withLang('not a tag!', () => relTime(old)));
});

test('recent dates stay relative', () => {
  assert.equal(relTime(new Date(Date.now() - 5 * 60 * 1000)), '5m');
  assert.equal(relTime(new Date(Date.now() - 3 * 86400 * 1000)), '3d');
});
