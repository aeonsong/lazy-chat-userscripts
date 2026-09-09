// ==UserScript==
// @name         ChatGPT Lazy Chat++ - Detach + Lightweight TOC
// @namespace    chatgpt-lazy
// @version      3.0.1
// @description  Memory-friendly ChatGPT long-chat virtualization with HARD PAUSE, detach mode, lightweight TOC, pinned navigation, lazy heading index, and /translate layout patch.
// @author       AlexSHamilton / local integrated modifications
// @homepageURL  https://github.com/aeonsong/lazy-chat-userscripts
// @supportURL   https://github.com/aeonsong/lazy-chat-userscripts/issues
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-end
// @grant        none
// @noframes
// @license      GPL-3.0-or-later
// ==/UserScript==

/* SPDX-License-Identifier: GPL-3.0-or-later */
/*
 * Modified 2026-09-09.
 * Derived from / inspired by:
 *   https://github.com/AlexSHamilton/chatgpt-lazy-chat-plusplus
 * TOC UX reference:
 *   https://github.com/lyw123www/GptToc
 */

(function () {
  'use strict';

  const TRANSLATE_PATH_RE = /^\/translate\/?$/i;
  const isTranslatePage = () =>
    location.hostname === 'chatgpt.com' &&
    TRANSLATE_PATH_RE.test(location.pathname);

  if (isTranslatePage()) {
    bootTranslatePageTweaks();
    return;
  }

  bootNormalCopy();
  bootIntegratedLazyChat();

  function bootNormalCopy() {
    const forceNormalCopy = (event) => {
      event.stopImmediatePropagation();
      return true;
    };

    ['copy', 'cut'].forEach((eventName) => {
      document.addEventListener(eventName, forceNormalCopy, true);
    });
  }

  function bootTranslatePageTweaks() {
    const STYLE_ID = 'cgpt-translate-layout-style';
    const ROOT_ATTR = 'data-cgpt-translate-page';
    const MARK_ATTRS = [
      'data-cgpt-translate-main',
      'data-cgpt-translate-heading',
      'data-cgpt-translate-content',
      'data-cgpt-translate-controls',
      'data-cgpt-translate-panels',
      'data-cgpt-translate-source-col',
      'data-cgpt-translate-target-col',
      'data-cgpt-translate-target-wrap',
      'data-cgpt-translate-source',
      'data-cgpt-translate-target',
      'data-cgpt-translate-actions'
    ];

    let observer = null;
    let markRaf = 0;

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;

      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html[${ROOT_ATTR}="1"] {
          --cgpt-translate-desktop-height: clamp(420px, 80dvh, 960px);
          --cgpt-translate-mobile-top: 16.5dvh;
        }
        html[${ROOT_ATTR}="1"],
        html[${ROOT_ATTR}="1"] body { min-height: 100%; }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-main] {
          width: 100% !important;
          max-width: min(1600px, 96vw) !important;
          min-height: calc(100dvh - var(--mkt-header-height, 0px)) !important;
          padding-inline: clamp(16px, 2vw, 24px) !important;
          padding-top: clamp(10px, 1.5dvh, 18px) !important;
          padding-bottom: clamp(10px, 2dvh, 22px) !important;
          gap: clamp(10px, 1.5dvh, 18px) !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-heading] {
          margin: 0 !important;
          padding-block: clamp(6px, 1.5dvh, 18px) !important;
          font-size: clamp(1.8rem, 3vw, 3rem) !important;
          line-height: 1.1 !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-content] {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          gap: clamp(12px, 1.75dvh, 20px) !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] {
          flex: 0 0 auto !important;
          gap: clamp(8px, 1.2dvh, 14px) !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] select,
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] button {
          min-height: clamp(42px, 4.75dvh, 52px) !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-panels] {
          display: flex !important;
          flex-direction: row !important;
          align-items: stretch !important;
          gap: clamp(12px, 2vw, 24px) !important;
          flex: 0 0 auto !important;
          height: var(--cgpt-translate-desktop-height) !important;
          min-height: var(--cgpt-translate-desktop-height) !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-source-col],
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-target-col] {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 0 !important;
          min-height: 0 !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-target-wrap] {
          position: relative !important;
          display: flex !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
        }
        html[${ROOT_ATTR}="1"] textarea[data-cgpt-translate-source],
        html[${ROOT_ATTR}="1"] textarea[data-cgpt-translate-target] {
          flex: 1 1 auto !important;
          width: 100% !important;
          min-height: 0 !important;
          height: 100% !important;
          max-height: none !important;
          overflow: auto !important;
          resize: none !important;
        }
        html[${ROOT_ATTR}="1"] [data-cgpt-translate-actions] { flex: 0 0 auto !important; }
        @media (max-width: 767.98px) {
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-main] {
            max-width: 100vw !important;
            padding-inline: 12px !important;
            padding-top: 8px !important;
            padding-bottom: 10px !important;
            gap: 8px !important;
          }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-heading] {
            padding-block: 2px !important;
            font-size: clamp(1rem, 5vw, 1.35rem) !important;
          }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-content] { gap: 8px !important; }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] { gap: 6px !important; }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] select,
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-controls] button {
            min-height: 36px !important;
            height: 36px !important;
            font-size: 14px !important;
          }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-panels] {
            flex: 1 1 auto !important;
            flex-direction: column !important;
            height: calc(100dvh - var(--mkt-header-height, 0px) - var(--cgpt-translate-mobile-top) - 24px) !important;
            min-height: calc(100dvh - var(--mkt-header-height, 0px) - var(--cgpt-translate-mobile-top) - 24px) !important;
            gap: 8px !important;
          }
          html[${ROOT_ATTR}="1"] [data-cgpt-translate-actions] { display: none !important; }
        }
      `;
      document.head.appendChild(style);
    }

    function commonAncestor(a, b) {
      const seen = new Set();
      let current = a;
      while (current) {
        seen.add(current);
        current = current.parentElement;
      }
      current = b;
      while (current) {
        if (seen.has(current)) return current;
        current = current.parentElement;
      }
      return null;
    }

    function childOfAncestor(node, ancestor) {
      let current = node;
      let previous = node;
      while (current && current !== ancestor) {
        previous = current;
        current = current.parentElement;
        if (current === ancestor) return previous;
      }
      return null;
    }

    function clearMarks() {
      const selector = MARK_ATTRS.map((attr) => `[${attr}]`).join(',');
      document.querySelectorAll(selector).forEach((element) => {
        MARK_ATTRS.forEach((attr) => element.removeAttribute(attr));
      });
    }

    function mark(element, attr) {
      if (element) element.setAttribute(attr, '1');
    }

    function applyMarks() {
      if (!isTranslatePage()) {
        clearMarks();
        document.documentElement.removeAttribute(ROOT_ATTR);
        return;
      }

      document.documentElement.setAttribute(ROOT_ATTR, '1');
      const main = document.querySelector('main');
      if (!main) return;

      const heading = Array.from(main.querySelectorAll('h1'))
        .find((element) => /translate/i.test(element.textContent || ''));
      const textareas = Array.from(main.querySelectorAll('textarea'));
      const source = textareas.find((element) => !(element.readOnly || element.hasAttribute('readonly')));
      const target = textareas.find((element) => element.readOnly || element.hasAttribute('readonly'));
      const controls = Array.from(main.querySelectorAll('div'))
        .find((element) => element.querySelectorAll('select').length >= 2);
      const panels = source && target ? commonAncestor(source, target) : null;
      const content = controls && panels && controls.parentElement === panels.parentElement
        ? controls.parentElement
        : panels?.parentElement || controls?.parentElement || null;
      const sourceCol = panels && source ? childOfAncestor(source, panels) : null;
      const targetCol = panels && target ? childOfAncestor(target, panels) : null;
      const targetWrap = target && targetCol && target.parentElement !== targetCol
        ? target.parentElement
        : null;
      const actions = panels?.nextElementSibling?.tagName === 'SECTION'
        ? panels.nextElementSibling
        : Array.from(main.querySelectorAll('section'))
            .find((element) => element.querySelectorAll('button').length >= 2) || null;

      if (!heading || !source || !target || !controls || !panels) return;

      clearMarks();
      mark(main, 'data-cgpt-translate-main');
      mark(heading, 'data-cgpt-translate-heading');
      mark(content, 'data-cgpt-translate-content');
      mark(controls, 'data-cgpt-translate-controls');
      mark(panels, 'data-cgpt-translate-panels');
      mark(sourceCol, 'data-cgpt-translate-source-col');
      mark(targetCol, 'data-cgpt-translate-target-col');
      mark(targetWrap, 'data-cgpt-translate-target-wrap');
      mark(source, 'data-cgpt-translate-source');
      mark(target, 'data-cgpt-translate-target');
      mark(actions, 'data-cgpt-translate-actions');
    }

    function scheduleApplyMarks() {
      cancelAnimationFrame(markRaf);
      markRaf = requestAnimationFrame(applyMarks);
    }

    function boot() {
      ensureStyle();
      scheduleApplyMarks();
      if (observer) observer.disconnect();
      observer = new MutationObserver(scheduleApplyMarks);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
    else window.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  function bootIntegratedLazyChat() {
    const BATCH = 12;
    const OBS_DEBOUNCE_MS = 400;
    const TOP_REVEAL_THRESHOLD = 100;
    const HARD_POLL_MS = 750;
    const STREAM_OFF_COOLDOWN = 800;
    const INITIAL_SETTLE_MS = 900;
    const MAX_MUTATIONS_PER_TICK = 80;
    const QUESTION_LABEL_MAX = 160;
    const HEADING_LABEL_MAX = 96;
    const MAX_HEADINGS_PER_ANSWER = 24;

    const STYLE_ID = 'cgpt-lazy-integrated-style';
    const STATUS_ID = 'cgpt-lazy-btn';
    const TOC_PANEL_ID = 'cgpt-lazy-toc-panel';
    const TOC_TOGGLE_ID = 'cgpt-lazy-toc-toggle';
    const TOC_LIST_ID = 'cgpt-lazy-toc-list';
    const TOC_SEARCH_ID = 'cgpt-lazy-toc-search';
    const TOC_COUNT_ID = 'cgpt-lazy-toc-count';

    const CURRENT_TURN_SELECTOR =
      '#thread section[data-turn="user"],#thread section[data-turn="assistant"]';
    const LEGACY_TURN_SELECTOR = [
      '[data-testid^="conversation-turn"]',
      'article[data-turn-id]',
      'article[data-turn]',
      'div[data-testid^="conversation-turn"]',
      'li[data-testid^="conversation-turn"]'
    ].join(',');
    const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
    const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';
    const USER_BUBBLE_SELECTOR = '[data-message-author-role="user"] .user-message-bubble-color';
    const STOP_BTN_SEL = [
      '#composer-submit-button[data-testid="stop-button"]',
      '[data-testid="stop-button"]',
      'button[aria-label*="stop streaming" i]',
      'button[aria-label*="stop generating" i]'
    ].join(',');

    let records = [];
    let recordByNode = new WeakMap();
    let recordByKey = new Map();
    let nextFallbackKey = 1;
    let visibleCount = BATCH;
    let expanded = false;
    const pinnedKeys = new Set();
    let selectedUserKey = null;
    let observer = null;
    let observerRoot = null;
    let scrollContainer = null;
    let scrollAttachedTo = null;
    let isStreaming = false;
    let streamOffTimer = null;
    let isRevealing = false;
    let maintenanceIdleHandle = null;
    let maintenanceTimeoutHandle = null;
    let pendingMaintenance = null;
    let suppressObserverUntil = 0;
    let conversationKey = getConversationKey();
    let tocCollapsed = false;
    let tocFilter = '';

    try {
      tocCollapsed = localStorage.getItem('cgptLazyIntegratedTocCollapsed') === '1';
    } catch {}

    function debounce(fn, wait) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    }

    function cleanText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function truncate(value, max) {
      const text = cleanText(value);
      return text.length <= max ? text : text.slice(0, max - 1) + '…';
    }

    function getConversationKey() {
      const match = location.pathname.match(/\/(?:c|share)\/([^/?#]+)/u);
      if (match?.[1]) return `conversation:${match[1]}`;
      return `page:${location.origin}${location.pathname}`;
    }

    function hasStopButton() {
      return !!document.querySelector(STOP_BTN_SEL);
    }

    function getRole(node) {
      if (!(node instanceof Element)) return '';
      const explicit = node.getAttribute('data-turn');
      if (explicit === 'user' || explicit === 'assistant') return explicit;
      const message = node.querySelector('[data-message-author-role]');
      return message?.getAttribute('data-message-author-role') || '';
    }

    function getLiveTurnNodes() {
      const current = Array.from(document.querySelectorAll(CURRENT_TURN_SELECTOR));
      if (current.length) return current;
      const legacy = Array.from(document.querySelectorAll(LEGACY_TURN_SELECTOR));
      return legacy.filter((element) => {
        let parent = element.parentElement;
        while (parent) {
          try {
            if (parent.matches && parent.matches(LEGACY_TURN_SELECTOR)) return false;
          } catch {}
          parent = parent.parentElement;
        }
        return true;
      });
    }

    function buildRecordKey(node) {
      const message = node.querySelector('[data-message-author-role]');
      const stable = node.getAttribute('data-turn-id') ||
        message?.getAttribute('data-message-id') ||
        node.getAttribute('data-testid');
      return stable ? `turn:${stable}` : `local:${nextFallbackKey++}`;
    }

    function extractUserLabel(node) {
      const content = node.querySelector(USER_BUBBLE_SELECTOR) ||
        node.querySelector(USER_MESSAGE_SELECTOR) || node;
      return truncate(content.textContent || '', QUESTION_LABEL_MAX);
    }

    function getRecordAnchor(record) {
      if (record.node?.isConnected) return record.node;
      if (record.placeholder?.isConnected) return record.placeholder;
      return null;
    }

    function sortRecordsByDocumentOrder() {
      records.sort((a, b) => {
        const anchorA = getRecordAnchor(a);
        const anchorB = getRecordAnchor(b);
        if (!anchorA && !anchorB) return a.serial - b.serial;
        if (!anchorA) return 1;
        if (!anchorB) return -1;
        if (anchorA === anchorB) return 0;
        const position = anchorA.compareDocumentPosition(anchorB);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return a.serial - b.serial;
      });
    }

    function rebuildRecordMaps() {
      recordByNode = new WeakMap();
      recordByKey = new Map();
      records.forEach((record) => {
        if (record.node) recordByNode.set(record.node, record);
        recordByKey.set(record.key, record);
      });
    }

    function resetForConversationChange() {
      records = [];
      recordByNode = new WeakMap();
      recordByKey = new Map();
      nextFallbackKey = 1;
      visibleCount = BATCH;
      expanded = false;
      pinnedKeys.clear();
      selectedUserKey = null;
      conversationKey = getConversationKey();
      renderTocList();
      updateStatus();
    }

    function syncRecords() {
      const currentConversation = getConversationKey();
      if (currentConversation !== conversationKey) resetForConversationChange();

      const liveNodes = getLiveTurnNodes();
      if (records.length && liveNodes.length && records.every((record) => !getRecordAnchor(record))) {
        records = [];
        rebuildRecordMaps();
      }

      let changed = false;
      for (const node of liveNodes) {
        let record = recordByNode.get(node);
        if (record) continue;
        const role = getRole(node);
        let key = buildRecordKey(node);
        const sameKey = recordByKey.get(key);

        if (sameKey && !getRecordAnchor(sameKey)) {
          sameKey.node = node;
          sameKey.placeholder = null;
          sameKey.role = role;
          sameKey.headingsCache = null;
          if (role === 'user') sameKey.label = extractUserLabel(node);
          recordByNode.set(node, sameKey);
          changed = true;
          continue;
        }

        if (sameKey) key = `${key}:dup:${nextFallbackKey++}`;
        record = {
          key,
          serial: nextFallbackKey++,
          node,
          placeholder: null,
          role,
          label: role === 'user' ? extractUserLabel(node) : '',
          headingsCache: null
        };
        records.push(record);
        recordByNode.set(node, record);
        recordByKey.set(key, record);
        changed = true;
      }

      const before = records.length;
      records = records.filter((record) => !!getRecordAnchor(record));
      if (records.length !== before) {
        changed = true;
        rebuildRecordMaps();
      }
      if (changed) sortRecordsByDocumentOrder();
      return changed;
    }

    function getUserEntries() {
      const entries = [];
      let questionNumber = 0;
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.role !== 'user') continue;
        questionNumber++;
        let assistant = null;
        for (let j = i + 1; j < records.length; j++) {
          if (records[j].role === 'assistant') {
            assistant = records[j];
            break;
          }
          if (records[j].role === 'user') break;
        }
        entries.push({ number: questionNumber, user: record, assistant });
      }
      return entries;
    }

    function shouldAttach(record, index) {
      if (expanded) return true;
      if (pinnedKeys.has(record.key)) return true;
      return index >= Math.max(0, records.length - visibleCount);
    }

    function attachRecord(record) {
      if (record.node?.isConnected) return false;
      if (!record.placeholder?.isConnected) return false;
      record.placeholder.replaceWith(record.node);
      record.placeholder = null;
      return true;
    }

    function detachRecord(record) {
      if (!record.node?.isConnected) return false;
      const parent = record.node.parentNode;
      if (!parent) return false;
      const placeholder = document.createComment(`cgpt-lazy:${record.key}`);
      parent.insertBefore(placeholder, record.node);
      record.node.remove();
      record.placeholder = placeholder;
      return true;
    }

    function getAttachedCount() {
      let count = 0;
      for (const record of records) if (record.node?.isConnected) count++;
      return count;
    }

    function findScrollableAncestor(node) {
      let element = node && node.parentElement;
      while (element && element !== document.documentElement) {
        const style = getComputedStyle(element);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') &&
            element.scrollHeight > element.clientHeight + 1) return element;
        element = element.parentElement;
      }
      return null;
    }

    function resolveScrollContainer() {
      const connected = records.map((record) => record.node).filter((node) => node?.isConnected);
      const probe = connected.length ? connected[connected.length - 1] : document.body;
      const next = findScrollableAncestor(probe);
      if (next === scrollContainer) return;
      try {
        if (scrollAttachedTo) scrollAttachedTo.removeEventListener('scroll', onScroll);
      } catch {}
      try { window.removeEventListener('scroll', onScroll); } catch {}
      scrollContainer = next;
      const target = scrollContainer || window;
      target.addEventListener('scroll', onScroll, { passive: true });
      scrollAttachedTo = scrollContainer || null;
    }

    function viewportTop() {
      return scrollContainer ? scrollContainer.getBoundingClientRect().top : 0;
    }

    function getScrollTop() {
      return scrollContainer
        ? scrollContainer.scrollTop
        : (window.scrollY || document.documentElement.scrollTop || 0);
    }

    function getScrollHeight() {
      if (scrollContainer) return scrollContainer.scrollHeight;
      return (document.scrollingElement || document.documentElement || document.body).scrollHeight;
    }

    function scrollToBottom() {
      const height = getScrollHeight();
      if (scrollContainer) scrollContainer.scrollTop = height;
      else window.scrollTo({ top: height, behavior: 'auto' });
    }

    function scrollByDelta(delta) {
      if (!delta) return;
      if (scrollContainer) scrollContainer.scrollTop += delta;
      else window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
    }

    function findAnchorElement() {
      const top = viewportTop();
      for (const record of records) {
        const node = record.node;
        if (!node?.isConnected) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.bottom > top + 1) return node;
      }
      return null;
    }

    function applyVirtualization(options = {}) {
      if (isStreaming) return;
      resolveScrollContainer();
      const preserveAnchor = !!options.preserveAnchor;
      const after = typeof options.after === 'function' ? options.after : null;
      const anchor = preserveAnchor ? findAnchorElement() : null;
      const viewport = viewportTop();
      const beforeTop = anchor ? anchor.getBoundingClientRect().top - viewport : null;
      const operations = [];

      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const desired = shouldAttach(record, index);
        const attached = !!record.node?.isConnected;
        if (desired && !attached) operations.push({ type: 'attach', record });
        else if (!desired && attached) operations.push({ type: 'detach', record });
      }

      if (!operations.length) {
        updateStatus();
        if (after) requestAnimationFrame(after);
        return;
      }

      suppressObserverUntil = performance.now() + 300;
      const batch = operations.slice(0, MAX_MUTATIONS_PER_TICK);
      for (const operation of batch) {
        if (operation.type === 'attach') attachRecord(operation.record);
        else detachRecord(operation.record);
      }

      if (anchor?.isConnected && beforeTop != null) {
        const afterTop = anchor.getBoundingClientRect().top - viewport;
        const delta = afterTop - beforeTop;
        if (delta) scrollByDelta(-delta);
      }

      updateStatus();
      if (operations.length > batch.length) {
        setTimeout(() => applyVirtualization({ preserveAnchor: true, after }), 0);
        return;
      }
      if (after) requestAnimationFrame(after);
    }

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        :root {
          --cgpt-lazy-bg: rgba(248,248,248,.86);
          --cgpt-lazy-bg-solid: rgba(248,248,248,.97);
          --cgpt-lazy-bg-hover: rgba(238,238,238,.96);
          --cgpt-lazy-bg-selected: rgba(225,230,242,.74);
          --cgpt-lazy-fg: rgba(0,0,0,.55);
          --cgpt-lazy-fg-strong: rgba(0,0,0,.70);
          --cgpt-lazy-fg-muted: rgba(0,0,0,.38);
          --cgpt-lazy-border: rgba(0,0,0,.08);
          --cgpt-lazy-border-hover: rgba(0,0,0,.13);
          --cgpt-lazy-shadow: 0 1px 4px rgba(0,0,0,.07);
          --cgpt-lazy-shadow-panel: 0 4px 18px rgba(0,0,0,.10);
        }
        #${STATUS_ID} {
          position: fixed !important; right: 12px !important; bottom: 12px !important;
          z-index: 2147483647 !important; display: block !important; visibility: visible !important;
          opacity: 1 !important; min-height: 31px; padding: 6px 10px !important;
          border: 1px solid var(--cgpt-lazy-border) !important; border-radius: 9px !important;
          background: var(--cgpt-lazy-bg) !important; color: var(--cgpt-lazy-fg) !important;
          font: 600 12px/18px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
          box-shadow: var(--cgpt-lazy-shadow) !important; backdrop-filter: blur(10px) saturate(120%) !important;
          -webkit-backdrop-filter: blur(10px) saturate(120%) !important; cursor: pointer !important;
          pointer-events: auto !important; user-select: none !important; -webkit-user-select: none !important;
          transition: background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease !important;
        }
        #${STATUS_ID}:hover {
          background: var(--cgpt-lazy-bg-hover) !important; color: var(--cgpt-lazy-fg-strong) !important;
          border-color: var(--cgpt-lazy-border-hover) !important; box-shadow: 0 2px 6px rgba(0,0,0,.09) !important;
        }
        #${TOC_TOGGLE_ID} {
          position: fixed; right: 12px; top: 82px; z-index: 2147483646; min-width: 42px; height: 31px;
          padding: 5px 9px; border: 1px solid var(--cgpt-lazy-border); border-radius: 9px;
          background: var(--cgpt-lazy-bg); color: var(--cgpt-lazy-fg);
          font: 600 12px/18px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          box-shadow: var(--cgpt-lazy-shadow); backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%); cursor: pointer;
        }
        #${TOC_TOGGLE_ID}:hover { background: var(--cgpt-lazy-bg-hover); color: var(--cgpt-lazy-fg-strong); border-color: var(--cgpt-lazy-border-hover); }
        #${TOC_PANEL_ID} {
          position: fixed; right: 12px; top: 124px; bottom: 56px; width: min(330px, calc(100vw - 32px));
          z-index: 2147483645; display: flex; flex-direction: column; overflow: hidden;
          border: 1px solid var(--cgpt-lazy-border); border-radius: 12px;
          background: var(--cgpt-lazy-bg-solid); color: var(--cgpt-lazy-fg);
          box-shadow: var(--cgpt-lazy-shadow-panel); backdrop-filter: blur(16px) saturate(120%);
          -webkit-backdrop-filter: blur(16px) saturate(120%);
          font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        #${TOC_PANEL_ID}[hidden] { display: none !important; }
        .cgpt-lazy-toc-header { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 9px 10px 8px; border-bottom: 1px solid var(--cgpt-lazy-border); }
        .cgpt-lazy-toc-title { flex: 1 1 auto; min-width: 0; color: var(--cgpt-lazy-fg-strong); font-size: 13px; font-weight: 650; }
        #${TOC_COUNT_ID} { flex: 0 0 auto; color: var(--cgpt-lazy-fg-muted); font-size: 11px; }
        .cgpt-lazy-toc-latest { flex: 0 0 auto; border: 1px solid var(--cgpt-lazy-border); border-radius: 7px; padding: 4px 7px; background: rgba(0,0,0,.025); color: var(--cgpt-lazy-fg); font-size: 11px; cursor: pointer; }
        .cgpt-lazy-toc-latest:hover { background: var(--cgpt-lazy-bg-hover); color: var(--cgpt-lazy-fg-strong); }
        .cgpt-lazy-toc-search-wrap { flex: 0 0 auto; padding: 8px 9px; }
        #${TOC_SEARCH_ID} { box-sizing: border-box; width: 100%; padding: 7px 9px; border: 1px solid var(--cgpt-lazy-border); border-radius: 8px; background: rgba(255,255,255,.58); color: var(--cgpt-lazy-fg-strong); outline: none; font: 12px/18px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        #${TOC_SEARCH_ID}::placeholder { color: var(--cgpt-lazy-fg-muted); }
        #${TOC_SEARCH_ID}:focus { border-color: rgba(0,0,0,.18); background: rgba(255,255,255,.86); }
        #${TOC_LIST_ID} { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 6px 8px; }
        .cgpt-lazy-toc-entry { margin: 2px 0; border-radius: 8px; }
        .cgpt-lazy-toc-entry.selected { background: var(--cgpt-lazy-bg-selected); }
        .cgpt-lazy-toc-row { display: flex; align-items: flex-start; gap: 4px; padding: 6px 5px; border-radius: 8px; }
        .cgpt-lazy-toc-row:hover { background: rgba(0,0,0,.035); }
        .cgpt-lazy-toc-jump { flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-start; gap: 7px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
        .cgpt-lazy-toc-number { flex: 0 0 auto; min-width: 22px; color: var(--cgpt-lazy-fg-muted); font-size: 10px; line-height: 17px; text-align: right; }
        .cgpt-lazy-toc-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--cgpt-lazy-fg); font-size: 12px; line-height: 17px; }
        .cgpt-lazy-toc-row:hover .cgpt-lazy-toc-text { color: var(--cgpt-lazy-fg-strong); }
        .cgpt-lazy-toc-expand { flex: 0 0 auto; width: 23px; height: 23px; margin-top: -2px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--cgpt-lazy-fg-muted); cursor: pointer; }
        .cgpt-lazy-toc-expand:hover { color: var(--cgpt-lazy-fg-strong); background: rgba(0,0,0,.05); }
        .cgpt-lazy-toc-children { margin: 0 5px 5px 36px; padding-left: 8px; border-left: 1px solid var(--cgpt-lazy-border); }
        .cgpt-lazy-toc-heading { display: block; width: 100%; padding: 4px 6px; border: 0; border-radius: 6px; background: transparent; color: var(--cgpt-lazy-fg); text-align: left; font-size: 11px; line-height: 15px; cursor: pointer; }
        .cgpt-lazy-toc-heading:hover { background: rgba(0,0,0,.04); color: var(--cgpt-lazy-fg-strong); }
        .cgpt-lazy-toc-empty { padding: 14px 10px; color: var(--cgpt-lazy-fg-muted); font-size: 11px; line-height: 16px; }
        .cgpt-lazy-target-flash { animation: cgptLazyFlash 1.05s ease-out; }
        @keyframes cgptLazyFlash { 0% { outline: 2px solid rgba(90,110,180,.40); outline-offset: 3px; } 100% { outline: 2px solid transparent; outline-offset: 5px; } }
        @media (max-width: 900px) {
          #${TOC_PANEL_ID} { width: min(300px, calc(100vw - 24px)); right: 8px; top: 116px; bottom: 52px; }
          #${TOC_TOGGLE_ID} { right: 8px; top: 76px; }
          #${STATUS_ID} { right: 8px !important; bottom: 8px !important; }
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    function ensureStatusButton() {
      ensureStyle();
      let button = document.getElementById(STATUS_ID);
      if (button) return button;
      button = document.createElement('button');
      button.id = STATUS_ID;
      button.type = 'button';
      button.textContent = 'LazyChat · starting';
      button.addEventListener('click', () => {
        if (isStreaming) return;
        if (pinnedKeys.size) {
          returnToLatest();
          return;
        }
        toggleExpanded();
      });
      document.body.appendChild(button);
      return button;
    }

    function updateStatus() {
      const button = ensureStatusButton();
      if (isStreaming) {
        button.textContent = 'LazyChat · streaming';
        return;
      }
      const total = records.length;
      if (!total) {
        button.textContent = 'LazyChat · no turns';
        return;
      }
      const attached = getAttachedCount();
      if (expanded) {
        button.textContent = `LazyChat · all ${total}`;
        return;
      }
      if (pinnedKeys.size) {
        button.textContent = `LazyChat · ${attached}/${total} · pinned`;
        return;
      }
      button.textContent = `LazyChat · ${attached}/${total}`;
    }

    function ensureTocUi() {
      ensureStyle();
      let toggle = document.getElementById(TOC_TOGGLE_ID);
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.id = TOC_TOGGLE_ID;
        toggle.type = 'button';
        toggle.textContent = 'TOC';
        toggle.title = '打开/收起对话目录';
        toggle.addEventListener('click', () => {
          tocCollapsed = !tocCollapsed;
          try {
            localStorage.setItem('cgptLazyIntegratedTocCollapsed', tocCollapsed ? '1' : '0');
          } catch {}
          applyTocCollapsedState();
        });
        document.body.appendChild(toggle);
      }

      let panel = document.getElementById(TOC_PANEL_ID);
      if (!panel) {
        panel = document.createElement('aside');
        panel.id = TOC_PANEL_ID;
        panel.innerHTML = `
          <div class="cgpt-lazy-toc-header">
            <div class="cgpt-lazy-toc-title">对话目录</div>
            <div id="${TOC_COUNT_ID}">0</div>
            <button type="button" class="cgpt-lazy-toc-latest" title="返回最新消息">最新</button>
          </div>
          <div class="cgpt-lazy-toc-search-wrap">
            <input id="${TOC_SEARCH_ID}" type="search" autocomplete="off" placeholder="搜索提问…">
          </div>
          <div id="${TOC_LIST_ID}"></div>
        `;
        document.body.appendChild(panel);
        const search = panel.querySelector(`#${TOC_SEARCH_ID}`);
        search.addEventListener('input', () => {
          tocFilter = cleanText(search.value).toLowerCase();
          renderTocList();
        });
        panel.querySelector('.cgpt-lazy-toc-latest').addEventListener('click', returnToLatest);
      }
      applyTocCollapsedState();
      return panel;
    }

    function applyTocCollapsedState() {
      const panel = document.getElementById(TOC_PANEL_ID);
      const toggle = document.getElementById(TOC_TOGGLE_ID);
      if (panel) panel.hidden = tocCollapsed;
      if (toggle) toggle.textContent = tocCollapsed ? 'TOC' : 'TOC ×';
    }

    function collectHeadings(assistantRecord) {
      if (!assistantRecord) return [];
      if (Array.isArray(assistantRecord.headingsCache)) return assistantRecord.headingsCache;
      const node = assistantRecord.node;
      if (!node) {
        assistantRecord.headingsCache = [];
        return [];
      }
      const message = node.querySelector(ASSISTANT_MESSAGE_SELECTOR) || node;
      const semantic = Array.from(message.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter((element) => !element.closest('pre,code') && !!cleanText(element.textContent))
        .slice(0, MAX_HEADINGS_PER_ANSWER)
        .map((element) => ({
          target: element,
          level: Number(element.tagName.slice(1)) || 2,
          text: truncate(element.textContent, HEADING_LABEL_MAX)
        }));
      if (semantic.length) {
        assistantRecord.headingsCache = semantic;
        return semantic;
      }

      const fallback = [];
      const candidates = Array.from(message.querySelectorAll(
        'p > strong:first-child,p > b:first-child,li > strong:first-child,li > b:first-child'
      ));
      const seen = new Set();
      for (const element of candidates) {
        if (fallback.length >= MAX_HEADINGS_PER_ANSWER) break;
        if (element.closest('pre,code')) continue;
        const text = cleanText(element.textContent).replace(/[：:]\s*$/u, '');
        if (!text || text.length > 50 || seen.has(text)) continue;
        const container = element.closest('p,li') || element;
        const whole = cleanText(container.textContent);
        if (whole.length > Math.max(100, text.length + 50)) continue;
        seen.add(text);
        fallback.push({ target: container, level: 3, text: truncate(text, HEADING_LABEL_MAX) });
      }
      assistantRecord.headingsCache = fallback;
      return fallback;
    }

    function renderTocList() {
      ensureTocUi();
      const list = document.getElementById(TOC_LIST_ID);
      const count = document.getElementById(TOC_COUNT_ID);
      if (!list || !count) return;
      const entries = getUserEntries();
      count.textContent = String(entries.length);
      const filtered = tocFilter
        ? entries.filter((entry) => (entry.user.label || `提问 ${entry.number}`).toLowerCase().includes(tocFilter))
        : entries;
      list.replaceChildren();

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'cgpt-lazy-toc-empty';
        empty.textContent = entries.length ? '没有匹配的提问。' : '当前还没有可索引的用户提问。';
        list.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      for (const entry of filtered) {
        const container = document.createElement('div');
        container.className = 'cgpt-lazy-toc-entry';
        if (selectedUserKey === entry.user.key) container.classList.add('selected');
        const row = document.createElement('div');
        row.className = 'cgpt-lazy-toc-row';
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'cgpt-lazy-toc-jump';
        jump.title = entry.user.label || `提问 ${entry.number}`;
        const number = document.createElement('span');
        number.className = 'cgpt-lazy-toc-number';
        number.textContent = String(entry.number);
        const text = document.createElement('span');
        text.className = 'cgpt-lazy-toc-text';
        text.textContent = entry.user.label || `提问 ${entry.number}`;
        jump.append(number, text);
        jump.addEventListener('click', () => navigateToEntry(entry, entry.user.node));
        row.appendChild(jump);

        if (entry.assistant) {
          const expandButton = document.createElement('button');
          expandButton.type = 'button';
          expandButton.className = 'cgpt-lazy-toc-expand';
          expandButton.textContent = '›';
          expandButton.title = '展开回答子标题';
          const children = document.createElement('div');
          children.className = 'cgpt-lazy-toc-children';
          children.hidden = true;
          let loaded = false;

          expandButton.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!loaded) {
              loaded = true;
              const headings = collectHeadings(entry.assistant);
              if (!headings.length) {
                const none = document.createElement('div');
                none.className = 'cgpt-lazy-toc-empty';
                none.style.padding = '4px 6px';
                none.textContent = '本轮无可识别子标题';
                children.appendChild(none);
              } else {
                for (const heading of headings) {
                  const button = document.createElement('button');
                  button.type = 'button';
                  button.className = 'cgpt-lazy-toc-heading';
                  const indent = Math.max(0, heading.level - 2);
                  button.style.paddingLeft = `${6 + indent * 8}px`;
                  button.textContent = heading.text;
                  button.title = heading.text;
                  button.addEventListener('click', () => navigateToEntry(entry, heading.target));
                  children.appendChild(button);
                }
              }
            }
            children.hidden = !children.hidden;
            expandButton.textContent = children.hidden ? '›' : '⌄';
          });
          row.appendChild(expandButton);
          container.append(row, children);
        } else {
          container.appendChild(row);
        }
        fragment.appendChild(container);
      }
      list.appendChild(fragment);
    }

    function flashTarget(target) {
      if (!target?.isConnected) return;
      target.classList.remove('cgpt-lazy-target-flash');
      void target.offsetWidth;
      target.classList.add('cgpt-lazy-target-flash');
      setTimeout(() => target.classList.remove('cgpt-lazy-target-flash'), 1200);
    }

    function navigateToEntry(entry, target) {
      if (isStreaming || !entry?.user) return;
      expanded = false;
      pinnedKeys.clear();
      pinnedKeys.add(entry.user.key);
      if (entry.assistant) pinnedKeys.add(entry.assistant.key);
      selectedUserKey = entry.user.key;
      renderTocList();
      applyVirtualization({
        preserveAnchor: false,
        after: () => {
          const actualTarget = target?.isConnected ? target : entry.user.node;
          if (!actualTarget?.isConnected) return;
          actualTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
          flashTarget(actualTarget);
        }
      });
    }

    function returnToLatest() {
      if (isStreaming) return;
      pinnedKeys.clear();
      selectedUserKey = null;
      expanded = false;
      visibleCount = BATCH;
      renderTocList();
      applyVirtualization({ preserveAnchor: false, after: scrollToBottom });
    }

    function revealMore() {
      if (expanded || isStreaming || isRevealing || pinnedKeys.size) return;
      const next = Math.min(records.length, visibleCount + BATCH);
      if (next <= visibleCount) return;
      isRevealing = true;
      visibleCount = next;
      applyVirtualization({ preserveAnchor: true });
      setTimeout(() => { isRevealing = false; }, 180);
    }

    const onScroll = debounce(() => {
      if (expanded || isStreaming || pinnedKeys.size) return;
      if (getScrollTop() <= TOP_REVEAL_THRESHOLD) revealMore();
    }, 80);

    function toggleExpanded() {
      if (isStreaming) return;
      if (pinnedKeys.size) {
        returnToLatest();
        return;
      }
      expanded = !expanded;
      if (expanded) {
        applyVirtualization({ preserveAnchor: true });
        return;
      }
      visibleCount = BATCH;
      applyVirtualization({ preserveAnchor: false, after: scrollToBottom });
    }

    function scheduleMaintenance(options = {}) {
      if (isStreaming) return;
      if (!pendingMaintenance) pendingMaintenance = { preserveAnchor: false, forceToc: false };
      pendingMaintenance.preserveAnchor ||= !!options.preserveAnchor;
      pendingMaintenance.forceToc ||= !!options.forceToc;
      if (maintenanceIdleHandle || maintenanceTimeoutHandle) return;

      const run = () => {
        maintenanceIdleHandle = null;
        maintenanceTimeoutHandle = null;
        const payload = pendingMaintenance || {};
        pendingMaintenance = null;
        const changed = syncRecords();
        if (changed || payload.forceToc) renderTocList();
        applyVirtualization({ preserveAnchor: !!payload.preserveAnchor });
      };

      if (typeof window.requestIdleCallback === 'function') {
        try {
          maintenanceIdleHandle = window.requestIdleCallback(run, { timeout: 100 });
          return;
        } catch {}
      }
      maintenanceTimeoutHandle = setTimeout(run, 50);
    }

    function invalidateConnectedAssistantHeadings() {
      for (const record of records) {
        if (record.role === 'assistant' && record.node?.isConnected) record.headingsCache = null;
      }
    }

    function recomputeStreaming() {
      const hard = hasStopButton();
      if (hard) {
        if (streamOffTimer) {
          clearTimeout(streamOffTimer);
          streamOffTimer = null;
        }
        if (!isStreaming) {
          isStreaming = true;
          updateStatus();
        }
        return;
      }

      if (!isStreaming || streamOffTimer) return;
      streamOffTimer = setTimeout(() => {
        isStreaming = false;
        streamOffTimer = null;
        syncRecords();
        invalidateConnectedAssistantHeadings();
        renderTocList();
        applyVirtualization({ preserveAnchor: true });
      }, STREAM_OFF_COOLDOWN);
    }

    function pickFeedRoot() {
      return document.querySelector('#thread') ||
        document.querySelector('[role="feed"]') ||
        document.querySelector('main [role="feed"]') ||
        document.querySelector('main') || document.body || document.documentElement;
    }

    function attachObserver(root) {
      if (!root) return;
      if (observer) observer.disconnect();
      observer = new MutationObserver(debounce(() => {
        if (isStreaming || performance.now() < suppressObserverUntil) return;
        scheduleMaintenance({ preserveAnchor: false });
      }, OBS_DEBOUNCE_MS));

      try {
        observer.observe(root, { childList: true, subtree: true });
        observerRoot = root;
      } catch {
        observer.observe(document.documentElement, { childList: true, subtree: true });
        observerRoot = document.documentElement;
      }
    }

    const SIDEBAR_SCOPE_SEL = [
      'nav[aria-label="Chat history"]',
      '#history',
      '[class*="sidebar-width"]'
    ].join(',');

    function isInsideSidebar(node) {
      return !!(node && node.closest && node.closest(SIDEBAR_SCOPE_SEL));
    }

    function isInternalHref(href) {
      if (!href || /^(mailto:|javascript:|data:)/i.test(href) || href.startsWith('#')) return false;
      try {
        return new URL(href, location.href).origin === location.origin;
      } catch {
        return false;
      }
    }

    function isInteractiveBeforeAnchor(target, anchor) {
      let node = target;
      const selector = [
        'button','[role="button"]','summary','input','select','textarea','label',
        '[aria-expanded]','[aria-haspopup]','[data-trailing-button]','.__menu-item-trailing-btn',
        '[data-testid*="toggle"]','[data-testid*="menu"]','[data-testid*="trailing"]'
      ].join(',');
      while (node && node !== anchor) {
        if (node.matches && node.matches(selector)) return true;
        node = node.parentElement;
      }
      return false;
    }

    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!target?.closest) return;
      const link = target.closest('a[href]');
      if (!link || !isInsideSidebar(target) || isInteractiveBeforeAnchor(target, link)) return;
      const href = link.getAttribute('href');
      if (!isInternalHref(href) || link.target === '_blank') return;
      event.preventDefault();
      location.assign(href);
    }, true);

    function boot() {
      ensureStyle();
      ensureStatusButton();
      ensureTocUi();
      syncRecords();
      renderTocList();
      updateStatus();
      attachObserver(pickFeedRoot());

      setTimeout(() => {
        if (isStreaming) return;
        syncRecords();
        renderTocList();
        applyVirtualization({ preserveAnchor: false });
      }, INITIAL_SETTLE_MS);

      setInterval(recomputeStreaming, HARD_POLL_MS);

      let remaining = 60;
      const bootstrapPoll = setInterval(() => {
        ensureStatusButton();
        ensureTocUi();
        const root = pickFeedRoot();
        if (root && root !== observerRoot) attachObserver(root);
        if (!isStreaming) {
          const changed = syncRecords();
          if (changed) renderTocList();
        }
        remaining--;
        if (remaining <= 0) clearInterval(bootstrapPoll);
      }, 500);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})();
