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
  const chipSeparator = /** @type {HTMLElement} */ (document.getElementById('chip-separator'));

  const SEVERITY_LEVELS = ['info', 'error', 'warn', 'debug', 'verbose', 'critical'];

  /** @type {Map<string, boolean>} */
  const activeCategories = new Map([
    ['all', true],
  ]);

  let showSystemLogs = false;
  let collapseByDefault = true;
  let totalCount = 0;
  let filterText = '';

  // ── Initialize severity chips ──

  function initChips() {
    for (const sev of SEVERITY_LEVELS) {
      createChipElement(sev, true);
      activeCategories.set(sev, true);
    }
  }

  /**
   * Create a chip button element and insert it before the separator.
   * @param {string} category
   * @param {boolean} isSeverity
   */
  function createChipElement(category, isSeverity) {
    const chip = document.createElement('button');
    chip.className = 'chip active';
    chip.dataset.category = category;
    chip.textContent = category.toUpperCase();

    if (!isSeverity) {
      // Dynamic tag: apply deterministic HSL color
      const hue = hashStringToHue(category);
      const bg = 'hsl(' + hue + ', 55%, 35%)';
      chip.style.background = bg;
      chip.style.color = '#fff';
    }

    chipBar.insertBefore(chip, chipSeparator);
  }

  /**
   * Ensure a chip exists for a category. Creates a dynamic chip if needed.
   * @param {string} category
   */
  function ensureChip(category) {
    if (activeCategories.has(category)) { return; }
    // New dynamic tag
    activeCategories.set(category, true);
    createChipElement(category, false);
    // Update ALL chip state
    syncAllChip();
  }

  /**
   * Deterministic hue from string (0-360).
   * @param {string} str
   * @returns {number}
   */
  function hashStringToHue(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return ((hash % 360) + 360) % 360;
  }

  initChips();

  // ── Smart auto-scroll ──
  let userAtBottom = true;
  const SCROLL_THRESHOLD = 30;

  container.addEventListener('scroll', () => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    userAtBottom = distanceFromBottom <= SCROLL_THRESHOLD;
  });

  // ── ANSI → HTML converter ──

  const ANSI_COLORS = [
    'var(--vscode-terminal-ansiBlack, #000000)',
    'var(--vscode-terminal-ansiRed, #cd3131)',
    'var(--vscode-terminal-ansiGreen, #0dbc79)',
    'var(--vscode-terminal-ansiYellow, #e5e510)',
    'var(--vscode-terminal-ansiBlue, #2472c8)',
    'var(--vscode-terminal-ansiMagenta, #bc3fbc)',
    'var(--vscode-terminal-ansiCyan, #11a8cd)',
    'var(--vscode-terminal-ansiWhite, #e5e5e5)',
  ];
  const ANSI_BRIGHT = [
    'var(--vscode-terminal-ansiBrightBlack, #666666)',
    'var(--vscode-terminal-ansiBrightRed, #f14c4c)',
    'var(--vscode-terminal-ansiBrightGreen, #23d18b)',
    'var(--vscode-terminal-ansiBrightYellow, #f5f543)',
    'var(--vscode-terminal-ansiBrightBlue, #3b8eea)',
    'var(--vscode-terminal-ansiBrightMagenta, #d670d6)',
    'var(--vscode-terminal-ansiBrightCyan, #29b8db)',
    'var(--vscode-terminal-ansiBrightWhite, #ffffff)',
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

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
      case 'log':
        addEntry(message.entry);
        break;
      case 'batch':
        if (message.knownTags) {
          for (const tag of message.knownTags) {
            ensureChip(tag);
          }
        }
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
      syncAllChip();
    }

    updateChipUI();
    applyFilters();
  });

  /**
   * Sync the ALL chip based on whether all non-all categories are active.
   */
  function syncAllChip() {
    let allActive = true;
    activeCategories.forEach((v, key) => {
      if (key !== 'all' && !v) { allActive = false; }
    });
    activeCategories.set('all', allActive);
  }

  // ── Rendering ──

  /**
   * Normalize category for backward compat (warning → warn).
   * @param {any} entry
   * @returns {any}
   */
  function normalizeEntry(entry) {
    if (entry.category === 'warning') {
      entry.category = 'warn';
    }
    return entry;
  }

  /**
   * @param {any} entry
   */
  function addEntry(entry) {
    normalizeEntry(entry);
    ensureChip(entry.category);
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
      normalizeEntry(entry);
      ensureChip(entry.category);
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
      const firstLine = (entry.lines && entry.lines[0]) || '';
      if (entry.formattedSummary) {
        // Wrap formatted summary in the original ANSI color from the first line
        const ansiMatch = firstLine.match(/^(\x1b\[[0-9;]*m)+/);
        const colorPrefix = ansiMatch ? ansiMatch[0] : '';
        summaryText.innerHTML = ansiToHtml(colorPrefix + entry.summary + (colorPrefix ? '\x1b[0m' : ''));
      } else {
        summaryText.innerHTML = ansiToHtml(firstLine || entry.summary);
      }

      summary.appendChild(arrow);
      summary.appendChild(badge);
      summary.appendChild(timestamp);
      summary.appendChild(summaryText);

      const content = document.createElement('div');
      content.className = 'block-content';
      content.innerHTML = renderBlockContent(entry.lines || []);

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
    const isSeverity = SEVERITY_LEVELS.indexOf(category) !== -1;
    badge.className = 'badge' + (isSeverity ? ' ' + category : '');
    badge.textContent = category.toUpperCase();

    if (!isSeverity) {
      // Dynamic tag: use hash color
      const hue = hashStringToHue(category);
      badge.style.background = 'hsl(' + hue + ', 55%, 35%)';
      badge.style.color = '#fff';
    }

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

  // ── JSON detection & rendering ──

  /**
   * Find matching closing bracket, handling strings correctly.
   * @param {string} text
   * @param {number} startIdx - index of opening { or [
   * @returns {string|null}
   */
  function extractBalancedJson(text, startIdx) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && inString) { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) { continue; }
      if (c === '{' || c === '[') { depth++; }
      if (c === '}' || c === ']') { depth--; }
      if (depth === 0) { return text.substring(startIdx, i + 1); }
    }
    return null;
  }

  /**
   * Check if text has unbalanced opening braces/brackets (ignoring strings).
   * @param {string} text
   * @returns {boolean}
   */
  function hasUnbalancedBraces(text) {
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) { continue; }
      if (c === '{' || c === '[') { depth++; }
      if (c === '}' || c === ']') { depth--; }
    }
    return depth > 0;
  }

  /**
   * Escape raw newlines that appear inside JSON string values.
   * Log output may split long JSON strings across lines, leaving
   * unescaped \n / \r inside strings which breaks JSON.parse.
   * @param {string} text
   * @returns {string}
   */
  function fixJsonNewlines(text) {
    var result = '';
    var inStr = false;
    var esc = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (esc) { esc = false; result += c; continue; }
      if (c === '\\' && inStr) { esc = true; result += c; continue; }
      if (c === '"') { inStr = !inStr; result += c; continue; }
      if (inStr && c === '\n') { result += '\\n'; continue; }
      if (inStr && c === '\r') { result += '\\r'; continue; }
      result += c;
    }
    return result;
  }

  /**
   * Find first valid JSON object/array in text.
   * Skips nested fragments if the surrounding text has unbalanced braces
   * (indicates a truncated larger JSON structure).
   * @param {string} text
   * @returns {{start: number, end: number, parsed: any}|null}
   */
  function findFirstJson(text) {
    for (var i = 0; i < text.length; i++) {
      if (text[i] === '{' || text[i] === '[') {
        var str = extractBalancedJson(text, i);
        if (str && str.length > 2) {
          try {
            var fixed = fixJsonNewlines(str);
            var parsed = JSON.parse(fixed);
            // If text before the found JSON has unclosed braces,
            // the found JSON is a fragment of a larger truncated structure — skip it
            if (hasUnbalancedBraces(text.substring(0, i))) {
              return null;
            }
            return { start: i, end: i + str.length, parsed: parsed };
          } catch { /* not valid JSON */ }
        }
      }
    }
    return null;
  }

  /**
   * Check if a line has an unclosed JSON string (odd number of unescaped quotes).
   * @param {string} line
   * @returns {boolean}
   */
  function hasUnclosedString(line) {
    var count = 0;
    var esc = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { count++; }
    }
    return count % 2 !== 0;
  }

  /**
   * Fix lines where a JSON string was truncated by a line-length limit
   * (e.g., logcat's ~4096 char limit). Closes the string with …[CROPPED]".
   * @param {string[]} lines
   * @returns {string[]}
   */
  function fixTruncatedJsonLines(lines) {
    return lines.map(function (line, idx) {
      if (!hasUnclosedString(line)) { return line; }
      var fixed = line + '\u2026[CROPPED]"';
      // Add comma if next non-empty line starts a new JSON property/value
      for (var j = idx + 1; j < lines.length; j++) {
        var next = lines[j].trim();
        if (!next) { continue; }
        if (next[0] === '"' || next[0] === '{' || next[0] === '[') {
          fixed += ',';
        }
        break;
      }
      return fixed;
    });
  }

  /**
   * Render block content with JSON detection.
   * @param {string[]} lines - raw lines (with ANSI)
   * @returns {string} HTML
   */
  function renderBlockContent(lines) {
    var cleanLines = fixTruncatedJsonLines(lines.map(function (l) { return stripAnsi(l); }));
    const cleanText = cleanLines.join('\n');
    const jsonInfo = findFirstJson(cleanText);

    if (!jsonInfo) {
      return ansiToHtml(lines.join('\n'));
    }

    const { start, end, parsed } = jsonInfo;
    const before = cleanText.substring(0, start);
    const after = cleanText.substring(end);

    let html = '';

    // Text before JSON
    if (before.trim()) {
      html += escapeHtml(before);
    }

    // JSON as collapsible tree
    html += renderJsonTree(parsed);

    // Text after JSON
    if (after.trim()) {
      html += '\n' + escapeHtml(after);
    }

    return html;
  }

  /**
   * Render a parsed JSON value as a collapsible tree (entry point).
   * @param {any} value
   * @returns {string} HTML
   */
  function renderJsonTree(value) {
    if (jsonIsFoldable(value)) {
      return renderJsonFold('', value, 0, '');
    }
    if (Array.isArray(value) && value.length === 0) {
      return '<span class="jt-brace">[]</span>';
    }
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
      return '<span class="jt-brace">{}</span>';
    }
    return renderJsonPrimitive(value);
  }

  /**
   * @param {any} value
   * @returns {string} HTML
   */
  function renderJsonPrimitive(value) {
    if (value === null) { return '<span class="jt-null">null</span>'; }
    if (typeof value === 'boolean') { return '<span class="jt-bool">' + value + '</span>'; }
    if (typeof value === 'number') { return '<span class="jt-num">' + value + '</span>'; }
    if (typeof value === 'string') {
      return '<span class="jt-str">"' + escapeHtml(value) + '"</span>';
    }
    return escapeHtml(String(value));
  }

  /**
   * @param {any} value
   * @returns {boolean}
   */
  function jsonIsFoldable(value) {
    if (value === null || typeof value !== 'object') { return false; }
    if (Array.isArray(value)) {
      if (value.length === 0) { return false; }
      if (value.length <= 5 && value.every(function (v) { return v === null || typeof v !== 'object'; })) { return false; }
      return true;
    }
    return Object.keys(value).length > 0;
  }

  /**
   * Render a foldable object/array with details/summary.
   * @param {string} prefixHtml - key HTML (empty for root or array items)
   * @param {any} value - object or array
   * @param {number} depth
   * @param {string} comma - trailing comma
   * @returns {string} HTML
   */
  function renderJsonFold(prefixHtml, value, depth, comma) {
    var isArr = Array.isArray(value);
    var ob = isArr ? '[' : '{';
    var cb = isArr ? ']' : '}';
    var count = isArr ? value.length : Object.keys(value).length;
    var label = count + (isArr ? ' items' : (count === 1 ? ' key' : ' keys'));
    var open = depth < 2 ? ' open' : '';

    var childHtml;
    if (isArr) {
      childHtml = value.map(function (v, i) {
        var c = i < value.length - 1 ? ',' : '';
        return renderJsonItem('', v, depth + 1, c);
      }).join('');
    } else {
      var keys = Object.keys(value);
      childHtml = keys.map(function (k, i) {
        var c = i < keys.length - 1 ? ',' : '';
        var kh = '<span class="jt-key">"' + escapeHtml(k) + '"</span>: ';
        return renderJsonItem(kh, value[k], depth + 1, c);
      }).join('');
    }

    return '<details class="jt-fold"' + open + '>'
      + '<summary>' + prefixHtml + '<span class="jt-brace">' + ob + '</span>'
      + '<span class="jt-preview"> \u2026 ' + cb + comma
      + ' <span class="jt-hint">// ' + label + '</span></span></summary>'
      + '<div class="jt-indent">' + childHtml + '</div>'
      + '<span class="jt-close"><span class="jt-brace">' + cb + '</span>' + comma + '</span>'
      + '</details>';
  }

  /**
   * Render a single JSON property or array item.
   * @param {string} prefixHtml - key HTML or empty
   * @param {any} value
   * @param {number} depth
   * @param {string} comma
   * @returns {string} HTML
   */
  function renderJsonItem(prefixHtml, value, depth, comma) {
    if (jsonIsFoldable(value)) {
      return renderJsonFold(prefixHtml, value, depth, comma);
    }
    var html;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        html = '<span class="jt-brace">[]</span>';
      } else {
        var items = value.map(function (v) { return renderJsonPrimitive(v); }).join(', ');
        html = '<span class="jt-brace">[</span>' + items + '<span class="jt-brace">]</span>';
      }
    } else if (typeof value === 'object' && value !== null) {
      html = '<span class="jt-brace">{}</span>';
    } else {
      html = renderJsonPrimitive(value);
    }
    return '<div class="jt-row">' + prefixHtml + html + comma + '</div>';
  }
})();
