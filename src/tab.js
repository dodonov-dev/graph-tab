// The "Graph" item in the repository navigation bar. The markup is our own,
// but class names are copied from a sibling tab at insert time, so the tab
// matches GitHub's current styling exactly (classic UnderlineNav and the
// logged-in React nav alike) without hardcoding churn-prone class names.
// Our own CSS (.ggt-nav*) only kicks in if there is no sibling to copy from.

import { octicon } from './octicon.js';

export const TAB_ID = 'ggt-tab';

const NAV_SELECTORS = [
  'nav[aria-label="Repository"] ul',
  'ul[class*="UnderlineItemList"]',
  'nav[class*="LocalNavigation"] ul',
];

export function repoNav() {
  for (const selector of NAV_SELECTORS) {
    const nav = document.querySelector(selector);
    if (nav) return nav;
  }
  return null;
}

// GitHub renders the logged-in nav as a React island (<react-partial
// partial-name="global-nav-bar">, SSR'd then hydrated) that also contains
// the header search box. Inserting a foreign <li> before hydration makes
// React treat the whole island as a hydration mismatch: it discards the
// server DOM and re-renders client-side (data-ssr flips to "false"), which
// silently drops the server-only <qbsearch-input> internals — the search
// box then dies on first click. GitHub adds class="loaded" to the island
// once React has finished mounting (verified to land after hydration), and
// unlike React's fiber expandos a class is visible from the content-script
// world — so until it shows up, leave the nav alone (main.js retries). The
// timeout is a safety valve: if "loaded" never comes (GitHub renames it,
// React crashed on its own), a late insert is harmless and beats never
// showing the tab.
let pendingSince = 0;
function hydrationPending(nav) {
  const root = nav.closest('react-app, react-partial');
  if (!root || root.classList.contains('loaded')) {
    pendingSince = 0;
    return false;
  }
  pendingSince ||= Date.now();
  return Date.now() - pendingSince < 8000;
}

// Copy presentation classes from a sibling element, skipping GitHub's
// behavior/state classes (js-* hooks, selection, icon-specific octicons).
// Returns false when nothing was copied so the caller can fall back.
function copyClasses(source, target) {
  if (!source) return false;
  const names = [...source.classList].filter(
    (name) => !name.startsWith('js-') && !name.startsWith('octicon-') && name !== 'selected'
  );
  if (names.length === 0) return false;
  target.classList.add(...names);
  return true;
}

/** Insert the Graph tab into the repo nav if missing. Returns the anchor. */
export function ensureTab(onOpen) {
  const existing = document.getElementById(TAB_ID);
  if (existing) return existing;
  const nav = repoNav();
  if (!nav || hydrationPending(nav)) return null;

  const siblingLink = nav.querySelector('li a');
  const item = document.createElement('li');
  if (!copyClasses(siblingLink?.closest('li'), item)) item.className = 'ggt-navitem';

  const link = document.createElement('a');
  link.id = TAB_ID;
  if (!copyClasses(siblingLink, link)) link.className = 'ggt-navtab';
  link.href = '#graph';
  link.addEventListener('click', (event) => {
    // Modified clicks (new tab/window) keep the default: the relative
    // "#graph" href resolves against the current page URL, which is exactly
    // the link such a click should open.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen();
  });

  // octicon() already carries GitHub's own presentation attributes; the
  // sibling's classes go on top (copyClasses drops its octicon-* names).
  const icon = octicon('git-branch');
  copyClasses(siblingLink?.querySelector('svg'), icon);

  // Primer's current UnderlineNav styles its icon through this component
  // slot. Without the wrapper the icon inherits the link's darker color and
  // loses the native 8px gap before the label, making it look too heavy.
  const iconSlot = document.createElement('span');
  iconSlot.setAttribute('data-component', 'icon');
  iconSlot.appendChild(icon);

  // data-content lets GitHub's CSS reserve the bold width, so the tab does
  // not shift when it becomes selected; our fallback CSS mirrors the trick.
  const label = document.createElement('span');
  copyClasses(siblingLink?.querySelector('span[data-content]'), label);
  label.setAttribute('data-component', 'text');
  label.setAttribute('data-content', 'Graph');
  label.textContent = 'Graph';

  link.appendChild(iconSlot);
  link.appendChild(label);
  item.appendChild(link);
  nav.appendChild(item);
  keepInView(item);
  return link;
}

// GitHub's UnderlineNav lays its tabs out on one wrapping line and hides
// whatever wraps; its "More" menu lists only the tabs that registered
// themselves as clipped (each React item watches itself with useIsClipped).
// Our tab is not a React item, so once the window got narrow enough for it
// to wrap it was simply gone — not on the bar, not in More, and with nothing
// else overflowing there was not even a More button.
//
// So the tab keeps its place at the end while it fits, and otherwise steps
// in front of GitHub's own tabs until it does: the tabs it displaces are
// GitHub's, and they clip and move into More through GitHub's own logic.
// Re-run whenever the list changes width — window resizes, and the More
// button appearing or going away.
let navResize = null;

function keepInView(item) {
  navResize?.disconnect();
  navResize = new ResizeObserver(() => {
    if (item.isConnected) placeInView(item);
    else navResize.disconnect();
  });
  navResize.observe(item.parentElement);
  placeInView(item);
}

export function placeInView(item) {
  const list = item.parentElement;
  // GitHub's own tabs, in order, clipped ones included. Skip by role, not by
  // aria-hidden: GitHub sets aria-hidden on every tab it has clipped, and
  // only the wrap spacer is role="presentation".
  const tabs = [...list.children].filter((node) => node !== item && node.getAttribute('role') !== 'presentation');
  if (tabs.length === 0) return;
  const more = list.nextElementSibling; // UnderlineNav's More button container
  const fits = () => {
    const box = item.getBoundingClientRect();
    const line = tabs[0].getBoundingClientRect().top;
    const onFirstLine = Math.abs(box.top - line) < 1;
    if (onFirstLine && box.right <= list.getBoundingClientRect().right + 1) return true;
    // GitHub shows More only while one of its own tabs is clipped, and the
    // button takes its width from the list. If our tab is the only thing
    // that does not fit, More is about to go away and hand that room back —
    // judging by the narrowed list would leave a GitHub tab displaced into
    // More for no reason once the window has grown again.
    const moreBox = more?.getBoundingClientRect();
    if (!moreBox?.width) return false;
    if (tabs.some((tab) => Math.abs(tab.getBoundingClientRect().top - line) >= 1)) return false;
    const last = tabs.at(-1).getBoundingClientRect();
    const gap = tabs.length > 1 ? Math.max(0, tabs[1].getBoundingClientRect().left - tabs[0].getBoundingClientRect().right) : 0;
    const right = onFirstLine ? box.right : last.right + gap + box.width;
    return right <= moreBox.right + 1;
  };
  const atEnd = tabs.at(-1).nextElementSibling === item;
  if (atEnd && fits()) return; // the common case: leave the DOM alone
  // Start from the natural place so a wider window gives the tabs back.
  if (!atEnd) tabs.at(-1).after(item);
  for (let i = tabs.length - 1; i > 0 && !fits(); i--) list.insertBefore(item, tabs[i]);
}

// GitHub links we stole aria-current from, so closing the view (a hash-only
// change, which GitHub does not re-render on) can hand the selection back.
let displaced = [];

/** Mark our tab current and visually deselect GitHub's own tabs. */
export function markTabSelected() {
  const tab = document.getElementById(TAB_ID);
  if (!tab) return;
  tab.setAttribute('aria-current', 'page');
  const nav = repoNav();
  if (!nav) return;
  for (const link of nav.querySelectorAll('a[aria-current]')) {
    if (link !== tab) {
      displaced.push({ link, selected: link.classList.contains('selected') });
      link.removeAttribute('aria-current');
      link.classList.remove('selected');
    }
  }
}

/** Undo markTabSelected. No-ops for links GitHub has since re-rendered. */
export function markTabDeselected() {
  document.getElementById(TAB_ID)?.removeAttribute('aria-current');
  for (const { link, selected } of displaced) {
    if (!link.isConnected) continue;
    link.setAttribute('aria-current', 'page');
    if (selected) link.classList.add('selected');
  }
  displaced = [];
}
