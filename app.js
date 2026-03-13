/* ═══════════════════════════════════════════════════════════════
   LinkedIn Analytics Dashboard — app.js
   100% client-side — no data leaves the browser
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── State ─────────────────────────────────────────────────── */
const state = {
  rawData: [],        // all parsed rows
  filteredData: [],   // rows after filters
  tableData: [],      // rows after search + sort
  filename: '',

  /* Filters */
  filters: { theme: '', media: '', type: '' },

  /* Table */
  searchQuery: '',
  sortCol: 'date',
  sortDir: 'desc',

  /* Chart.js instances */
  charts: { impressions: null, top5: null, donut: null },
};


/* ─── Dark mode detection ───────────────────────────────────── */
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const CHART_COLORS = {
  primary:   () => isDark() ? '#EDEDED' : '#000000',
  secondary: () => isDark() ? '#888888' : '#666666',
  tertiary:  () => isDark() ? '#555555' : '#999999',
  border:    () => isDark() ? '#333333' : '#EAEAEA',
  bg:        () => isDark() ? '#0A0A0A' : '#FFFFFF',
  bgSecondary: () => isDark() ? '#111111' : '#F2F2F2',
  success:   '#0070F3',
  warning:   '#F5A623',
  error:     '#EE0000',
};


/* ─── DOM refs ──────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const uploadScreen    = $('upload-screen');
const dashboardScreen = $('dashboard-screen');
const dropZone        = $('drop-zone');
const fileInput       = $('file-input');
const browseBtn       = $('browse-btn');
const resetBtn        = $('reset-btn');
const resetFiltersBtn = $('reset-filters-btn');
const uploadError     = $('upload-error');
const uploadErrorMsg  = $('upload-error-msg');

const filterTheme  = $('filter-theme');
const filterMedia  = $('filter-media');
const filterType   = $('filter-type');

const tableSearch   = $('table-search');
const tableBody     = $('table-body');
const tableEmpty    = $('table-empty');
const tableCount    = $('table-count');
const clearSearchBtn = $('clear-search-btn');


/* ═══════════════════════════════════════════════════════════════
   UPLOAD & FILE HANDLING
   ═══════════════════════════════════════════════════════════════ */

function showError(msg) {
  uploadErrorMsg.textContent = msg;
  uploadError.hidden = false;
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function clearError() {
  uploadError.hidden = true;
}

/* Drag & Drop */
dropZone.addEventListener('click', (e) => {
  if (e.target !== browseBtn && !browseBtn.contains(e.target)) {
    fileInput.click();
  }
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-dragging');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('is-dragging');
  }
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('is-dragging');
  clearError();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  clearError();
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
  fileInput.value = ''; // reset so same file can be re-imported
});

resetBtn.addEventListener('click', resetDashboard);

function resetDashboard() {
  /* Destroy charts */
  Object.values(state.charts).forEach(c => c && c.destroy());
  state.charts = { impressions: null, top5: null, donut: null };

  state.rawData = [];
  state.filteredData = [];
  state.tableData = [];
  state.filename = '';
  state.filters = { theme: '', media: '', type: '' };
  state.searchQuery = '';
  state.sortCol = 'date';
  state.sortDir = 'desc';

  /* Reset form controls */
  tableSearch.value = '';
  filterTheme.value = '';
  filterMedia.value = '';
  filterType.value = '';

  dashboardScreen.hidden = true;
  uploadScreen.hidden = false;
  clearError();
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}


/* ═══════════════════════════════════════════════════════════════
   CSV PARSING
   ═══════════════════════════════════════════════════════════════ */

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Fichier invalide. Veuillez importer un fichier .csv');
    return;
  }

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    /* Auto-detect delimiter (comma or semicolon) */
    delimitersToGuess: [';', ',', '\t'],
    complete(results) {
      if (!results.data || results.data.length === 0) {
        showError('Le fichier CSV est vide ou ne contient pas de données lisibles.');
        return;
      }

      const parsed = parseRows(results.data);
      if (parsed.length === 0) {
        showError('Impossible de lire les données. Vérifiez le format du CSV (colonnes attendues : Publication, Date, Impressions…)');
        return;
      }

      state.rawData = parsed;
      state.filename = file.name;

      uploadScreen.hidden = true;
      dashboardScreen.hidden = false;

      initDashboard();
    },
    error(err) {
      showError(`Erreur de lecture : ${err.message}`);
    }
  });
}

/**
 * Maps raw PapaParse row objects to typed domain objects.
 * Normalises column names (trim + lowercase comparison).
 */
function parseRows(rows) {
  return rows
    .map(row => {
      const get = (key) => {
        const found = Object.keys(row).find(k => normalize(k) === normalize(key));
        return found ? row[found] : '';
      };

      const date = parseDate(get('Date'));
      if (!date) return null; // skip rows without a valid date

      return {
        publication: clean(get('Publication')),
        date,
        dateRaw: get('Date'),
        impressions: parseNum(get('Impressions')),
        vues: parseNum(get('Vues')),
        reactions: parseNum(get('Réactions')),
        commentaires: parseNum(get('Commentaires')),
        republis: parseNum(get('Republi.')),
        clics: parseNum(get('Clics')),
        tauxClics: parsePct(get('Taux de clics')),
        tauxEngagement: parsePct(get("Taux d'engagement")),
        theme: clean(get('Theme')) || clean(get('Thème')) || '—',
        media: clean(get('Media')) || clean(get('Média')) || '—',
        type: clean(get('Type')) || '—',

        /* Computed */
        get interactions() {
          return this.reactions + this.commentaires + this.republis;
        },
      };
    })
    .filter(Boolean);
}

function normalize(str) {
  return str.trim().toLowerCase()
    .replace(/['\u2019]/g, "'")
    .replace(/\s+/g, ' ');
}

function clean(str) {
  return (str || '').trim();
}

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  /* DD/MM/YYYY */
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  /* YYYY-MM-DD fallback */
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const d = new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseNum(str) {
  if (!str && str !== 0) return 0;
  /* Remove thousand separators (space or dot when followed by 3 digits) */
  const cleaned = String(str).trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parsePct(str) {
  if (!str && str !== 0) return 0;
  const cleaned = String(str).trim().replace('%', '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}


/* ═══════════════════════════════════════════════════════════════
   INIT DASHBOARD
   ═══════════════════════════════════════════════════════════════ */

function initDashboard() {
  /* Nav */
  $('nav-filename').textContent = state.filename;

  /* Populate filter dropdowns */
  populateFilter(filterTheme, unique(state.rawData, 'theme'));
  populateFilter(filterMedia, unique(state.rawData, 'media'));
  populateFilter(filterType,  unique(state.rawData, 'type'));

  /* Bind filter events */
  filterTheme.addEventListener('change', applyFilters);
  filterMedia.addEventListener('change', applyFilters);
  filterType.addEventListener('change',  applyFilters);
  resetFiltersBtn.addEventListener('click', () => {
    filterTheme.value = '';
    filterMedia.value = '';
    filterType.value  = '';
    applyFilters();
  });

  /* Table events */
  tableSearch.addEventListener('input', debounce(() => {
    state.searchQuery = tableSearch.value;
    renderTable();
  }, 200));

  clearSearchBtn.addEventListener('click', () => {
    tableSearch.value = '';
    state.searchQuery = '';
    renderTable();
  });

  /* Sort events */
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => onSort(th.dataset.col));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort(th.dataset.col);
      }
    });
  });

  /* Initial render */
  applyFilters();

  /* Re-render charts on dark mode change */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    renderCharts(state.filteredData);
  });

  /* Lucide icons */
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function unique(data, key) {
  return [...new Set(data.map(d => d[key]).filter(v => v && v !== '—'))].sort();
}

function populateFilter(select, values) {
  /* Keep first "All" option, remove old dynamic ones */
  while (select.options.length > 1) select.remove(1);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}


/* ═══════════════════════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════════════════════ */

function applyFilters() {
  state.filters.theme = filterTheme.value;
  state.filters.media = filterMedia.value;
  state.filters.type  = filterType.value;

  state.filteredData = state.rawData.filter(row => {
    if (state.filters.theme && row.theme !== state.filters.theme) return false;
    if (state.filters.media && row.media !== state.filters.media) return false;
    if (state.filters.type  && row.type  !== state.filters.type)  return false;
    return true;
  });

  renderKPIs(state.filteredData);
  renderCharts(state.filteredData);
  renderTable();
}


/* ═══════════════════════════════════════════════════════════════
   KPI CARDS
   ═══════════════════════════════════════════════════════════════ */

function renderKPIs(data) {
  const count = data.length;

  const totalImpressions = sum(data, 'impressions');
  const avgEngagement    = avg(data, 'tauxEngagement');
  const medianEngagement = median(data.map(d => d.tauxEngagement));
  const totalClics       = sum(data, 'clics');
  const avgCTR           = avg(data, 'tauxClics');
  const totalInteractions = data.reduce((acc, d) => acc + d.interactions, 0);

  $('nav-count').textContent = `${count} publication${count !== 1 ? 's' : ''}`;

  setKPI('kpi-impressions', fmt(totalImpressions), null);
  setKPI('kpi-engagement',  fmtPct(avgEngagement), null);
  setKPI('kpi-clicks',      fmt(totalClics), null);
  setKPI('kpi-interactions',fmt(totalInteractions), null);

  $('kpi-posts-count').textContent   = count;
  $('kpi-engagement-median').textContent = fmtPct(medianEngagement);
  $('kpi-ctr-avg').textContent           = fmtPct(avgCTR);
}

function setKPI(cardId, value) {
  const card = $(cardId);
  const el = card.querySelector('.kpi-card__value');
  el.classList.remove('skeleton');
  el.textContent = value;
}


/* ═══════════════════════════════════════════════════════════════
   CHARTS
   ═══════════════════════════════════════════════════════════════ */

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size   = 12;

function renderCharts(data) {
  renderImpressionChart(data);
  renderTop5Chart(data);
  renderDonutChart(data);
}

/* ── Chart 1: Impressions over time (Line) ── */
function renderImpressionChart(data) {
  if (data.length === 0) return;

  /* Aggregate by date (sum impressions per day) */
  const byDate = {};
  data.forEach(d => {
    const key = formatDateKey(d.date);
    byDate[key] = (byDate[key] || 0) + d.impressions;
  });

  const sortedEntries = Object.entries(byDate)
    .sort(([a], [b]) => new Date(a) - new Date(b));

  const labels = sortedEntries.map(([k]) => {
    const d = new Date(k);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  });
  const values = sortedEntries.map(([, v]) => v);

  /* Date range badge */
  if (sortedEntries.length > 1) {
    const first = new Date(sortedEntries[0][0]);
    const last  = new Date(sortedEntries[sortedEntries.length - 1][0]);
    $('chart-line-range').textContent =
      `${first.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} → ${last.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  const ctx = $('chart-impressions').getContext('2d');

  if (state.charts.impressions) state.charts.impressions.destroy();

  const color = CHART_COLORS.primary();
  const borderColor = CHART_COLORS.border();
  const textMuted = CHART_COLORS.secondary();

  /* Gradient fill */
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, isDark() ? 'rgba(237,237,237,0.12)' : 'rgba(0,0,0,0.07)');
  gradient.addColorStop(1, isDark() ? 'rgba(237,237,237,0)'   : 'rgba(0,0,0,0)');

  state.charts.impressions = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Impressions',
        data: values,
        borderColor: color,
        borderWidth: 2,
        backgroundColor: gradient,
        pointBackgroundColor: color,
        pointRadius: values.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBorderWidth: 0,
        fill: true,
        tension: 0.35,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 3,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: buildTooltip((items) =>
          items.map(i => `${i.dataset.label}: ${fmt(i.raw)}`)
        ),
      },
      scales: {
        x: {
          grid: { color: borderColor, drawTicks: false },
          border: { display: false },
          ticks: {
            color: textMuted,
            maxTicksLimit: 10,
            maxRotation: 0,
          }
        },
        y: {
          grid: { color: borderColor, drawTicks: false },
          border: { display: false },
          ticks: {
            color: textMuted,
            callback: (v) => fmtK(v),
          },
          beginAtZero: true,
        }
      }
    }
  });
}

/* ── Chart 2: Top 5 posts by engagement (Bar) ── */
function renderTop5Chart(data) {
  if (data.length === 0) return;

  const top5 = [...data]
    .sort((a, b) => b.tauxEngagement - a.tauxEngagement)
    .slice(0, 5);

  const labels = top5.map(d => truncate(d.publication, 28));
  const values = top5.map(d => d.tauxEngagement);

  const ctx = $('chart-top5').getContext('2d');
  if (state.charts.top5) state.charts.top5.destroy();

  const color     = CHART_COLORS.primary();
  const colorSoft = CHART_COLORS.bgSecondary();
  const borderColor = CHART_COLORS.border();
  const textMuted = CHART_COLORS.secondary();

  state.charts.top5 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Taux d'engagement (%)",
        data: values,
        backgroundColor: top5.map((_, i) =>
          i === 0 ? color : (isDark() ? 'rgba(237,237,237,0.25)' : 'rgba(0,0,0,0.12)')
        ),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.4,
      plugins: {
        legend: { display: false },
        tooltip: buildTooltip((items) =>
          items.map(i => `Engagement : ${fmtPct(i.raw)}`)
        ),
      },
      scales: {
        x: {
          grid: { color: borderColor, drawTicks: false },
          border: { display: false },
          ticks: {
            color: textMuted,
            callback: (v) => fmtPct(v),
          },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: textMuted }
        }
      }
    }
  });
}

/* ── Chart 3: Interactions breakdown (Donut) ── */
function renderDonutChart(data) {
  if (data.length === 0) return;

  const totalReactions    = sum(data, 'reactions');
  const totalCommentaires = sum(data, 'commentaires');
  const totalRepublis     = sum(data, 'republis');
  const total = totalReactions + totalCommentaires + totalRepublis;

  const labels = ['Réactions', 'Commentaires', 'Republications'];
  const values = [totalReactions, totalCommentaires, totalRepublis];

  const colors = isDark()
    ? ['#EDEDED', '#666666', '#333333']
    : ['#000000', '#666666', '#CCCCCC'];

  const ctx = $('chart-donut').getContext('2d');
  if (state.charts.donut) state.charts.donut.destroy();

  state.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: CHART_COLORS.bg(),
        borderWidth: 3,
        hoverBorderWidth: 3,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: buildTooltip((items) => {
          const i = items[0];
          const pct = total > 0 ? ((i.raw / total) * 100).toFixed(1) : 0;
          return [`${i.label} : ${fmt(i.raw)} (${pct}%)`];
        }),
      }
    }
  });

  /* Custom legend */
  const legend = $('donut-legend');
  legend.innerHTML = '';
  labels.forEach((label, i) => {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : 0;
    legend.innerHTML += `
      <div class="donut-legend__item">
        <span class="donut-legend__swatch" style="background:${colors[i]}" aria-hidden="true"></span>
        <span class="donut-legend__label">${label}</span>
        <span class="donut-legend__value">${fmt(values[i])}</span>
        <span class="donut-legend__pct">${pct}%</span>
      </div>`;
  });
}

/* Shared tooltip builder */
function buildTooltip(linesFn) {
  return {
    backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
    titleColor:      isDark() ? '#EDEDED' : '#000000',
    bodyColor:       isDark() ? '#888888' : '#666666',
    borderColor:     isDark() ? '#333333' : '#EAEAEA',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    displayColors: false,
    callbacks: {
      title: (items) => items[0].label,
      label: (item)  => linesFn([item])[0],
    }
  };
}


/* ═══════════════════════════════════════════════════════════════
   TABLE
   ═══════════════════════════════════════════════════════════════ */

function renderTable() {
  const q = state.searchQuery.toLowerCase().trim();

  /* Filter by search */
  let data = state.filteredData.filter(row => {
    if (!q) return true;
    return (
      row.publication.toLowerCase().includes(q) ||
      row.theme.toLowerCase().includes(q) ||
      row.media.toLowerCase().includes(q) ||
      row.type.toLowerCase().includes(q)
    );
  });

  /* Sort */
  data = sortData(data, state.sortCol, state.sortDir);

  state.tableData = data;

  /* Update sort UI */
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.classList.toggle('is-sorted', th.dataset.col === state.sortCol);
    th.setAttribute('aria-sort', th.dataset.col === state.sortCol
      ? (state.sortDir === 'asc' ? 'ascending' : 'descending')
      : 'none'
    );
    const icon = th.querySelector('.sort-icon');
    if (icon) {
      icon.textContent = th.dataset.col === state.sortCol
        ? (state.sortDir === 'asc' ? '↑' : '↓')
        : '↕';
    }
  });

  /* Count */
  const total = state.filteredData.length;
  tableCount.textContent = q
    ? `${data.length} / ${total} résultat${data.length !== 1 ? 's' : ''}`
    : `${total} publication${total !== 1 ? 's' : ''}`;

  /* Empty state */
  tableEmpty.hidden = data.length > 0;
  tableBody.parentElement.parentElement /* .table-wrapper */.style.display =
    data.length === 0 ? 'none' : '';

  /* Render rows */
  tableBody.innerHTML = data.map(row => `
    <tr>
      <td style="white-space:nowrap;font-variant-numeric:tabular-nums;font-family:var(--font-mono);font-size:13px;">
        ${formatDisplayDate(row.date)}
      </td>
      <td class="col-pub">
        <span class="pub-title" title="${escHtml(row.publication)}">${escHtml(row.publication) || '<em style="color:var(--color-text-subtle)">Sans titre</em>'}</span>
      </td>
      <td>${row.theme !== '—' ? `<span class="badge badge--neutral">${escHtml(row.theme)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
      <td>${row.media !== '—' ? `<span class="badge badge--neutral">${escHtml(row.media)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
      <td>${row.type !== '—'  ? `<span class="badge badge--neutral">${escHtml(row.type)}</span>`  : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
      <td class="text-right">${fmt(row.impressions)}</td>
      <td class="text-right">${fmt(row.reactions)}</td>
      <td class="text-right">${fmt(row.commentaires)}</td>
      <td class="text-right">${fmt(row.republis)}</td>
      <td class="text-right">${fmt(row.clics)}</td>
      <td class="text-right">
        <span class="engagement-pill ${engagementClass(row.tauxEngagement)}">
          ${fmtPct(row.tauxEngagement)}
        </span>
      </td>
    </tr>
  `).join('');

  /* Re-run Lucide on any new icons (none in rows, but just in case) */
}

function engagementClass(pct) {
  if (pct >= 5)  return 'engagement-pill--high';
  if (pct >= 2)  return 'engagement-pill--mid';
  return 'engagement-pill--low';
}

function onSort(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'desc';
  }
  renderTable();
}

function sortData(data, col, dir) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...data].sort((a, b) => {
    switch (col) {
      case 'date':        return mult * (a.date - b.date);
      case 'publication': return mult * a.publication.localeCompare(b.publication, 'fr');
      case 'impressions': return mult * (a.impressions - b.impressions);
      case 'reactions':   return mult * (a.reactions - b.reactions);
      case 'clics':       return mult * (a.clics - b.clics);
      case 'engagement':  return mult * (a.tauxEngagement - b.tauxEngagement);
      default:            return 0;
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function sum(arr, key) {
  return arr.reduce((acc, d) => acc + (d[key] || 0), 0);
}

function avg(arr, key) {
  if (arr.length === 0) return 0;
  return sum(arr, key) / arr.length;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

function fmtK(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtPct(n) {
  return `${(+n).toFixed(2).replace('.', ',')} %`;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


/* ─── Boot ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
});
