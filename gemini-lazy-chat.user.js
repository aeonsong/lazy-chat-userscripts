// ==UserScript==
// @name         Gemini Lazy Chat++ - Lightweight TOC + Conditional Detach
// @namespace    gemini-lazy-chat
// @version      1.0.0
// @description  Lightweight Gemini conversation TOC with HARD PAUSE during generation and conservative conditional detach for long chats. No token scanning, no network access.
// @author       Local adaptation
// @homepageURL  https://github.com/aeonsong/lazy-chat-userscripts
// @supportURL   https://github.com/aeonsong/lazy-chat-userscripts/issues
// @match        https://gemini.google.com/*
// @run-at       document-end
// @grant        none
// @noframes
// @license      GPL-3.0-or-later
// ==/UserScript==

/* SPDX-License-Identifier: GPL-3.0-or-later */
/*
 * Vibe-coded adaptation, 2026-09-09.
 * Architecture references:
 *   https://github.com/AlexSHamilton/chatgpt-lazy-chat-plusplus
 * TOC UX reference:
 *   https://github.com/lyw123www/GptToc
 */

(function () {
  'use strict';

  const ENABLE_DETACH = true;
  const DETACH_AFTER_TURNS = 40;
  const BATCH = 16;
  const OBS_DEBOUNCE_MS = 500;
  const STREAM_POLL_MS = 700;
  const STREAM_OFF_COOLDOWN_MS = 1000;
  const ROUTE_POLL_MS = 2000;
  const TOP_REVEAL_THRESHOLD = 100;
  const INITIAL_SETTLE_MS = 1200;
  const MAX_MUTATIONS_PER_TICK = 40;
  const QUESTION_LABEL_MAX = 160;
  const HEADING_LABEL_MAX = 96;
  const MAX_HEADINGS_PER_ANSWER = 24;

  const STYLE_ID = 'gemini-lazy-style';
  const STATUS_ID = 'gemini-lazy-status';
  const TOC_TOGGLE_ID = 'gemini-lazy-toc-toggle';
  const TOC_PANEL_ID = 'gemini-lazy-toc-panel';
  const TOC_LIST_ID = 'gemini-lazy-toc-list';
  const TOC_SEARCH_ID = 'gemini-lazy-toc-search';
  const TOC_COUNT_ID = 'gemini-lazy-toc-count';

  const PRIMARY_TURN_SELECTOR = 'user-query, model-response';
  const FALLBACK_USER_SELECTOR = [
    '.user-query',
    '[data-test-id="user-query"]',
    '[data-testid="user-query"]'
  ].join(',');
  const FALLBACK_ASSISTANT_SELECTOR = [
    '.model-response',
    '[data-test-id="model-response"]',
    '[data-testid="model-response"]'
  ].join(',');
  const STOP_BUTTON_SELECTOR = [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="stop" i]'
  ].join(',');

  let records = [];
  let recordByNode = new WeakMap();
  let nextRecordId = 1;
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
    tocCollapsed = localStorage.getItem('geminiLazyTocCollapsed') === '1';
  } catch {}

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(value, max) {
    const text = cleanText(value);
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
  }

  function getConversationKey() {
    const match = location.pathname.match(/\/app\/([^/?#]+)/u);
    if (match?.[1]) return `app:${match[1]}`;
    return `${location.pathname}${location.search}`;
  }

  function detectStreamingNow() {
    if (document.querySelector(STOP_BUTTON_SELECTOR)) return true;
    const responses = document.querySelectorAll('model-response');
    if (!responses.length) return false;
    const last = responses[responses.length - 1];
    if (last.getAttribute('aria-busy') === 'true') return true;
    return !!last.querySelector('[aria-busy="true"]');
  }

  function enterStreaming() {
    if (streamOffTimer) {
      clearTimeout(streamOffTimer);
      streamOffTimer = null;
    }
    if (!isStreaming) {
      isStreaming = true;
      updateStatus();
    }
  }

  function refreshStreamingState() {
    if (detectStreamingNow()) {
      enterStreaming();
      return;
    }
    if (!isStreaming || streamOffTimer) return;
    streamOffTimer = setTimeout(() => {
      if (detectStreamingNow()) {
        streamOffTimer = null;
        enterStreaming();
        return;
      }
      isStreaming = false;
      streamOffTimer = null;
      syncRecords();
      invalidateConnectedHeadings();
      renderTocList();
      applyVirtualization({ preserveAnchor: true });
    }, STREAM_OFF_COOLDOWN_MS);
  }

  function getLiveTurnNodes() {
    const primary = Array.from(document.querySelectorAll(PRIMARY_TURN_SELECTOR));
    if (primary.length) return primary;
    const fallback = Array.from(document.querySelectorAll(
      [FALLBACK_USER_SELECTOR, FALLBACK_ASSISTANT_SELECTOR].join(',')
    ));
    return fallback.filter((node) => !fallback.some((other) => other !== node && other.contains(node)));
  }

  function getRole(node) {
    if (!(node instanceof Element)) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'user-query') return 'user';
    if (tag === 'model-response') return 'assistant';
    if (node.matches(FALLBACK_USER_SELECTOR)) return 'user';
    if (node.matches(FALLBACK_ASSISTANT_SELECTOR)) return 'assistant';
    return '';
  }

  function extractUserLabel(node) {
    const content = node.querySelector('.query-text') ||
      node.querySelector('[class*="query-text"]') || node;
    return truncate(content.textContent || '', QUESTION_LABEL_MAX);
  }

  function getRecordAnchor(record) {
    if (record.node?.isConnected) return record.node;
    if (record.placeholder?.isConnected) return record.placeholder;
    return null;
  }

  function rebuildRecordMap() {
    recordByNode = new WeakMap();
    for (const record of records) if (record.node) recordByNode.set(record.node, record);
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

  function resetConversationState() {
    records = [];
    recordByNode = new WeakMap();
    nextRecordId = 1;
    visibleCount = BATCH;
    expanded = false;
    pinnedKeys.clear();
    selectedUserKey = null;
    conversationKey = getConversationKey();
    renderTocList();
    updateStatus();
  }

  function syncRecords() {
    const currentKey = getConversationKey();
    if (currentKey !== conversationKey) resetConversationState();

    const before = records.length;
    records = records.filter((record) => !!getRecordAnchor(record));
    if (records.length !== before) rebuildRecordMap();

    const liveNodes = getLiveTurnNodes();
    let changed = records.length !== before;

    for (const node of liveNodes) {
      if (recordByNode.has(node)) continue;
      const role = getRole(node);
      if (role !== 'user' && role !== 'assistant') continue;
      const id = nextRecordId++;
      const record = {
        key: `gemini-turn:${id}`,
        serial: id,
        node,
        placeholder: null,
        role,
        label: role === 'user' ? extractUserLabel(node) : '',
        headingsCache: null
      };
      records.push(record);
      recordByNode.set(node, record);
      changed = true;
    }

    if (changed) sortRecordsByDocumentOrder();
    return changed;
  }

  function getUserEntries() {
    const entries = [];
    let number = 0;
    for (let i = 0; i < records.length; i++) {
      const user = records[i];
      if (user.role !== 'user') continue;
      number++;
      let assistant = null;
      for (let j = i + 1; j < records.length; j++) {
        if (records[j].role === 'assistant') {
          assistant = records[j];
          break;
        }
        if (records[j].role === 'user') break;
      }
      entries.push({ number, user, assistant });
    }
    return entries;
  }

  function detachPolicyActive() {
    return ENABLE_DETACH && records.length >= DETACH_AFTER_TURNS;
  }

  function shouldAttach(record, index) {
    if (!detachPolicyActive()) return true;
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
    const placeholder = document.createComment(`gemini-lazy:${record.key}`);
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
    if (isStreaming || detectStreamingNow()) {
      enterStreaming();
      return;
    }

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

    suppressObserverUntil = performance.now() + 450;
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
        --gem-lazy-bg: rgba(248,248,248,.88);
        --gem-lazy-bg-solid: rgba(248,248,248,.97);
        --gem-lazy-hover: rgba(238,238,238,.97);
        --gem-lazy-selected: rgba(224,231,244,.78);
        --gem-lazy-fg: rgba(0,0,0,.55);
        --gem-lazy-fg-strong: rgba(0,0,0,.72);
        --gem-lazy-muted: rgba(0,0,0,.38);
        --gem-lazy-border: rgba(0,0,0,.08);
        --gem-lazy-border-hover: rgba(0,0,0,.14);
        --gem-lazy-shadow: 0 1px 4px rgba(0,0,0,.07);
        --gem-lazy-shadow-panel: 0 4px 18px rgba(0,0,0,.10);
      }
      #${STATUS_ID} {
        position: fixed !important; right: 12px !important; bottom: 12px !important;
        z-index: 2147483647 !important; min-height: 31px; padding: 6px 10px !important;
        border: 1px solid var(--gem-lazy-border) !important; border-radius: 9px !important;
        background: var(--gem-lazy-bg) !important; color: var(--gem-lazy-fg) !important;
        font: 600 12px/18px "Google Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
        box-shadow: var(--gem-lazy-shadow) !important; backdrop-filter: blur(10px) saturate(120%) !important;
        -webkit-backdrop-filter: blur(10px) saturate(120%) !important; cursor: pointer !important;
        user-select: none !important; transition: background .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease !important;
      }
      #${STATUS_ID}:hover { background: var(--gem-lazy-hover) !important; color: var(--gem-lazy-fg-strong) !important; border-color: var(--gem-lazy-border-hover) !important; box-shadow: 0 2px 6px rgba(0,0,0,.09) !important; }
      #${TOC_TOGGLE_ID} {
        position: fixed; right: 12px; top: 80px; z-index: 2147483646; height: 31px; min-width: 46px;
        padding: 5px 9px; border: 1px solid var(--gem-lazy-border); border-radius: 9px;
        background: var(--gem-lazy-bg); color: var(--gem-lazy-fg);
        font: 600 12px/18px "Google Sans",system-ui,sans-serif; box-shadow: var(--gem-lazy-shadow);
        backdrop-filter: blur(10px) saturate(120%); -webkit-backdrop-filter: blur(10px) saturate(120%); cursor: pointer;
      }
      #${TOC_TOGGLE_ID}:hover { background: var(--gem-lazy-hover); color: var(--gem-lazy-fg-strong); border-color: var(--gem-lazy-border-hover); }
      #${TOC_PANEL_ID} {
        position: fixed; right: 12px; top: 120px; bottom: 56px; width: min(330px, calc(100vw - 32px));
        z-index: 2147483645; display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid var(--gem-lazy-border); border-radius: 12px;
        background: var(--gem-lazy-bg-solid); color: var(--gem-lazy-fg);
        box-shadow: var(--gem-lazy-shadow-panel); backdrop-filter: blur(16px) saturate(120%);
        -webkit-backdrop-filter: blur(16px) saturate(120%);
        font-family: "Google Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${TOC_PANEL_ID}[hidden] { display: none !important; }
      .gem-lazy-header { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 9px 10px 8px; border-bottom: 1px solid var(--gem-lazy-border); }
      .gem-lazy-title { flex: 1 1 auto; color: var(--gem-lazy-fg-strong); font-size: 13px; font-weight: 650; }
      #${TOC_COUNT_ID} { color: var(--gem-lazy-muted); font-size: 11px; }
      .gem-lazy-latest { border: 1px solid var(--gem-lazy-border); border-radius: 7px; padding: 4px 7px; background: rgba(0,0,0,.025); color: var(--gem-lazy-fg); font-size: 11px; cursor: pointer; }
      .gem-lazy-latest:hover { background: var(--gem-lazy-hover); color: var(--gem-lazy-fg-strong); }
      .gem-lazy-search-wrap { flex: 0 0 auto; padding: 8px 9px; }
      #${TOC_SEARCH_ID} { box-sizing: border-box; width: 100%; padding: 7px 9px; border: 1px solid var(--gem-lazy-border); border-radius: 8px; background: rgba(255,255,255,.62); color: var(--gem-lazy-fg-strong); outline: none; font: 12px/18px "Google Sans",system-ui,sans-serif; }
      #${TOC_SEARCH_ID}::placeholder { color: var(--gem-lazy-muted); }
      #${TOC_SEARCH_ID}:focus { border-color: rgba(0,0,0,.18); background: rgba(255,255,255,.88); }
      #${TOC_LIST_ID} { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 6px 8px; }
      .gem-lazy-entry { margin: 2px 0; border-radius: 8px; }
      .gem-lazy-entry.selected { background: var(--gem-lazy-selected); }
      .gem-lazy-row { display: flex; align-items: flex-start; gap: 4px; padding: 6px 5px; border-radius: 8px; }
      .gem-lazy-row:hover { background: rgba(0,0,0,.035); }
      .gem-lazy-jump { flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-start; gap: 7px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
      .gem-lazy-number { flex: 0 0 auto; min-width: 22px; color: var(--gem-lazy-muted); font-size: 10px; line-height: 17px; text-align: right; }
      .gem-lazy-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--gem-lazy-fg); font-size: 12px; line-height: 17px; }
      .gem-lazy-row:hover .gem-lazy-text { color: var(--gem-lazy-fg-strong); }
      .gem-lazy-expand { flex: 0 0 auto; width: 23px; height: 23px; margin-top: -2px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--gem-lazy-muted); cursor: pointer; }
      .gem-lazy-expand:hover { background: rgba(0,0,0,.05); color: var(--gem-lazy-fg-strong); }
      .gem-lazy-children { margin: 0 5px 5px 36px; padding-left: 8px; border-left: 1px solid var(--gem-lazy-border); }
      .gem-lazy-heading { display: block; width: 100%; padding: 4px 6px; border: 0; border-radius: 6px; background: transparent; color: var(--gem-lazy-fg); text-align: left; font-size: 11px; line-height: 15px; cursor: pointer; }
      .gem-lazy-heading:hover { background: rgba(0,0,0,.04); color: var(--gem-lazy-fg-strong); }
      .gem-lazy-empty { padding: 14px 10px; color: var(--gem-lazy-muted); font-size: 11px; line-height: 16px; }
      .gem-lazy-target-flash { animation: gemLazyFlash 1.05s ease-out; }
      @keyframes gemLazyFlash { 0% { outline: 2px solid rgba(80,110,190,.40); outline-offset: 3px; } 100% { outline: 2px solid transparent; outline-offset: 5px; } }
      @media (max-width: 900px) {
        #${TOC_PANEL_ID} { right: 8px; top: 114px; bottom: 52px; width: min(300px, calc(100vw - 24px)); }
        #${TOC_TOGGLE_ID} { right: 8px; top: 74px; }
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
    button.textContent = 'Gemini Lazy · starting';
    button.title = 'Gemini Lazy Chat 状态';
    button.addEventListener('click', () => {
      if (isStreaming) return;
      if (pinnedKeys.size) {
        returnToLatest();
        return;
      }
      if (detachPolicyActive()) {
        toggleExpanded();
        return;
      }
      scrollToBottom();
    });
    document.body.appendChild(button);
    return button;
  }

  function updateStatus() {
    const button = ensureStatusButton();
    if (isStreaming) {
      button.textContent = 'Gemini Lazy · streaming';
      return;
    }
    const total = records.length;
    if (!total) {
      button.textContent = 'Gemini TOC · no turns';
      return;
    }
    if (!detachPolicyActive()) {
      button.textContent = `Gemini TOC · ${total}`;
      return;
    }
    const attached = getAttachedCount();
    if (expanded) {
      button.textContent = `Gemini Lazy · all ${total}`;
      return;
    }
    if (pinnedKeys.size) {
      button.textContent = `Gemini Lazy · ${attached}/${total} · pinned`;
      return;
    }
    button.textContent = `Gemini Lazy · ${attached}/${total}`;
  }

  function ensureTocUi() {
    ensureStyle();
    let toggle = document.getElementById(TOC_TOGGLE_ID);
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = TOC_TOGGLE_ID;
      toggle.type = 'button';
      toggle.textContent = 'TOC';
      toggle.title = '打开/收起 Gemini 对话目录';
      toggle.addEventListener('click', () => {
        tocCollapsed = !tocCollapsed;
        try { localStorage.setItem('geminiLazyTocCollapsed', tocCollapsed ? '1' : '0'); } catch {}
        applyTocCollapsedState();
      });
      document.body.appendChild(toggle);
    }

    let panel = document.getElementById(TOC_PANEL_ID);
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = TOC_PANEL_ID;
      panel.innerHTML = `
        <div class="gem-lazy-header">
          <div class="gem-lazy-title">Gemini 对话目录</div>
          <div id="${TOC_COUNT_ID}">0</div>
          <button type="button" class="gem-lazy-latest" title="返回最新消息">最新</button>
        </div>
        <div class="gem-lazy-search-wrap">
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
      panel.querySelector('.gem-lazy-latest').addEventListener('click', returnToLatest);
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
    const root = node.querySelector('.markdown') ||
      node.querySelector('.model-response-text') ||
      node.querySelector('[class*="response-content"]') || node;

    const semantic = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))
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
    const candidates = Array.from(root.querySelectorAll(
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

  function invalidateConnectedHeadings() {
    for (const record of records) {
      if (record.role === 'assistant' && record.node?.isConnected) record.headingsCache = null;
    }
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
      empty.className = 'gem-lazy-empty';
      empty.textContent = entries.length ? '没有匹配的提问。' : '当前还没有可索引的 Gemini 提问。';
      list.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of filtered) {
      const container = document.createElement('div');
      container.className = 'gem-lazy-entry';
      if (selectedUserKey === entry.user.key) container.classList.add('selected');
      const row = document.createElement('div');
      row.className = 'gem-lazy-row';
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'gem-lazy-jump';
      jump.title = entry.user.label || `提问 ${entry.number}`;
      const number = document.createElement('span');
      number.className = 'gem-lazy-number';
      number.textContent = String(entry.number);
      const text = document.createElement('span');
      text.className = 'gem-lazy-text';
      text.textContent = entry.user.label || `提问 ${entry.number}`;
      jump.append(number, text);
      jump.addEventListener('click', () => navigateToEntry(entry, entry.user.node));
      row.appendChild(jump);

      if (entry.assistant) {
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'gem-lazy-expand';
        expand.textContent = '›';
        expand.title = '展开回答子标题';
        const children = document.createElement('div');
        children.className = 'gem-lazy-children';
        children.hidden = true;
        let loaded = false;

        expand.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!loaded) {
            loaded = true;
            const headings = collectHeadings(entry.assistant);
            if (!headings.length) {
              const none = document.createElement('div');
              none.className = 'gem-lazy-empty';
              none.style.padding = '4px 6px';
              none.textContent = '本轮无可识别子标题';
              children.appendChild(none);
            } else {
              for (const heading of headings) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'gem-lazy-heading';
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
          expand.textContent = children.hidden ? '›' : '⌄';
        });

        row.appendChild(expand);
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
    target.classList.remove('gem-lazy-target-flash');
    void target.offsetWidth;
    target.classList.add('gem-lazy-target-flash');
    setTimeout(() => target.classList.remove('gem-lazy-target-flash'), 1200);
  }

  function navigateToEntry(entry, target) {
    if (isStreaming || detectStreamingNow() || !entry?.user) {
      if (detectStreamingNow()) enterStreaming();
      return;
    }
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
    if (isStreaming || detectStreamingNow()) {
      if (detectStreamingNow()) enterStreaming();
      return;
    }
    pinnedKeys.clear();
    selectedUserKey = null;
    expanded = false;
    visibleCount = BATCH;
    renderTocList();
    applyVirtualization({ preserveAnchor: false, after: scrollToBottom });
  }

  function revealMore() {
    if (!detachPolicyActive() || expanded || isStreaming || isRevealing || pinnedKeys.size) return;
    const next = Math.min(records.length, visibleCount + BATCH);
    if (next <= visibleCount) return;
    isRevealing = true;
    visibleCount = next;
    applyVirtualization({ preserveAnchor: true });
    setTimeout(() => { isRevealing = false; }, 200);
  }

  const onScroll = debounce(() => {
    if (!detachPolicyActive() || expanded || isStreaming || pinnedKeys.size) return;
    if (getScrollTop() <= TOP_REVEAL_THRESHOLD) revealMore();
  }, 90);

  function toggleExpanded() {
    if (!detachPolicyActive() || isStreaming || detectStreamingNow()) {
      if (detectStreamingNow()) enterStreaming();
      return;
    }
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
    if (isStreaming || detectStreamingNow()) {
      if (detectStreamingNow()) enterStreaming();
      return;
    }
    if (!pendingMaintenance) pendingMaintenance = { preserveAnchor: false, forceToc: false };
    pendingMaintenance.preserveAnchor ||= !!options.preserveAnchor;
    pendingMaintenance.forceToc ||= !!options.forceToc;
    if (maintenanceIdleHandle || maintenanceTimeoutHandle) return;

    const run = () => {
      maintenanceIdleHandle = null;
      maintenanceTimeoutHandle = null;
      const payload = pendingMaintenance || {};
      pendingMaintenance = null;
      if (detectStreamingNow()) {
        enterStreaming();
        return;
      }
      const changed = syncRecords();
      if (changed || payload.forceToc) renderTocList();
      applyVirtualization({ preserveAnchor: !!payload.preserveAnchor });
    };

    if (typeof window.requestIdleCallback === 'function') {
      try {
        maintenanceIdleHandle = window.requestIdleCallback(run, { timeout: 120 });
        return;
      } catch {}
    }
    maintenanceTimeoutHandle = setTimeout(run, 60);
  }

  function pickConversationRoot() {
    return document.querySelector('.conversation-container') ||
      document.querySelector('main') || document.body || document.documentElement;
  }

  function attachObserver(root) {
    if (!root) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(debounce(() => {
      if (detectStreamingNow()) {
        enterStreaming();
        return;
      }
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

  function routeMaintenance() {
    ensureStatusButton();
    ensureTocUi();
    const currentKey = getConversationKey();
    if (currentKey !== conversationKey) {
      resetConversationState();
      setTimeout(() => {
        if (detectStreamingNow()) {
          enterStreaming();
          return;
        }
        syncRecords();
        renderTocList();
        attachObserver(pickConversationRoot());
        applyVirtualization({ preserveAnchor: false });
      }, INITIAL_SETTLE_MS);
      return;
    }

    const root = pickConversationRoot();
    if (root && root !== observerRoot) {
      attachObserver(root);
      scheduleMaintenance({ forceToc: true });
    }
  }

  function boot() {
    ensureStyle();
    ensureStatusButton();
    ensureTocUi();
    syncRecords();
    renderTocList();
    updateStatus();
    attachObserver(pickConversationRoot());

    setTimeout(() => {
      if (detectStreamingNow()) {
        enterStreaming();
        return;
      }
      syncRecords();
      renderTocList();
      applyVirtualization({ preserveAnchor: false });
    }, INITIAL_SETTLE_MS);

    setInterval(refreshStreamingState, STREAM_POLL_MS);
    setInterval(routeMaintenance, ROUTE_POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
