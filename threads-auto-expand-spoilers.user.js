// ==UserScript==
// @name         Auto Expand Spoilers
// @namespace    https://tampermonkey.net/
// @version      1.2.1
// @description  Expand text/media spoilers with Tampermonkey menu controls
// @match        *://*.threads.com/*
// @match        *://*.facebook.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const KEY_ENABLED = 'spoiler_enabled';
  const KEY_AUTOSCROLL = 'spoiler_autoscroll';
  const KEY_DEBUG = 'spoiler_debug';

  const state = {
    enabled: GM_getValue(KEY_ENABLED, true),
    autoScroll: GM_getValue(KEY_AUTOSCROLL, false),
    debug: GM_getValue(KEY_DEBUG, true)
  };

  const clicked = new WeakSet();
  let observer = null;
  let scrollTimer = null;

  function log(...args) {
    if (state.debug) {
      console.log('[SpoilerExpander]', ...args);
    }
  }

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function notify(text) {
    try {
      GM_notification({
        title: 'Spoiler Expander',
        text,
        timeout: 1800
      });
    } catch (e) {
      log(text);
    }
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function fireClickSequence(target, x, y) {
    const mouseTypes = ['mousedown', 'mouseup', 'click'];

    for (const type of mouseTypes) {
      try {
        target.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0
        }));
      } catch (err) {
        log('dispatch failed:', type, err);
      }
    }
  }

  function realClick(el) {
    if (!isVisible(el)) return false;

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const receiver = document.elementFromPoint(x, y) || el;
    if (!receiver) return false;

    try {
      receiver.click();
    } catch (e) {
      fireClickSequence(receiver, x, y);
    }

    if (receiver !== el) {
      try {
        el.click();
      } catch (e) {
        fireClickSequence(el, x, y);
      }
    }

    return true;
  }

  function findTextSpoilerTargets(root = document) {
    return [...root.querySelectorAll('span[data-text-fragment="spoiler"]')]
      .map(span =>
        span.closest('div[role="button"][tabindex="0"]') ||
        span.closest('div[role="button"]') ||
        span.parentElement
      );
  }

  function findMediaSpoilerTargets(root = document) {
    return [...root.querySelectorAll('span')]
      .filter(span => span.textContent && span.textContent.trim() === 'Spoiler')
      .map(span =>
        span.closest('div.x5yr21d') ||
        span.closest('div[role="button"][tabindex="0"]') ||
        span.closest('div[role="button"]') ||
        span.closest('div')
      );
  }

  function getSpoilerTargets(root = document) {
    return uniq([
      ...findTextSpoilerTargets(root),
      ...findMediaSpoilerTargets(root)
    ]);
  }

  function process(root = document) {
    if (!state.enabled) return;
    if (!root || typeof root.querySelectorAll !== 'function') return;

    const targets = getSpoilerTargets(root);
    let count = 0;

    for (const target of targets) {
      if (!target || clicked.has(target)) continue;
      if (!isVisible(target)) continue;

      if (realClick(target)) {
        clicked.add(target);
        count++;
      }
    }

    if (count > 0) {
      log('clicked:', count);
    }
  }

  function startObserver() {
    if (observer) observer.disconnect();
    if (!document.body) return;

    observer = new MutationObserver(mutations => {
      if (!state.enabled) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          process(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    log('observer started');
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      log('observer stopped');
    }
  }

  function startAutoScroll() {
    stopAutoScroll();

    if (!state.enabled || !state.autoScroll) return;

    scrollTimer = window.setInterval(() => {
      window.scrollBy(0, 800);
    }, 1500);

    log('auto-scroll started');
  }

  function stopAutoScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
      log('auto-scroll stopped');
    }
  }

  function restart() {
    stopObserver();
    stopAutoScroll();

    process(document);
    startObserver();
    startAutoScroll();

    log('restarted');
  }

  function setEnabled(value) {
    state.enabled = value;
    GM_setValue(KEY_ENABLED, value);

    if (value) {
      restart();
      notify('Enabled');
    } else {
      stopObserver();
      stopAutoScroll();
      notify('Disabled');
    }
  }

  function toggleEnabled() {
    setEnabled(!state.enabled);
  }

  function setAutoScroll(value) {
    state.autoScroll = value;
    GM_setValue(KEY_AUTOSCROLL, value);

    if (state.enabled) {
      startAutoScroll();
    }

    notify(`AutoScroll: ${value ? 'ON' : 'OFF'}`);
  }

  function toggleAutoScroll() {
    setAutoScroll(!state.autoScroll);
  }

  function setDebug(value) {
    state.debug = value;
    GM_setValue(KEY_DEBUG, value);
    notify(`Debug: ${value ? 'ON' : 'OFF'}`);
  }

  function toggleDebug() {
    setDebug(!state.debug);
  }

  function registerMenu() {
    GM_registerMenuCommand(
      `${state.enabled ? '✅' : '❌'} AutoExpand: ${state.enabled ? 'ON' : 'OFF'}`,
      toggleEnabled
    );

    GM_registerMenuCommand(
      `${state.autoScroll ? '✅' : '❌'} AutoScroll: ${state.autoScroll ? 'ON' : 'OFF'}`,
      toggleAutoScroll
    );

    GM_registerMenuCommand('🔄 Run once now', () => {
      process(document);
      notify('Ran once');
    });

    GM_registerMenuCommand('♻️ Restart listener', () => {
      restart();
      notify('Listener restarted');
    });

    GM_registerMenuCommand(
      `${state.debug ? '✅' : '❌'} Debug: ${state.debug ? 'ON' : 'OFF'}`,
      toggleDebug
    );

    GM_registerMenuCommand('🛑 Stop the script', () => {
      stopObserver();
      stopAutoScroll();
      state.enabled = false;
      GM_setValue(KEY_ENABLED, false);
      notify('Stopped');
    });
  }

  function init() {
    if (!document.body) return;

    registerMenu();

    if (state.enabled) {
      process(document);
      startObserver();
      startAutoScroll();
      log('initialized');
    } else {
      log('initialized in disabled state');
    }

    window.spoilerExpander = {
      process,
      restart,
      enable: () => setEnabled(true),
      disable: () => setEnabled(false),
      toggle: toggleEnabled,
      autoScrollOn: () => setAutoScroll(true),
      autoScrollOff: () => setAutoScroll(false),
      state
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();