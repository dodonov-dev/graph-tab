import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/tab.js', import.meta.url), 'utf8');
// The icon's presentation attributes live in octicon.js, which builds every
// Octicon in the extension; tab.js only asks for one and lets GitHub's own
// sibling classes land on top.
const octicon = await readFile(new URL('../src/octicon.js', import.meta.url), 'utf8');

test('Graph tab uses Primer icon and text component slots', () => {
  assert.match(source, /iconSlot\.setAttribute\('data-component', 'icon'\)/);
  assert.match(source, /label\.setAttribute\('data-component', 'text'\)/);
  assert.match(source, /const icon = octicon\('git-branch'\)/);
  assert.match(source, /copyClasses\(siblingLink\?\.querySelector\('svg'\), icon\)/);
  assert.match(source, /link\.appendChild\(iconSlot\);\s+link\.appendChild\(label\);/);
});

test('Graph icon keeps the native Octicon presentation attributes', () => {
  assert.match(octicon, /setAttribute\('data-component', 'Octicon'\)/);
  assert.match(octicon, /setAttribute\('fill', 'currentColor'\)/);
  assert.match(octicon, /setAttribute\('focusable', 'false'\)/);
  assert.match(octicon, /setAttribute\('style', 'vertical-align:text-bottom'\)/);
});

// A wrapping one-line flex list, laid out the way GitHub's UnderlineNav is:
// items flow left to right with a gap, and whatever does not fit drops to
// the next line. `more` is the width of GitHub's More button, which takes
// that much room from the list while it shows; it shows once settle() has
// seen one of GitHub's tabs clipped, as GitHub's own observers would.
function fakeNav(width, tabWidths, graphWidth, { gap = 0, more = 0 } = {}) {
  const list = { children: [] };
  let moreShown = false;
  const listRight = () => width - (moreShown ? more : 0);
  const layout = () => {
    let x = 0;
    let line = 0;
    for (const node of list.children) {
      if (node.hidden) continue;
      if (x > 0 && x + gap + node.width > listRight()) { line += 1; x = 0; }
      const left = x > 0 ? x + gap : 0;
      node.box = { top: line * 40, left, right: left + node.width, width: node.width };
      x = left + node.width;
    }
  };
  // The spacer is role="presentation"; GitHub also marks each tab it has
  // clipped aria-hidden, which must not make it any less of a tab.
  const node = (name, w, hidden = false) => ({
    name, width: w, hidden, parentElement: list,
    getAttribute(key) {
      if (key === 'role') return hidden ? 'presentation' : null;
      if (key === 'aria-hidden') return hidden || this.box?.top > 0 ? 'true' : null;
      return null;
    },
    getBoundingClientRect() { layout(); return this.box ?? { top: -1, left: 0, right: 0 }; },
    get nextElementSibling() { return list.children[list.children.indexOf(this) + 1] ?? null; },
    after(other) { list.insertBefore(other, this.nextElementSibling); },
  });
  list.insertBefore = (moved, before) => {
    list.children.splice(list.children.indexOf(moved), 1);
    list.children.splice(before ? list.children.indexOf(before) : list.children.length, 0, moved);
  };
  list.getBoundingClientRect = () => ({ right: listRight() });
  list.nextElementSibling = {
    getBoundingClientRect: () => ({ right: width, width: moreShown ? more : 0 }),
  };
  list.children.push(node('spacer', 0, true));
  for (const [i, w] of tabWidths.entries()) list.children.push(node(`t${i}`, w));
  const graph = node('graph', graphWidth);
  list.children.push(graph);
  return {
    graph,
    resize: (w) => { width = w; },
    settle: () => {
      layout();
      moreShown = more > 0 && list.children.some((n) => n !== graph && !n.hidden && n.box.top > 0);
    },
    order: () => list.children.filter((n) => !n.hidden).map((n) => n.name),
  };
}

const { placeInView } = await import('../src/tab.js');

test('Graph tab stays last while it fits', () => {
  const nav = fakeNav(500, [100, 100, 100], 80, { gap: 8 });
  placeInView(nav.graph);
  assert.deepEqual(nav.order(), ['t0', 't1', 't2', 'graph']);
});

test("Graph tab steps in front of GitHub's tabs instead of wrapping out of sight", () => {
  const nav = fakeNav(320, [100, 100, 100], 80);
  placeInView(nav.graph);
  // t2 is the one that wraps now, and GitHub moves it into More itself.
  assert.deepEqual(nav.order(), ['t0', 't1', 'graph', 't2']);
  assert.equal(nav.graph.getBoundingClientRect().top, 0);
});

test('a wider nav gives the displaced tabs their place back', () => {
  const nav = fakeNav(220, [100, 100, 100], 80);
  placeInView(nav.graph);
  assert.deepEqual(nav.order(), ['t0', 'graph', 't1', 't2']);
  nav.resize(1000);
  placeInView(nav.graph);
  assert.deepEqual(nav.order(), ['t0', 't1', 't2', 'graph']);
});

test('room the More button is about to give back counts as room', () => {
  const nav = fakeNav(700, [290, 290, 290], 80, { gap: 8, more: 60 });
  placeInView(nav.graph);
  nav.settle(); // a GitHub tab is clipped, so More shows
  nav.resize(1000);
  // With More still showing the list ends at 940, short of the 974 the
  // graph tab needs; but GitHub's tabs alone fit, so More is about to go.
  placeInView(nav.graph);
  assert.deepEqual(nav.order(), ['t0', 't1', 't2', 'graph']);
  nav.settle();
  placeInView(nav.graph);
  assert.equal(nav.graph.getBoundingClientRect().top, 0);
});
