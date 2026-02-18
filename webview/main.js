// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const container = /** @type {HTMLElement} */ (document.getElementById('log-container'));
  const filterInput = /** @type {HTMLInputElement} */ (document.getElementById('input-filter'));
  const counterEl = /** @type {HTMLElement} */ (document.getElementById('counter'));
  const chipBar = /** @type {HTMLElement} */ (document.getElementById('chip-bar'));
  const btnClear = /** @type {HTMLElement} */ (document.getElementById('btn-clear'));
  const btnCollapse = /** @type {HTMLElement} */ (document.getElementById('btn-collapse'));
  const btnExpand = /** @type {HTMLElement} */ (document.getElementById('btn-expand'));
  const chipSystem = /** @type {HTMLElement} */ (document.getElementById('chip-system'));

  /** @type {Map<string, boolean>} */
  const activeCategories = new Map([
    ['all', true],
    ['bloc', true],
    ['http', true],
    ['error', true],
    ['warning', true],
    ['info', true],
    ['debug', true],
    ['verbose', true],
  ]);

  let showSystemLogs = false;
  let collapseByDefault = true;
  let totalCount = 0;
  let filterText = '';

  // ── Smart auto-scroll ──
  let userAtBottom = true;
  const SCROLL_THRESHOLD = 30;

  container.addEventListener('scroll', () => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    userAtBottom = distanceFromBottom <= SCROLL_THRESHOLD;
  });

  // ── ANSI → HTML converter ──

  const ANSI_COLORS = [
    '#000000', '#cd3131', '#0dbc79', '#e5e510',
    '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  ];
  const ANSI_BRIGHT = [
    '#666666', '#f14c4c', '#23d18b', '#f5f543',
    '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
  ];

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * @param {number} n
   * @returns {string}
   */
  function color256(n) {
    if (n < 0 || n > 255) { return '#fff'; }
    if (n < 8) { return ANSI_COLORS[n]; }
    if (n < 16) { return ANSI_BRIGHT[n - 8]; }
    if (n < 232) {
      n -= 16;
      const r = Math.floor(n / 36) * 51;
      const g = Math.floor((n % 36) / 6) * 51;
      const b = (n % 6) * 51;
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    const v = (n - 232) * 10 + 8;
    return 'rgb(' + v + ',' + v + ',' + v + ')';
  }

  /**
   * @param {number[]} codes
   * @returns {string}
   */
  function codesToStyle(codes) {
    const parts = [];
    let i = 0;
    while (i < codes.length) {
      const c = codes[i];
      if (c === 1) { parts.push('font-weight:bold'); }
      else if (c === 2) { parts.push('opacity:0.7'); }
      else if (c === 3) { parts.push('font-style:italic'); }
      else if (c === 4) { parts.push('text-decoration:underline'); }
      else if (c >= 30 && c <= 37) { parts.push('color:' + ANSI_COLORS[c - 30]); }
      else if (c >= 90 && c <= 97) { parts.push('color:' + ANSI_BRIGHT[c - 90]); }
      else if (c >= 40 && c <= 47) { parts.push('background-color:' + ANSI_COLORS[c - 40]); }
      else if (c >= 100 && c <= 107) { parts.push('background-color:' + ANSI_BRIGHT[c - 100]); }
      else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        parts.push('color:' + color256(codes[i + 2]));
        i += 2;
      } else if (c === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        parts.push('background-color:' + color256(codes[i + 2]));
        i += 2;
      } else if (c === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        parts.push('color:rgb(' + codes[i + 2] + ',' + codes[i + 3] + ',' + codes[i + 4] + ')');
        i += 4;
      } else if (c === 48 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        parts.push('background-color:rgb(' + codes[i + 2] + ',' + codes[i + 3] + ',' + codes[i + 4] + ')');
        i += 4;
      }
      i++;
    }
    return parts.join(';');
  }

  /**
   * Convert ANSI escape codes to HTML spans with inline styles.
   * @param {string} text
   * @returns {string}
   */
  function ansiToHtml(text) {
    const re = /\x1b\[([0-9;]*)([a-zA-Z])/g;
    let result = '';
    let lastIdx = 0;
    let openSpans = 0;
    let m;

    while ((m = re.exec(text)) !== null) {
      result += escapeHtml(text.substring(lastIdx, m.index));
      lastIdx = re.lastIndex;

      if (m[2] !== 'm') { continue; }

      const raw = m[1];
      const codes = raw === '' ? [0] : raw.split(';').map(Number);

      if (codes[0] === 0 && (codes.length === 1 || raw === '')) {
        while (openSpans > 0) { result += '</span>'; openSpans--; }
      } else {
        const style = codesToStyle(codes);
        if (style) {
          result += '<span style="' + style + '">';
          openSpans++;
        }
      }
    }

    result += escapeHtml(text.substring(lastIdx));
    while (openSpans > 0) { result += '</span>'; openSpans--; }
    return result;
  }

  // ── Message handling ──

  // DEBUG: check if ANSI codes arrive in webview
  let _ansiDebugDone = false;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!_ansiDebugDone && message.command === 'log' && message.entry) {
      const raw = (message.entry.lines || []).join('');
      const hasAnsi = raw.includes('\x1b');
      console.log('[FLF-WV] ANSI in webview:', hasAnsi, 'line sample:', JSON.stringify(raw.substring(0, 80)));
      _ansiDebugDone = true;
    }
    switch (message.command) {
      case 'log':
        addEntry(message.entry);
        break;
      case 'batch':
        addBatch(message.entries);
        break;
      case 'clear':
        clearAll();
        break;
      case 'settings':
        if (message.collapseByDefault !== undefined) {
          collapseByDefault = message.collapseByDefault;
        }
        break;
    }
  });

  // ── Toolbar events ──

  btnClear.addEventListener('click', () => {
    clearAll();
    vscode.postMessage({ command: 'clear' });
  });

  btnCollapse.addEventListener('click', () => {
    container.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
  });

  btnExpand.addEventListener('click', () => {
    container.querySelectorAll('details:not([open])').forEach((d) => d.setAttribute('open', ''));
  });

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value.toLowerCase();
    applyFilters();
  });

  // ── System logs toggle ──

  chipSystem.addEventListener('click', () => {
    showSystemLogs = !showSystemLogs;
    if (showSystemLogs) {
      chipSystem.classList.add('active');
    } else {
      chipSystem.classList.remove('active');
    }
    applyFilters();
  });

  // ── Chip bar (category chips only) ──

  chipBar.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.chip[data-category]'));
    if (!chip) { return; }

    const category = chip.dataset.category;
    if (!category) { return; }

    if (category === 'all') {
      const isActive = activeCategories.get('all');
      const newState = !isActive;
      activeCategories.forEach((_v, key) => {
        activeCategories.set(key, newState);
      });
    } else {
      const current = activeCategories.get(category) || false;
      activeCategories.set(category, !current);

      const allCategories = ['bloc', 'http', 'error', 'warning', 'info', 'debug', 'verbose'];
      const allActive = allCategories.every((c) => activeCategories.get(c));
      activeCategories.set('all', allActive);
    }

    updateChipUI();
    applyFilters();
  });

  // ── Rendering ──

  /**
   * @param {any} entry
   */
  function addEntry(entry) {
    totalCount++;
    const el = createEntryElement(entry);
    container.appendChild(el);
    applyFilterToElement(el, entry);
    updateCounter();
    autoScroll();
  }

  /**
   * @param {any[]} entries
   */
  function addBatch(entries) {
    container.innerHTML = '';
    totalCount = 0;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      totalCount++;
      const el = createEntryElement(entry);
      fragment.appendChild(el);
    }
    container.appendChild(fragment);
    applyFilters();
    autoScroll();
  }

  function clearAll() {
    container.innerHTML = '';
    totalCount = 0;
    userAtBottom = true;
    updateCounter();
  }

  /**
   * @param {any} entry
   * @returns {HTMLElement}
   */
  function createEntryElement(entry) {
    const div = document.createElement('div');
    div.className = `log-entry ${entry.type === 'plain' ? 'plain' : 'block'}`;
    div.dataset.category = entry.category;
    div.dataset.source = entry.source || 'flutter';
    // Search text: ANSI-stripped
    const rawText = (entry.lines || []).join('\n');
    div.dataset.searchText = stripAnsi(rawText).toLowerCase();

    if (entry.type === 'plain') {
      const badge = createBadge(entry.category);
      div.appendChild(badge);
      const textSpan = document.createElement('span');
      textSpan.innerHTML = ansiToHtml(rawText);
      div.appendChild(textSpan);
    } else {
      const details = document.createElement('details');
      if (!collapseByDefault) {
        details.setAttribute('open', '');
      }

      const summary = document.createElement('summary');

      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '\u25B6';

      const badge = createBadge(entry.category);

      const timestamp = document.createElement('span');
      timestamp.className = 'timestamp';
      timestamp.textContent = entry.timestamp;

      const summaryText = document.createElement('span');
      summaryText.className = 'summary-text';
      // Use first ANSI-colored line for summary display
      const firstLine = (entry.lines && entry.lines[0]) || entry.summary;
      summaryText.innerHTML = ansiToHtml(firstLine);

      summary.appendChild(arrow);
      summary.appendChild(badge);
      summary.appendChild(timestamp);
      summary.appendChild(summaryText);

      const content = document.createElement('div');
      content.className = 'block-content';
      content.innerHTML = ansiToHtml(rawText);

      details.appendChild(summary);
      details.appendChild(content);
      div.appendChild(details);
    }

    return div;
  }

  /**
   * @param {string} category
   * @returns {HTMLElement}
   */
  function createBadge(category) {
    const badge = document.createElement('span');
    badge.className = `badge ${category}`;
    badge.textContent = category === 'warning' ? 'WARN' : category.toUpperCase();
    return badge;
  }

  // ── Filtering ──

  function applyFilters() {
    const entries = container.querySelectorAll('.log-entry');
    let visibleCount = 0;

    entries.forEach((el) => {
      const element = /** @type {HTMLElement} */ (el);
      const category = element.dataset.category || 'info';
      const source = element.dataset.source || 'flutter';
      const searchText = element.dataset.searchText || '';

      const sourceMatch = source === 'flutter' || showSystemLogs;
      const categoryMatch = activeCategories.get(category) !== false;
      const textMatch = !filterText || searchText.includes(filterText);

      if (sourceMatch && categoryMatch && textMatch) {
        element.classList.remove('hidden');
        visibleCount++;
      } else {
        element.classList.add('hidden');
      }
    });

    updateCounter(visibleCount);
  }

  /**
   * @param {HTMLElement} el
   * @param {any} entry
   */
  function applyFilterToElement(el, entry) {
    const source = entry.source || 'flutter';
    const category = entry.category || 'info';
    const searchText = el.dataset.searchText || '';

    const sourceMatch = source === 'flutter' || showSystemLogs;
    const categoryMatch = activeCategories.get(category) !== false;
    const textMatch = !filterText || searchText.includes(filterText);

    if (!sourceMatch || !categoryMatch || !textMatch) {
      el.classList.add('hidden');
    }
  }

  // ── UI helpers ──

  function updateChipUI() {
    chipBar.querySelectorAll('.chip[data-category]').forEach((chip) => {
      const el = /** @type {HTMLElement} */ (chip);
      const cat = el.dataset.category;
      if (cat && activeCategories.get(cat)) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  /**
   * @param {number} [visible]
   */
  function updateCounter(visible) {
    const v = visible !== undefined ? visible : countVisible();
    counterEl.textContent = `${v} / ${totalCount}`;
  }

  /**
   * @returns {number}
   */
  function countVisible() {
    return container.querySelectorAll('.log-entry:not(.hidden)').length;
  }

  function autoScroll() {
    if (userAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }
})();
