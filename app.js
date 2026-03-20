/* ═══════════════════════════════════════════════════════════════
   LinkedIn Analytics Dashboard V2 — app.js
   100% client-side — no data leaves the browser
   4-tab architecture: Bilan, Matrice, Entonnoir, Laboratoire
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── State ─────────────────────────────────────────────────── */
const state = {
  rawData: [],
  filteredData: [],
  filename: '',

  /* Filters */
  filters: { theme: '', media: '', dateFrom: null, dateTo: null },

  /* Active tab */
  activeTab: 'bilan',

  /* Leaderboard table */
  searchQuery: '',
  sortCol: 'engagement',
  sortDir: 'desc',
  page: 1,
  pageSize: 20,

  /* Engagement stacked mode */
  stackedMode: 'theme',

  /* Heatmap metric */
  heatmapMetric: 'engagement',
  heatmapJHMetric: 'impressions',

  /* Comparaison tab: selected years */
  compareYears: [],

  /* Comparaison Thèmes tab: selected themes */
  compareThemes: [],

  /* Chart.js instances (keyed by canvas id) */
  charts: {},
};


/* ─── Theme toggle (light / dark / system) ─────────────────── */
function initThemeToggle() {
  const saved = localStorage.getItem('linkedin-analytics-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeIcons();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    cycleTheme();
  });
}

function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  let next;
  if (!current) {
    /* System mode → force opposite */
    next = systemDark ? 'light' : 'dark';
  } else if (current === 'dark') {
    next = 'light';
  } else {
    /* light → remove override (back to system) */
    next = systemDark ? null : 'dark';
  }

  if (next) {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('linkedin-analytics-theme', next);
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('linkedin-analytics-theme');
  }

  updateThemeIcons();

  /* Re-render active charts since Chart.js reads CSS vars at creation time */
  if (state.filteredData.length > 0) renderActiveTab();
}

function updateThemeIcons() {
  const isDark = getEffectiveTheme() === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    /* Show sun icon in dark mode, moon icon in light mode */
    const iconName = isDark ? 'sun' : 'moon';
    btn.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
  });
  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function getEffectiveTheme() {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced) return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}


/* ─── CSS variable reader ───────────────────────────────────── */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* Data-viz palette (Palette Isolée — CLAUDE.md §Data-Viz v2.1)
   Uniquement pour <canvas> et pastilles de légende */
function DATA_COLORS() {
  return [
    cssVar('--color-data-1'),
    cssVar('--color-data-2'),
    cssVar('--color-data-3'),
    cssVar('--color-data-4'),
    cssVar('--color-data-5'),
    cssVar('--color-data-6'),
    cssVar('--color-data-7'),
  ];
}

/* UI/chart structural colors (grid, text, border) — toujours monochromes */
const C = {
  text:        () => cssVar('--color-text'),
  muted:       () => cssVar('--color-text-muted'),
  subtle:      () => cssVar('--color-text-subtle'),
  bg:          () => cssVar('--color-bg'),
  bgSecondary: () => cssVar('--color-bg-secondary'),
  border:      () => cssVar('--color-border'),
  borderStrong:() => cssVar('--color-border-strong'),
  dataGrid:    () => cssVar('--color-data-grid'),
};

const POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'cross'];


/* ─── Shorthand DOM ──────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }


/* ═══════════════════════════════════════════════════════════════
   CSV PARSING & UPLOAD
   ═══════════════════════════════════════════════════════════════ */

function parseDate(val) {
  if (!val) return null;
  /* SheetJS already returns a JS Date object for Excel date cells */
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  /* DD/MM/YYYY or MM/DD/YYYY — detect by checking which part exceeds 12 */
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const a = parseInt(dmy[1]);
    const b = parseInt(dmy[2]);
    const y = parseInt(dmy[3]);
    /* If the second component is > 12 it can't be a month → format is MM/DD/YYYY */
    if (b > 12) return new Date(y, a - 1, b);
    /* Otherwise assume DD/MM/YYYY (French default) */
    return new Date(y, b - 1, a);
  }
  /* YYYY-MM-DD */
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseNum(val) {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(/\s/g, '').replace(',', '.')) || 0;
}

function parsePct(val) {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(/\s/g, '').replace('%', '').replace(',', '.')) || 0;
}

function parseHeure(val) {
  if (!val && val !== 0) return null;
  // SheetJS avec cellDates:true retourne un Date pour les cellules "time"
  if (val instanceof Date) return val.getHours(); // 0–23
  // Fraction décimale de journée (0–1) : parfois retourné par SheetJS sans cellDates
  if (typeof val === 'number') return Math.floor(val * 24) % 24;
  // Chaîne "HH:MM:SS" ou "HH:MM"
  const match = String(val).trim().match(/^(\d{1,2}):/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Normalize column names: lowercase, trim, strip accents & special chars.
 */
function normalizeKey(key) {
  return key
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseRows(rows) {
  if (!rows || rows.length === 0) return [];

  /* Build a mapping from normalized keys to original keys */
  const sampleRow = rows[0];
  const keyMap = {};
  Object.keys(sampleRow).forEach(k => { keyMap[normalizeKey(k)] = k; });

  const col = (name) => keyMap[normalizeKey(name)] || null;

  return rows
    .map(row => {
      const get = (name) => row[col(name)];

      const date = parseDate(get('Date'));
      if (!date) return null;

      const heure = parseHeure(get('Heure')); // 0–23, null si absent

      const impressions   = parseNum(get('Impressions'));
      const vues          = parseNum(get('Vues'));
      const reactions     = parseNum(get('Reactions') || get('Réactions'));
      const commentaires  = parseNum(get('Commentaires'));
      const republis      = parseNum(get('Republi') || get('Republications'));
      const clics         = parseNum(get('Clics'));
      const tauxClics     = parsePct(get('Taux de clics') || get('Tauxdeclics'));
      const tauxEngagement= parsePct(get("Taux d'engagement") || get('Tauxdengagement'));
      const theme         = (get('Theme') || get('Thème') || get('Thematique') || '—').trim() || '—';
      const media         = (get('Media') || get('Média') || '—').trim() || '—';
      const type          = (get('Type') || '—').trim() || '—';
      const publication   = (get('Publication') || '').trim();

      const interactions      = reactions + commentaires + republis;
      const totalInteractions = interactions + clics;

      return {
        date, heure, publication, impressions, vues,
        reactions, commentaires, republis, clics,
        tauxClics, tauxEngagement,
        theme, media, type,
        interactions, totalInteractions,
        dateRaw: get('Date'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

function showUploadError(msg) {
  $('upload-error').hidden = false;
  $('upload-error-msg').textContent = msg;
}

function finalizeParsedData(data, filename) {
  if (data.length === 0) {
    showUploadError('Aucune ligne valide trouvée. Vérifiez le format du fichier.');
    return;
  }
  state.rawData = data;
  state.filteredData = [...data];
  state.filename = filename;
  $('upload-screen').hidden = true;
  $('dashboard-screen').hidden = false;
  initDashboard();
}

function handleFile(file) {
  $('upload-error').hidden = true;

  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        /* cellDates:true → les cellules date Excel sont converties en Date JS */
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        finalizeParsedData(parseRows(rows), file.name);
      } catch {
        showUploadError('Erreur lors de la lecture du fichier Excel.');
      }
    };
    reader.onerror = () => showUploadError('Erreur lors de la lecture du fichier.');
    reader.readAsArrayBuffer(file);
    return;
  }

  if (name.endsWith('.csv')) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        finalizeParsedData(parseRows(results.data), file.name);
      },
      error() {
        showUploadError('Erreur lors de la lecture du fichier CSV.');
      },
    });
    return;
  }

  showUploadError('Format non supporté. Utilisez un fichier .xlsx, .xls ou .csv.');
}


/* ═══════════════════════════════════════════════════════════════
   DASHBOARD INIT
   ═══════════════════════════════════════════════════════════════ */

function initDashboard() {
  $('nav-filename').textContent = state.filename;
  $('nav-count').textContent =
    `${state.rawData.length} publication${state.rawData.length !== 1 ? 's' : ''}`;

  populateFilter('filter-theme', 'theme', 'Tous les thèmes');
  populateFilter('filter-media', 'media', 'Tous les médias');
  populateDateRange();

  /* Event listeners */
  filterTheme.addEventListener('change', applyFilters);
  filterMedia.addEventListener('change', applyFilters);
  filterDateFrom.addEventListener('change', applyFilters);
  filterDateTo.addEventListener('change', applyFilters);
  resetFiltersBtn.addEventListener('click', resetFilters);

  /* Tabs */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* Stacked toggle */
  document.querySelectorAll('.stacked-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stacked-toggle').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.stackedMode = btn.dataset.mode;
      renderStackedEngagement(state.filteredData);
    });
  });

  /* Heatmap toggle */
  document.querySelectorAll('.heatmap-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.heatmap-toggle').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.heatmapMetric = btn.dataset.metric;
      renderHeatmap(state.filteredData);
    });
  });

  /* Heatmap Jour × Heure toggle */
  document.querySelectorAll('.heatmap-jh-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.heatmap-jh-toggle').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.heatmapJHMetric = btn.dataset.metric;
      renderHeatmapJourHeure(state.filteredData);
    });
  });

  /* Table sort */
  document.querySelectorAll('#posts-table th.sortable').forEach(th => {
    th.addEventListener('click', () => onSort(th.dataset.col));
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSort(th.dataset.col); });
  });

  /* Search */
  tableSearch.addEventListener('input', debounce(() => {
    state.searchQuery = tableSearch.value;
    state.page = 1;
    renderLeaderboardTable();
  }, 250));

  clearSearchBtn.addEventListener('click', () => {
    tableSearch.value = '';
    state.searchQuery = '';
    state.page = 1;
    renderLeaderboardTable();
  });

  /* Pagination */
  $('page-prev').addEventListener('click', () => {
    if (state.page > 1) { state.page--; renderLeaderboardTable(); }
  });
  $('page-next').addEventListener('click', () => {
    state.page++;
    renderLeaderboardTable();
  });

  /* Reset dashboard */
  resetBtn.addEventListener('click', resetDashboard);

  applyFilters();
}

/* ─── Cached DOM refs ───────────────────────────────────────── */
let filterTheme, filterMedia, filterDateFrom, filterDateTo, resetFiltersBtn;
let tableSearch, tableBody, tableEmpty, tableCount, clearSearchBtn, resetBtn;

document.addEventListener('DOMContentLoaded', () => {
  filterTheme     = $('filter-theme');
  filterMedia     = $('filter-media');
  filterDateFrom  = $('filter-date-from');
  filterDateTo    = $('filter-date-to');
  resetFiltersBtn = $('reset-filters-btn');
  tableSearch     = $('table-search');
  tableBody       = $('table-body');
  tableEmpty      = $('table-empty');
  tableCount      = $('table-count');
  clearSearchBtn  = $('clear-search-btn');
  resetBtn        = $('reset-btn');

  lucide.createIcons({ attrs: { 'stroke-width': '2' } });

  /* Theme toggle */
  initThemeToggle();

  /* Upload interactions */
  const dropZone  = $('drop-zone');
  const fileInput = $('file-input');
  const browseBtn = $('browse-btn');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragging');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
});


/* ─── Filter population ─────────────────────────────────────── */
function populateFilter(selectId, dataKey, defaultLabel) {
  const select = $(selectId);
  const values = [...new Set(state.rawData.map(d => d[dataKey]).filter(v => v && v !== '—'))].sort();
  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}

function populateDateRange() {
  const dates = state.rawData.map(d => d.date).filter(Boolean);
  if (dates.length === 0) return;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d) => d.toISOString().split('T')[0];
  filterDateFrom.min = fmt(min);
  filterDateFrom.max = fmt(max);
  filterDateTo.min   = fmt(min);
  filterDateTo.max   = fmt(max);
}


/* ─── Dashboard reset ───────────────────────────────────────── */
function resetDashboard() {
  Object.keys(state.charts).forEach(id => {
    if (state.charts[id]) state.charts[id].destroy();
  });

  state.rawData = [];
  state.filteredData = [];
  state.filename = '';
  state.filters = { theme: '', media: '', dateFrom: null, dateTo: null };
  state.activeTab = 'bilan';
  state.searchQuery = '';
  state.sortCol = 'engagement';
  state.sortDir = 'desc';
  state.page = 1;
  state.stackedMode = 'theme';
  state.heatmapMetric = 'engagement';
  state.heatmapJHMetric = 'impressions';
  state.compareYears = [];
  state.charts = {};

  $('dashboard-screen').hidden = true;
  $('upload-screen').hidden = false;
  $('file-input').value = '';
}


/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════════════ */

const TAB_META = {
  bilan:         { label: 'Le Bilan',                   title: 'Synthèse du compte' },
  matrice:       { label: 'La Matrice Stratégique',      title: 'Croisement Thème × Média' },
  entonnoir:     { label: "L'Entonnoir de l'Audience",   title: 'Conversion & Interactions' },
  laboratoire:   { label: 'La Liste',                    title: 'Tops & Flops' },
  statistiques:  { label: 'Statistiques',                title: 'Publications par année' },
  comparaison:      { label: 'Comparaison',                 title: 'Analyse multi-années' },
  'compare-themes': { label: 'Comparaison Thèmes',          title: 'Comparaison entre thèmes' },
};

function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active);
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('is-active', panel.id === `panel-${tabId}`);
  });

  const meta = TAB_META[tabId];
  $('tab-section-label').textContent = meta.label;
  $('tab-section-title').textContent = meta.title;

  renderActiveTab();
}

function renderActiveTab() {
  const data = state.filteredData;
  switch (state.activeTab) {
    case 'bilan':       renderBilan(data); break;
    case 'matrice':     renderMatrice(data); break;
    case 'entonnoir':   renderEntonnoir(data); break;
    case 'laboratoire':  renderLaboratoire(data); break;
    case 'statistiques': renderStatistiques(data); break;
    case 'comparaison':     renderComparaison(data);    break;
    case 'compare-themes':  renderCompareThemes(data);  break;
  }
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}


/* ═══════════════════════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════════════════════ */

function applyFilters() {
  state.filters.theme = filterTheme.value;
  state.filters.media = filterMedia.value;
  state.filters.dateFrom = filterDateFrom.value ? new Date(filterDateFrom.value) : null;
  state.filters.dateTo   = filterDateTo.value   ? new Date(filterDateTo.value + 'T23:59:59') : null;

  state.filteredData = state.rawData.filter(row => {
    if (state.filters.theme && row.theme !== state.filters.theme) return false;
    if (state.filters.media && row.media !== state.filters.media) return false;
    if (state.filters.dateFrom && row.date < state.filters.dateFrom) return false;
    if (state.filters.dateTo && row.date > state.filters.dateTo) return false;
    return true;
  });

  const countText = `${state.filteredData.length} publication${state.filteredData.length !== 1 ? 's' : ''}`;
  $('nav-count').textContent = countText;
  $('sidebar-count').textContent = countText;

  state.page = 1;
  renderActiveTab();
}

function resetFilters() {
  filterTheme.value = '';
  filterMedia.value = '';
  filterDateFrom.value = '';
  filterDateTo.value = '';
  applyFilters();
}


/* ═══════════════════════════════════════════════════════════════
   SHARED CHART HELPERS
   ═══════════════════════════════════════════════════════════════ */

Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
Chart.defaults.font.size = 12;

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    state.charts[id] = null;
  }
}

function tooltipBase() {
  return {
    backgroundColor:  C.bg(),
    borderColor:      C.borderStrong(),
    borderWidth:      1,
    titleColor:       C.text(),
    bodyColor:        C.muted(),
    titleFont:        { size: 12, weight: '600', family: "'Geist', system-ui, sans-serif" },
    bodyFont:         { size: 12, family: "'Geist', system-ui, sans-serif" },
    padding:          12,
    cornerRadius:     8,
    displayColors:    false,
  };
}

function buildTooltip(linesFn) {
  return {
    ...tooltipBase(),
    callbacks: {
      title:  (items) => items[0].label,
      label:  (item)  => linesFn([item])[0],
    },
  };
}

function legendSpec(position = 'top', align = 'end') {
  return {
    display: true,
    position,
    align,
    labels: {
      color:            C.muted(),
      usePointStyle:    false,
      boxWidth:         8,
      boxHeight:        8,
      borderRadius:     4,
      font:             { size: 12 },
      padding:          16,
    },
  };
}

function scaleX(opts = {}) {
  return {
    grid:   { display: false },
    border: { display: false },
    ticks:  { color: C.muted(), ...opts.ticks },
    title:  opts.title ? { display: true, color: C.muted(), font: { size: 12 }, ...opts.title } : undefined,
    ...opts.extra,
  };
}

function scaleY(opts = {}) {
  return {
    grid:   { color: C.dataGrid(), drawTicks: false },
    border: { display: false },
    ticks:  { color: C.muted(), ...opts.ticks },
    title:  opts.title ? { display: true, color: C.muted(), font: { size: 12 }, ...opts.title } : undefined,
    beginAtZero: opts.beginAtZero !== false,
    ...opts.extra,
  };
}

function scaleXValue(opts = {}) {
  return {
    grid:   { color: C.dataGrid(), drawTicks: false },
    border: { display: false },
    ticks:  { color: C.muted(), ...opts.ticks },
    beginAtZero: opts.beginAtZero !== false,
    ...opts.extra,
  };
}

function scaleYCategory(opts = {}) {
  return {
    grid:   { display: false },
    border: { display: false },
    ticks:  { color: C.muted(), ...opts.ticks },
    ...opts.extra,
  };
}

/** Average engagement from rawData (account-level reference) */
function accountAvgEngagement() {
  return state.rawData.length > 0 ? avg(state.rawData, 'tauxEngagement') : 0;
}


/* ═══════════════════════════════════════════════════════════════
   TAB 1: LE BILAN
   ═══════════════════════════════════════════════════════════════ */

function renderBilan(data) {
  renderKPIs(data);
  renderTimelineChart(data);
  renderPodium(data);
}

/* ── KPIs with trend arrows ── */
function renderKPIs(data) {
  const count = data.length;
  const totalImpressions = sum(data, 'impressions');
  const avgClics = avg(data, 'tauxClics');
  const medianClics = median(data.map(d => d.tauxClics));
  const avgEngagement = avg(data, 'tauxEngagement');
  const medianEngagement = median(data.map(d => d.tauxEngagement));
  const totalInteractions = data.reduce((acc, d) => acc + d.totalInteractions, 0);

  setKPI('kpi-impressions', fmtK(totalImpressions));
  setKPI('kpi-clics', fmtPct(avgClics));
  setKPI('kpi-engagement', fmtPct(avgEngagement));
  setKPI('kpi-interactions', fmt(totalInteractions));

  $('kpi-posts-count').textContent = count;
  $('kpi-clics-median').textContent = fmtPct(medianClics);
  $('kpi-engagement-median').textContent = fmtPct(medianEngagement);

  /* Trend arrows: compare first half vs second half */
  if (data.length >= 4) {
    const sorted = [...data].sort((a, b) => a.date - b.date);
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);

    renderTrend('kpi-impressions-trend',
      sum(firstHalf, 'impressions') / firstHalf.length,
      sum(secondHalf, 'impressions') / secondHalf.length);
    renderTrend('kpi-clics-trend',
      avg(firstHalf, 'tauxClics'),
      avg(secondHalf, 'tauxClics'));
    renderTrend('kpi-engagement-trend',
      avg(firstHalf, 'tauxEngagement'),
      avg(secondHalf, 'tauxEngagement'));
    renderTrend('kpi-interactions-trend',
      firstHalf.reduce((a, d) => a + d.totalInteractions, 0) / firstHalf.length,
      secondHalf.reduce((a, d) => a + d.totalInteractions, 0) / secondHalf.length);
  } else {
    ['kpi-impressions-trend', 'kpi-clics-trend', 'kpi-engagement-trend', 'kpi-interactions-trend']
      .forEach(id => $(id).innerHTML = '');
  }
}

function renderTrend(elementId, oldVal, newVal) {
  const el = $(elementId);
  if (!el || oldVal === 0) { if (el) el.innerHTML = ''; return; }
  const pctChange = ((newVal - oldVal) / oldVal) * 100;
  const isUp = pctChange >= 0;
  const icon = isUp ? 'trending-up' : 'trending-down';
  const cls  = isUp ? 'kpi-card__trend--up' : 'kpi-card__trend--down';
  const sign = isUp ? '+' : '';
  el.innerHTML = `<span class="kpi-card__trend ${cls}"><i data-lucide="${icon}"></i>${sign}${pctChange.toFixed(1).replace('.', ',')}%</span>`;
}

function setKPI(cardId, value) {
  const el = $(cardId).querySelector('.kpi-card__value');
  el.classList.remove('skeleton');
  animateCounter(el, value);
}

/* ── Counter animation — numbers count up from 0 ── */
function animateCounter(el, targetText) {
  /* Parse numeric part from formatted string like "12,5k", "3,45 %", "1 234" */
  const numMatch = targetText.match(/[\d\s,.]+/);
  if (!numMatch) { el.textContent = targetText; return; }

  const numStr = numMatch[0].trim();
  const prefix = targetText.slice(0, numMatch.index);
  const suffix = targetText.slice(numMatch.index + numMatch[0].length);

  /* Detect decimal separator (comma in fr-FR) */
  const hasDecimal = numStr.includes(',');
  const decimalPlaces = hasDecimal ? numStr.split(',')[1].replace(/\s/g, '').length : 0;
  const targetNum = parseFloat(numStr.replace(/\s/g, '').replace(',', '.'));

  if (isNaN(targetNum) || targetNum === 0) { el.textContent = targetText; return; }

  /* Respect prefers-reduced-motion */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = targetText;
    return;
  }

  const duration = 600; /* ms */
  const startTime = performance.now();

  function formatAnimatedNum(n) {
    if (hasDecimal) {
      return n.toFixed(decimalPlaces).replace('.', ',');
    }
    /* Replicate toLocaleString with spaces for thousands */
    return Math.round(n).toLocaleString('fr-FR');
  }

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    /* Expo ease-out for snappy feel */
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = targetNum * eased;

    el.textContent = prefix + formatAnimatedNum(current) + suffix;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      /* Ensure final value is exact */
      el.textContent = targetText;
    }
  }

  requestAnimationFrame(step);
}

/* ── Timeline: dual axis — data-1 bars / data-2 line + average reference ── */
function renderTimelineChart(data) {
  if (data.length === 0) return;

  const byMonth = {};
  data.forEach(d => {
    const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { impressions: 0, engagements: [], count: 0 };
    byMonth[key].impressions += d.impressions;
    byMonth[key].engagements.push(d.tauxEngagement);
    byMonth[key].count++;
  });

  const sorted = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  const labels = sorted.map(([k]) => {
    const [y, m] = k.split('-');
    return new Date(parseInt(y), parseInt(m) - 1)
      .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });
  const impressionValues = sorted.map(([, v]) => v.impressions);
  const engagementValues = sorted.map(([, v]) =>
    +(v.engagements.reduce((a, b) => a + b, 0) / v.engagements.length).toFixed(2)
  );

  if (sorted.length > 1) {
    const [fy, fm] = sorted[0][0].split('-');
    const [ly, lm] = sorted[sorted.length - 1][0].split('-');
    const first = new Date(parseInt(fy), parseInt(fm) - 1)
      .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    const last  = new Date(parseInt(ly), parseInt(lm) - 1)
      .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    $('chart-timeline-range').textContent = `${first} → ${last}`;
  }

  const ctx = $('chart-timeline').getContext('2d');
  destroyChart('chart-timeline');

  const [d1, d2] = DATA_COLORS();
  const avgEng = accountAvgEngagement();

  state.charts['chart-timeline'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Impressions',
          type: 'bar',
          data: impressionValues,
          backgroundColor: d1,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Engagement (%)',
          type: 'line',
          data: engagementValues,
          borderColor: d2,
          borderWidth: 2,
          backgroundColor: 'transparent',
          pointBackgroundColor: d2,
          pointRadius: sorted.length > 20 ? 0 : 4,
          pointHoverRadius: 6,
          tension: 0.35,
          yAxisID: 'y1',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 3,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title:  (items) => items[0].label,
            label:  (ctx)   => ctx.dataset.label === 'Engagement (%)'
              ? `Engagement : ${fmtPct(ctx.raw)}`
              : `Impressions : ${fmt(ctx.raw)}`,
          },
        },
        annotation: {
          annotations: {
            avgLine: {
              type: 'line',
              yMin: avgEng,
              yMax: avgEng,
              yScaleID: 'y1',
              borderColor: C.muted(),
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: `Moy. ${fmtPct(avgEng)}`,
                position: 'start',
                font: { size: 11, family: "'Geist', system-ui, sans-serif" },
                color: C.muted(),
                backgroundColor: 'transparent',
              },
            },
          },
        },
      },
      scales: {
        x:  scaleX({ ticks: { maxRotation: 0 } }),
        y:  { ...scaleY({ ticks: { callback: (v) => fmtK(v) } }), position: 'left' },
        y1: {
          position: 'right',
          grid:   { display: false },
          border: { display: false },
          ticks:  { color: C.muted(), callback: (v) => fmtPct(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

/* ── Podium Express ── */
function renderPodium(data) {
  const top3 = [...data]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);

  const container = $('podium-cards');

  if (top3.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="trophy" aria-hidden="true"></i>
        <p class="empty-state__title">Aucune publication</p>
        <p class="empty-state__desc">Aucune publication pour cette période.</p>
      </div>`;
    return;
  }

  const ranks     = ['1er', '2e', '3e'];
  const rankIcons = ['trophy', 'medal', 'award'];

  container.innerHTML = top3.map((post, i) => `
    <div class="podium-card ${i === 0 ? 'podium-card--gold' : ''}">
      <div class="podium-card__rank">
        <i data-lucide="${rankIcons[i]}" aria-hidden="true"></i>
        <span>${ranks[i]}</span>
      </div>
      <p class="podium-card__title" title="${escHtml(post.publication)}">
        ${escHtml(truncate(post.publication, 60))}
      </p>
      <div class="podium-card__meta">
        <span class="podium-card__date">${formatDisplayDate(post.date)}</span>
        ${post.theme !== '—' ? `<span class="badge badge--neutral">${escHtml(post.theme)}</span>` : ''}
      </div>
      <div class="podium-card__stats">
        <div class="podium-card__stat">
          <span class="podium-card__stat-value">${fmt(post.impressions)}</span>
          <span class="podium-card__stat-label">Impressions</span>
        </div>
        <div class="podium-card__stat">
          <span class="podium-card__stat-value">${fmtPct(post.tauxEngagement)}</span>
          <span class="podium-card__stat-label">Engagement</span>
        </div>
        <div class="podium-card__stat">
          <span class="podium-card__stat-value">${fmt(post.clics)}</span>
          <span class="podium-card__stat-label">Clics</span>
        </div>
      </div>
    </div>
  `).join('');
}


/* ═══════════════════════════════════════════════════════════════
   TAB 2: LA MATRICE STRATÉGIQUE
   ═══════════════════════════════════════════════════════════════ */

function renderMatrice(data) {
  renderHeatmap(data);
  renderEffortVsReward(data);
}

/* ── Heatmap: Theme x Media ── */
function renderHeatmap(data) {
  const container = $('heatmap-container');
  const metric = state.heatmapMetric; // 'engagement' or 'impressions'

  const themes = [...new Set(data.map(d => d.theme))].filter(t => t !== '—').sort();
  const medias = [...new Set(data.map(d => d.media))].filter(m => m !== '—').sort();

  if (themes.length === 0 || medias.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="grid-3x3" aria-hidden="true"></i>
        <p class="empty-state__title">Données insuffisantes</p>
        <p class="empty-state__desc">Il faut au moins un thème et un média identifiés.</p>
      </div>`;
    return;
  }

  /* Build matrix */
  const matrix = {};
  let globalMin = Infinity, globalMax = -Infinity;

  themes.forEach(theme => {
    matrix[theme] = {};
    medias.forEach(media => {
      const matches = data.filter(d => d.theme === theme && d.media === media);
      if (matches.length > 0) {
        const val = metric === 'engagement'
          ? avg(matches, 'tauxEngagement')
          : avg(matches, 'impressions');
        matrix[theme][media] = { value: val, count: matches.length };
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      } else {
        matrix[theme][media] = null;
      }
    });
  });

  const range = globalMax - globalMin || 1;
  const heatColor = cssVar('--color-data-1');

  /* Build HTML table */
  let html = `<table class="heatmap-table" aria-label="Carte de chaleur Thème × Média">
    <thead><tr><th scope="col">Thème</th>`;

  medias.forEach(m => { html += `<th scope="col">${escHtml(m)}</th>`; });
  html += '</tr></thead><tbody>';

  themes.forEach(theme => {
    html += `<tr><td scope="row">${escHtml(theme)}</td>`;
    medias.forEach(media => {
      const cell = matrix[theme][media];
      if (cell) {
        const opacity = 0.1 + ((cell.value - globalMin) / range) * 0.7;
        const bg = hexToRgba(heatColor, opacity);
        const isDark = opacity >= 0.4;
        const bgCol = cssVar('--color-bg');
        const textColor  = isDark ? bgCol : cssVar('--color-text');
        const countColor = isDark ? hexToRgba(bgCol, 0.75) : cssVar('--color-text-muted');
        const displayVal = metric === 'engagement' ? fmtPct(cell.value) : fmt(Math.round(cell.value));
        html += `<td class="heatmap-cell--value" style="background:${bg};color:${textColor}">${displayVal}<span class="heatmap-count" style="color:${countColor}">${cell.count} post${cell.count > 1 ? 's' : ''}</span></td>`;
      } else {
        html += `<td class="heatmap-cell--empty">—</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/* ── Effort vs Reward: grouped bar ── */
function renderEffortVsReward(data) {
  if (data.length === 0) return;

  const byTheme = groupBy(data, 'theme');
  const entries = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({
      theme,
      volume: rows.length,
      engagement: avg(rows, 'tauxEngagement'),
    }))
    .sort((a, b) => b.engagement - a.engagement);

  if (entries.length === 0) return;

  const labels = entries.map(e => e.theme);
  const volumes = entries.map(e => e.volume);
  const engagements = entries.map(e => +e.engagement.toFixed(2));
  const [d1, d2] = DATA_COLORS();
  const avgEng = accountAvgEngagement();

  const ctx = $('chart-effort-reward').getContext('2d');
  destroyChart('chart-effort-reward');

  state.charts['chart-effort-reward'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Volume de posts',
          data: volumes,
          backgroundColor: d1,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Engagement moyen (%)',
          data: engagements,
          backgroundColor: d2,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y1',
          order: 1,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: Math.max(1.5, Math.min(3, 15 / entries.length)),
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => ctx.dataset.label.includes('Volume')
              ? `${ctx.raw} publication${ctx.raw > 1 ? 's' : ''}`
              : `Engagement : ${fmtPct(ctx.raw)}`,
          },
        },
        annotation: {
          annotations: {
            avgLine: {
              type: 'line',
              yMin: avgEng,
              yMax: avgEng,
              yScaleID: 'y1',
              borderColor: C.muted(),
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: `Moy. ${fmtPct(avgEng)}`,
                position: 'start',
                font: { size: 11, family: "'Geist', system-ui, sans-serif" },
                color: C.muted(),
                backgroundColor: 'transparent',
              },
            },
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { maxRotation: 45 } }),
        y:  { ...scaleY({ ticks: { stepSize: 1, callback: (v) => v } }), position: 'left', title: { display: true, text: 'Posts', color: C.muted(), font: { size: 12 } } },
        y1: {
          position: 'right',
          grid:   { display: false },
          border: { display: false },
          ticks:  { color: C.muted(), callback: (v) => fmtPct(v) },
          beginAtZero: true,
          title:  { display: true, text: 'Engagement (%)', color: C.muted(), font: { size: 12 } },
        },
      },
    },
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 3: L'ENTONNOIR DE L'AUDIENCE
   ═══════════════════════════════════════════════════════════════ */

function renderEntonnoir(data) {
  renderFunnelChart(data);
  renderStackedEngagement(data);
}

/* ── Funnel ── */
function renderFunnelChart(data) {
  if (data.length === 0) return;

  const totalImpressions = sum(data, 'impressions');
  const totalClics = sum(data, 'clics');
  const totalInteractions = data.reduce((acc, d) => acc + d.interactions, 0);

  const labels = ['Impressions', 'Clics', 'Interactions'];
  const values = [totalImpressions, totalClics, totalInteractions];
  const [d1, d2, d3] = DATA_COLORS();

  const ctx = $('chart-funnel').getContext('2d');
  destroyChart('chart-funnel');

  state.charts['chart-funnel'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [d1, d2, d3],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const pct = totalImpressions > 0
                ? ((ctx.raw / totalImpressions) * 100).toFixed(1) : 0;
              return `${fmt(ctx.raw)} (${pct}% des impressions)`;
            },
          },
        },
      },
      scales: {
        x: scaleXValue({ ticks: { callback: (v) => fmtK(v) } }),
        y: scaleYCategory(),
      },
    },
  });
}

/* ── Stacked 100% bar ── */
function renderStackedEngagement(data) {
  if (data.length === 0) return;

  let entries;
  if (state.stackedMode === 'theme') {
    const byTheme = groupBy(data, 'theme');
    entries = Object.entries(byTheme)
      .filter(([t]) => t !== '—')
      .map(([label, rows]) => ({
        label,
        reactions:    sum(rows, 'reactions'),
        commentaires: sum(rows, 'commentaires'),
        republis:     sum(rows, 'republis'),
      }))
      .filter(e => (e.reactions + e.commentaires + e.republis) > 0)
      .sort((a, b) =>
        (b.reactions + b.commentaires + b.republis) -
        (a.reactions + a.commentaires + a.republis)
      );
  } else {
    entries = [...data]
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 15)
      .map(d => ({
        label:        truncate(d.publication, 25),
        reactions:    d.reactions,
        commentaires: d.commentaires,
        republis:     d.republis,
      }))
      .filter(e => (e.reactions + e.commentaires + e.republis) > 0);
  }

  const labels = entries.map(e => e.label);
  const totals = entries.map(e => e.reactions + e.commentaires + e.republis);
  const reactPct   = entries.map((e, i) => totals[i] > 0 ? (e.reactions    / totals[i]) * 100 : 0);
  const commentPct = entries.map((e, i) => totals[i] > 0 ? (e.commentaires / totals[i]) * 100 : 0);
  const republiPct = entries.map((e, i) => totals[i] > 0 ? (e.republis     / totals[i]) * 100 : 0);

  const [d1, d2, d3] = DATA_COLORS();
  const ctx = $('chart-stacked-engagement').getContext('2d');
  destroyChart('chart-stacked-engagement');

  state.charts['chart-stacked-engagement'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Réactions',     data: reactPct,   backgroundColor: d1, borderSkipped: false },
        { label: 'Commentaires',  data: commentPct, backgroundColor: d2, borderSkipped: false },
        { label: 'Republications',data: republiPct, backgroundColor: d3, borderSkipped: false },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: Math.max(1, Math.min(2.5, 15 / entries.length)),
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx)   => `${ctx.dataset.label} : ${ctx.raw.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: { ...scaleXValue({ ticks: { callback: (v) => `${v}%` } }), max: 100, stacked: true },
        y: { ...scaleYCategory(), stacked: true },
      },
    },
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 4: LE LABORATOIRE
   ═══════════════════════════════════════════════════════════════ */

function renderLaboratoire(data) {
  renderTopsFlops(data);
  renderLeaderboardTable();
}

/* ── Tops vs Flops ── */
function renderTopsFlops(data) {
  const container = $('tops-flops-container');

  if (data.length < 2) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i data-lucide="flask-conical" aria-hidden="true"></i>
        <p class="empty-state__title">Données insuffisantes</p>
        <p class="empty-state__desc">Il faut au moins 2 publications pour comparer.</p>
      </div>`;
    return;
  }

  const sorted = [...data].sort((a, b) => b.tauxEngagement - a.tauxEngagement);
  const top5 = sorted.slice(0, Math.min(5, sorted.length));
  const flop5 = sorted.slice(-Math.min(5, sorted.length)).reverse();

  function buildTable(items, cellClass) {
    return `<div class="table-wrapper"><table class="data-table">
      <thead><tr>
        <th>Publication</th>
        <th>Thème</th>
        <th class="text-right">Engagement</th>
        <th class="text-right">Impressions</th>
      </tr></thead>
      <tbody>${items.map(row => `
        <tr>
          <td class="${cellClass}"><span class="pub-title" title="${escHtml(row.publication)}">${escHtml(truncate(row.publication, 35))}</span></td>
          <td class="${cellClass}">${row.theme !== '—' ? `<span class="badge badge--neutral">${escHtml(row.theme)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
          <td class="text-right ${cellClass}"><span class="engagement-pill ${engagementClass(row.tauxEngagement)}">${fmtPct(row.tauxEngagement)}</span></td>
          <td class="text-right ${cellClass}">${fmt(row.impressions)}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  container.innerHTML = `
    <div class="tops-flops__col">
      <h4 class="tops-flops__heading tops-flops__heading--top">
        <i data-lucide="arrow-up-circle" aria-hidden="true"></i>
        Top 5 — Meilleur engagement
      </h4>
      ${buildTable(top5, 'cell--top')}
    </div>
    <div class="tops-flops__col">
      <h4 class="tops-flops__heading tops-flops__heading--flop">
        <i data-lucide="arrow-down-circle" aria-hidden="true"></i>
        Flop 5 — Plus faible engagement
      </h4>
      ${buildTable(flop5, 'cell--bottom')}
    </div>
  `;
}

/* ── Leaderboard Table with conditional formatting ── */
function renderLeaderboardTable() {
  const q = state.searchQuery.toLowerCase().trim();

  let data = state.filteredData.filter(row => {
    if (!q) return true;
    return (
      row.publication.toLowerCase().includes(q) ||
      row.theme.toLowerCase().includes(q) ||
      row.media.toLowerCase().includes(q)
    );
  });

  data = sortData(data, state.sortCol, state.sortDir);

  /* Compute percentile thresholds */
  const engValues = data.map(d => d.tauxEngagement).sort((a, b) => a - b);
  const imprValues = data.map(d => d.impressions).sort((a, b) => a - b);
  const clicsValues = data.map(d => d.tauxClics).sort((a, b) => a - b);

  const p10 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.1)] : -Infinity;
  const p90 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.9)] : Infinity;

  const engP10 = p10(engValues), engP90 = p90(engValues);
  const imprP10 = p10(imprValues), imprP90 = p90(imprValues);
  const clicsP10 = p10(clicsValues), clicsP90 = p90(clicsValues);

  function cellClass(val, low, high) {
    if (val >= high) return 'cell--top';
    if (val <= low) return 'cell--bottom';
    return '';
  }

  /* Sort UI */
  document.querySelectorAll('#posts-table th.sortable').forEach(th => {
    th.classList.toggle('is-sorted', th.dataset.col === state.sortCol);
    th.setAttribute('aria-sort', th.dataset.col === state.sortCol
      ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = th.dataset.col === state.sortCol
      ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕';
  });

  const total = state.filteredData.length;
  tableCount.textContent = q
    ? `${data.length} / ${total} résultat${data.length !== 1 ? 's' : ''}`
    : `${total} publication${total !== 1 ? 's' : ''}`;

  tableEmpty.hidden = data.length > 0;
  const tableWrapper = tableBody.closest('.table-wrapper');
  if (tableWrapper) tableWrapper.style.display = data.length === 0 ? 'none' : '';

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(data.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const start    = (state.page - 1) * state.pageSize;
  const end      = Math.min(start + state.pageSize, data.length);
  const pageData = data.slice(start, end);

  $('pagination-info').textContent    = data.length > 0 ? `${start + 1}–${end} sur ${data.length}` : '';
  $('pagination-current').textContent = data.length > 0 ? `Page ${state.page} / ${totalPages}` : '';
  $('page-prev').disabled = state.page <= 1;
  $('page-next').disabled = state.page >= totalPages;
  $('pagination').style.display = data.length > state.pageSize ? '' : 'none';

  tableBody.innerHTML = pageData.map(row => `
    <tr>
      <td style="white-space:nowrap;font-variant-numeric:tabular-nums;font-family:var(--font-mono);font-size:13px;">
        ${formatDisplayDate(row.date)}
      </td>
      <td class="col-pub">
        <span class="pub-title" title="${escHtml(row.publication)}">
          ${escHtml(row.publication) || '<em style="color:var(--color-text-subtle)">Sans titre</em>'}
        </span>
      </td>
      <td>${row.theme !== '—' ? `<span class="badge badge--neutral">${escHtml(row.theme)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
      <td>${row.media !== '—' ? `<span class="badge badge--neutral">${escHtml(row.media)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
      <td class="text-right ${cellClass(row.impressions, imprP10, imprP90)}">${fmt(row.impressions)}</td>
      <td class="text-right ${cellClass(row.tauxClics, clicsP10, clicsP90)}">${fmtPct(row.tauxClics)}</td>
      <td class="text-right ${cellClass(row.tauxEngagement, engP10, engP90)}">
        <span class="engagement-pill ${engagementClass(row.tauxEngagement)}">
          ${fmtPct(row.tauxEngagement)}
        </span>
      </td>
    </tr>
  `).join('');
}


/* ═══════════════════════════════════════════════════════════════
   TABLE SORT
   ═══════════════════════════════════════════════════════════════ */

function engagementClass(pct) {
  if (pct >= 5) return 'engagement-pill--high';
  if (pct >= 2) return 'engagement-pill--mid';
  return 'engagement-pill--low';
}

function onSort(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'desc';
  }
  state.page = 1;
  renderLeaderboardTable();
}

function sortData(data, col, dir) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...data].sort((a, b) => {
    switch (col) {
      case 'date':         return mult * (a.date - b.date);
      case 'publication':  return mult * a.publication.localeCompare(b.publication, 'fr');
      case 'impressions':  return mult * (a.impressions - b.impressions);
      case 'reactions':    return mult * (a.reactions - b.reactions);
      case 'clics':        return mult * (a.clics - b.clics);
      case 'tauxClics':    return mult * (a.tauxClics - b.tauxClics);
      case 'engagement':   return mult * (a.tauxEngagement - b.tauxEngagement);
      default:             return 0;
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 5: STATISTIQUES PAR ANNÉE
   ═══════════════════════════════════════════════════════════════ */

const MONTH_LABELS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

function renderStatistiques(data) {
  renderYtdCumulChart(data);
  renderYearlyTotalChart(data);
  renderHeatmapJourHeure(data);
}

function renderYtdCumulChart(data) {
  destroyChart('chart-ytd-cumul');
  if (!data.length) return;

  /* Group posts by year then by month (0-indexed) */
  const byYear = {};
  data.forEach(d => {
    if (!d.date) return;
    const y = d.date.getFullYear();
    const m = d.date.getMonth();
    if (!byYear[y]) byYear[y] = new Array(12).fill(0);
    byYear[y][m]++;
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const colors = DATA_COLORS();
  const pointShapes = POINT_STYLES;

  const datasets = years.map((year, i) => {
    const counts = byYear[year];
    /* Cumulative sum month by month */
    const cumul = [];
    let acc = 0;
    for (let m = 0; m < 12; m++) {
      acc += counts[m];
      /* Only include months up to last month with data for this year */
      cumul.push(acc);
    }
    /* Trim trailing zeros beyond the last month that has data */
    let lastNonZero = 11;
    while (lastNonZero > 0 && byYear[year][lastNonZero] === 0) lastNonZero--;
    const trimmed = cumul.slice(0, lastNonZero + 1);

    const color = colors[i % colors.length];
    return {
      label: String(year),
      data: trimmed,
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      pointStyle: pointShapes[i % pointShapes.length],
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.3,
    };
  });

  const ctx = $('chart-ytd-cumul').getContext('2d');
  state.charts['chart-ytd-cumul'] = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => MONTH_LABELS[items[0].dataIndex],
            label: (item) => ` ${item.dataset.label} : ${item.parsed.y} publication${item.parsed.y > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { color: C.muted() } }),
        y: scaleY({
          beginAtZero: true,
          ticks: { color: C.muted(), stepSize: 1, precision: 0 },
        }),
      },
    },
  });
}

function renderYearlyTotalChart(data) {
  destroyChart('chart-yearly-total');
  if (!data.length) return;

  /* Count publications per year */
  const byYear = {};
  data.forEach(d => {
    if (!d.date) return;
    const y = d.date.getFullYear();
    byYear[y] = (byYear[y] || 0) + 1;
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const counts = years.map(y => byYear[y]);
  const colors = DATA_COLORS();

  const ctx = $('chart-yearly-total').getContext('2d');
  state.charts['chart-yearly-total'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'Publications',
        data: counts,
        backgroundColor: years.map((_, i) => colors[i % colors.length]),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${item.parsed.y} publication${item.parsed.y > 1 ? 's' : ''}`,
          },
        },
        datalabels: undefined,
      },
      scales: {
        x: scaleX({ ticks: { color: C.muted() } }),
        y: scaleY({
          beginAtZero: true,
          ticks: {
            color: C.muted(),
            stepSize: 20,
            precision: 0,
          },
        }),
      },
      animation: {
        onComplete: function() {
          const chart = this;
          const ctx2 = chart.ctx;
          ctx2.save();
          ctx2.font = `500 12px 'Geist', system-ui, sans-serif`;
          ctx2.fillStyle = C.muted();
          ctx2.textAlign = 'center';
          ctx2.textBaseline = 'bottom';
          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar, index) => {
              const value = dataset.data[index];
              ctx2.fillText(value, bar.x, bar.y - 4);
            });
          });
          ctx2.restore();
        },
      },
    },
  });
}


const JOURS_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_ORDER  = [1, 2, 3, 4, 5, 6, 0]; // Lun–Dim (JS: 0=Dim)

function renderHeatmapJourHeure(data) {
  const container = $('heatmap-jour-heure');
  if (!container) return;

  const withHeure = data.filter(d => d.heure !== null && d.heure !== undefined);

  if (withHeure.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="clock" aria-hidden="true"></i>
        <p class="empty-state__title">Aucune donnée horaire</p>
        <p class="empty-state__desc">La colonne "Heure" est absente ou vide dans votre fichier.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const metric = state.heatmapJHMetric || 'impressions';
  const metricKey = metric === 'engagement' ? 'tauxEngagement' : 'impressions';

  const matrix = {};
  let globalMin = Infinity, globalMax = -Infinity;

  JOURS_ORDER.forEach(dayIdx => {
    matrix[dayIdx] = {};
    for (let h = 0; h < 24; h++) {
      const matches = withHeure.filter(d => d.date.getDay() === dayIdx && d.heure === h);
      if (matches.length > 0) {
        const val = avg(matches, metricKey);
        matrix[dayIdx][h] = { value: val, count: matches.length };
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      } else {
        matrix[dayIdx][h] = null;
      }
    }
  });

  const range = globalMax - globalMin || 1;
  const heatColor = cssVar('--color-data-1');

  let html = `<table class="heatmap-jh-table" aria-label="Heatmap jour × heure des meilleures performances">
    <thead><tr><th scope="col">Jour</th>`;
  for (let h = 0; h < 24; h++) {
    html += `<th scope="col">${h}h</th>`;
  }
  html += '</tr></thead><tbody>';

  JOURS_ORDER.forEach(dayIdx => {
    html += `<tr><td scope="row">${JOURS_LABELS[dayIdx]}</td>`;
    for (let h = 0; h < 24; h++) {
      const cell = matrix[dayIdx][h];
      if (cell) {
        const opacity = 0.08 + ((cell.value - globalMin) / range) * 0.72;
        const bg = hexToRgba(heatColor, opacity);
        const isDark = opacity >= 0.4;
        const bgCol = cssVar('--color-bg');
        const textColor  = isDark ? bgCol : cssVar('--color-text');
        const countColor = isDark ? hexToRgba(bgCol, 0.75) : cssVar('--color-text-muted');
        const displayVal = metric === 'engagement' ? fmtPct(cell.value) : fmtK(cell.value);
        html += `<td class="heatmap-jh-cell--value" style="background:${bg};color:${textColor}" title="${cell.count} post${cell.count > 1 ? 's' : ''}">`;
        html += `${escHtml(displayVal)}<span class="heatmap-jh-count" style="color:${countColor}">${cell.count}</span></td>`;
      } else {
        html += `<td class="heatmap-jh-cell--empty">—</td>`;
      }
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}


/* ═══════════════════════════════════════════════════════════════
   TAB 6: COMPARAISON MULTI-ANNÉES
   ═══════════════════════════════════════════════════════════════ */

function renderComparaison(data) {
  const allYears = [...new Set(data.filter(d => d.date).map(d => d.date.getFullYear()))].sort((a, b) => a - b);

  /* Init or prune selected years */
  if (state.compareYears.length === 0 || state.compareYears.every(y => !allYears.includes(y))) {
    state.compareYears = [...allYears];
  } else {
    state.compareYears = state.compareYears.filter(y => allYears.includes(y));
  }

  /* Stable color map: year → color, keyed by position in allYears (never changes) */
  const colors = DATA_COLORS();
  const yearColorMap = {};
  allYears.forEach((y, i) => { yearColorMap[y] = colors[i % colors.length]; });

  renderYearPills(allYears, yearColorMap);

  const selected = state.compareYears.slice().sort((a, b) => a - b);
  const hasEnough = selected.length >= 2;

  $('compare-content').hidden = !hasEnough;
  $('compare-empty').hidden = hasEnough;

  if (!hasEnough) return;

  const yearDataMap = {};
  selected.forEach(y => {
    yearDataMap[y] = data.filter(d => d.date && d.date.getFullYear() === y);
  });

  renderCompareKPIs(yearDataMap, selected, yearColorMap);
  renderComparePostsChart(yearDataMap, selected, yearColorMap);
  renderCompareImpressionsChart(yearDataMap, selected, yearColorMap);
  renderComparePerfChart(yearDataMap, selected, yearColorMap);
  renderCompareTrendChart(yearDataMap, selected, yearColorMap);

  const deltaSection = $('compare-delta-section');
  if (selected.length === 2) {
    deltaSection.hidden = false;
    $('compare-delta-title').textContent = `${selected[0]} → ${selected[1]} — Variation`;
    renderCompareDelta(yearDataMap, selected[0], selected[1], yearColorMap);
  } else {
    deltaSection.hidden = true;
  }
}

function renderYearPills(allYears, yearColorMap) {
  const container = $('compare-year-pills');
  container.innerHTML = allYears.map(y => {
    const active = state.compareYears.includes(y) ? 'is-active' : '';
    const color = yearColorMap[y];
    return `<button class="year-pill ${active}" data-year="${y}" style="--pill-color:${color}" aria-pressed="${state.compareYears.includes(y)}">${y}</button>`;
  }).join('');

  container.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const y = Number(btn.dataset.year);
      const idx = state.compareYears.indexOf(y);
      if (idx >= 0) {
        state.compareYears.splice(idx, 1);
      } else {
        state.compareYears.push(y);
      }
      renderComparaison(state.filteredData);
    });
  });
}

function renderCompareKPIs(yearDataMap, years, yearColorMap) {
  $('compare-kpis').innerHTML = years.map(y => {
    const d = yearDataMap[y];
    const color = yearColorMap[y];
    return `
      <div class="compare-year-card">
        <div class="compare-year-card__header">
          <span class="compare-year-card__dot" style="--year-color:${color}"></span>
          <span class="compare-year-card__year">${y}</span>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Publications</p>
          <p class="compare-kpi-item__value">${fmt(d.length)}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Impressions totales</p>
          <p class="compare-kpi-item__value">${fmtK(sum(d, 'impressions'))}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Engagement moy.</p>
          <p class="compare-kpi-item__value">${fmtPct(avg(d, 'tauxEngagement'))}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Taux de clics moy.</p>
          <p class="compare-kpi-item__value">${fmtPct(avg(d, 'tauxClics'))}</p>
        </div>
      </div>`;
  }).join('');
}

function renderComparePostsChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-posts');
  const ctx = $('chart-compare-posts').getContext('2d');
  state.charts['chart-compare-posts'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'Publications',
        data: years.map(y => yearDataMap[y].length),
        backgroundColor: years.map(y => yearColorMap[y]),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => String(items[0].label),
            label: (item) => ` ${item.parsed.y} publication${item.parsed.y > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ beginAtZero: true, ticks: { precision: 0 } }),
      },
    },
  });
}

function renderCompareImpressionsChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-impressions');
  const ctx = $('chart-compare-impressions').getContext('2d');
  state.charts['chart-compare-impressions'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'Impressions moy. / post',
        data: years.map(y => {
          const d = yearDataMap[y];
          return d.length > 0 ? sum(d, 'impressions') / d.length : 0;
        }),
        backgroundColor: years.map(y => yearColorMap[y]),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => String(items[0].label),
            label: (item) => ` ${fmtK(item.parsed.y)} impressions / post`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ beginAtZero: true }),
      },
    },
  });
}

function renderComparePerfChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-perf');
  const allColors = DATA_COLORS();
  const ctx = $('chart-compare-perf').getContext('2d');
  state.charts['chart-compare-perf'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [
        {
          label: 'Engagement moyen (%)',
          data: years.map(y => avg(yearDataMap[y], 'tauxEngagement')),
          backgroundColor: hexToRgba(allColors[0], 0.9),
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Taux de clics moyen (%)',
          data: years.map(y => avg(yearDataMap[y], 'tauxClics')),
          backgroundColor: hexToRgba(allColors[1], 0.9),
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => `Année ${items[0].label}`,
            label: (item) => ` ${item.dataset.label} : ${fmtPct(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => `${v.toFixed(1)} %` },
        }),
      },
    },
  });
}

function renderCompareTrendChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-trend');
  const datasets = years.map((y, i) => {
    const d = yearDataMap[y];
    const color = yearColorMap[y];
    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const rows = d.filter(r => r.date && r.date.getMonth() === m);
      return rows.length > 0 ? avg(rows, 'tauxEngagement') : null;
    });
    return {
      label: String(y),
      data: byMonth,
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      pointStyle: POINT_STYLES[i % POINT_STYLES.length],
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
    };
  });

  const ctx = $('chart-compare-trend').getContext('2d');
  state.charts['chart-compare-trend'] = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => MONTH_LABELS[items[0].dataIndex],
            label: (item) => item.parsed.y !== null
              ? ` ${item.dataset.label} : ${fmtPct(item.parsed.y)}`
              : ` ${item.dataset.label} : —`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => `${v.toFixed(1)} %` },
        }),
      },
    },
  });
}

function renderCompareDelta(yearDataMap, yearA, yearB, yearColorMap) {
  const dA = yearDataMap[yearA];
  const dB = yearDataMap[yearB];

  const metrics = [
    { label: 'Publications',        valA: dA.length,                                           valB: dB.length,                                           fmtFn: fmt    },
    { label: 'Impressions totales', valA: sum(dA, 'impressions'),                               valB: sum(dB, 'impressions'),                               fmtFn: fmtK   },
    { label: 'Impressions / post',  valA: dA.length ? sum(dA, 'impressions') / dA.length : 0,  valB: dB.length ? sum(dB, 'impressions') / dB.length : 0,  fmtFn: fmtK   },
    { label: 'Engagement moyen',    valA: avg(dA, 'tauxEngagement'),                            valB: avg(dB, 'tauxEngagement'),                            fmtFn: fmtPct },
    { label: 'Taux de clics moyen', valA: avg(dA, 'tauxClics'),                                 valB: avg(dB, 'tauxClics'),                                 fmtFn: fmtPct },
    { label: 'Total interactions',  valA: sum(dA, 'totalInteractions'),                         valB: sum(dB, 'totalInteractions'),                         fmtFn: fmt    },
  ];

  const rows = metrics.map(m => {
    const delta = m.valA === 0 ? null : ((m.valB - m.valA) / Math.abs(m.valA)) * 100;
    let deltaHtml;
    if (delta === null) {
      deltaHtml = `<span class="delta-neutral">—</span>`;
    } else {
      const sign = delta >= 0 ? '+' : '';
      const cls = delta > 0.05 ? 'delta-positive' : delta < -0.05 ? 'delta-negative' : 'delta-neutral';
      deltaHtml = `<span class="${cls}">${sign}${delta.toFixed(1)} %</span>`;
    }
    return `<tr>
      <td>${escHtml(m.label)}</td>
      <td class="text-right" style="font-variant-numeric:tabular-nums;font-family:var(--font-mono)">${m.fmtFn(m.valA)}</td>
      <td class="text-right" style="font-variant-numeric:tabular-nums;font-family:var(--font-mono)">${m.fmtFn(m.valB)}</td>
      <td class="text-right">${deltaHtml}</td>
    </tr>`;
  }).join('');

  $('compare-delta-table').innerHTML = `
    <table class="data-table" style="width:100%">
      <thead>
        <tr>
          <th>Métrique</th>
          <th class="text-right" style="color:${yearColorMap[yearA]}">${yearA}</th>
          <th class="text-right" style="color:${yearColorMap[yearB]}">${yearB}</th>
          <th class="text-right">Variation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}


/* ═══════════════════════════════════════════════════════════════
   TAB 7: COMPARAISON THÈMES
   ═══════════════════════════════════════════════════════════════ */

function renderCompareThemes(data) {
  const allThemes = [...new Set(data.filter(d => d.theme && d.theme !== '—').map(d => d.theme))].sort((a, b) => a.localeCompare(b, 'fr'));

  /* Prune invalid selections */
  state.compareThemes = state.compareThemes.filter(t => allThemes.includes(t));

  /* Stable color map: theme → color, keyed by position */
  const colors = DATA_COLORS();
  const themeColorMap = {};
  allThemes.forEach((t, i) => { themeColorMap[t] = colors[i % colors.length]; });

  renderThemePills(allThemes, themeColorMap);

  const selected = state.compareThemes.slice();
  const hasEnough = selected.length === 2;

  $('ct-content').hidden = !hasEnough;
  $('ct-empty').hidden = hasEnough;

  if (!hasEnough) return;

  const themeDataMap = {};
  selected.forEach(t => {
    themeDataMap[t] = data.filter(d => d.theme === t);
  });

  renderCTKPIs(themeDataMap, selected, themeColorMap);
  renderCTPostsChart(themeDataMap, selected, themeColorMap);
  renderCTImpressionsChart(themeDataMap, selected, themeColorMap);
  renderCTPerfChart(themeDataMap, selected, themeColorMap);
  renderCTTrendChart(themeDataMap, selected, themeColorMap);

  $('ct-delta-title').textContent = `${selected[0]} vs ${selected[1]} — Variation`;
  renderCTDelta(themeDataMap, selected[0], selected[1], themeColorMap);
}

function renderThemePills(allThemes, themeColorMap) {
  const container = $('ct-theme-pills');
  container.innerHTML = allThemes.map(t => {
    const active = state.compareThemes.includes(t) ? 'is-active' : '';
    const color = themeColorMap[t];
    return `<button class="year-pill ${active}" data-theme="${escHtml(t)}" style="--pill-color:${color}" aria-pressed="${state.compareThemes.includes(t)}">${escHtml(t)}</button>`;
  }).join('');

  container.querySelectorAll('.year-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.theme;
      const idx = state.compareThemes.indexOf(t);
      if (idx >= 0) {
        state.compareThemes.splice(idx, 1);
      } else {
        if (state.compareThemes.length >= 2) {
          state.compareThemes.shift(); /* FIFO: remove oldest */
        }
        state.compareThemes.push(t);
      }
      renderCompareThemes(state.filteredData);
    });
  });
}

function renderCTKPIs(themeDataMap, themes, themeColorMap) {
  $('ct-kpis').innerHTML = themes.map(t => {
    const d = themeDataMap[t];
    const color = themeColorMap[t];
    return `
      <div class="compare-year-card">
        <div class="compare-year-card__header">
          <span class="compare-year-card__dot" style="--year-color:${color}"></span>
          <span class="compare-year-card__year">${escHtml(t)}</span>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Publications</p>
          <p class="compare-kpi-item__value">${fmt(d.length)}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Impressions totales</p>
          <p class="compare-kpi-item__value">${fmtK(sum(d, 'impressions'))}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Engagement moy.</p>
          <p class="compare-kpi-item__value">${fmtPct(avg(d, 'tauxEngagement'))}</p>
        </div>
        <div class="compare-kpi-item">
          <p class="compare-kpi-item__label">Taux de clics moy.</p>
          <p class="compare-kpi-item__value">${fmtPct(avg(d, 'tauxClics'))}</p>
        </div>
      </div>`;
  }).join('');
}

function renderCTPostsChart(themeDataMap, themes, themeColorMap) {
  destroyChart('chart-ct-posts');
  const ctx = $('chart-ct-posts').getContext('2d');
  state.charts['chart-ct-posts'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: themes,
      datasets: [{
        label: 'Publications',
        data: themes.map(t => themeDataMap[t].length),
        backgroundColor: themes.map(t => themeColorMap[t]),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${item.parsed.y} publication${item.parsed.y > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ beginAtZero: true, ticks: { precision: 0 } }),
      },
    },
  });
}

function renderCTImpressionsChart(themeDataMap, themes, themeColorMap) {
  destroyChart('chart-ct-impressions');
  const ctx = $('chart-ct-impressions').getContext('2d');
  state.charts['chart-ct-impressions'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: themes,
      datasets: [{
        label: 'Impressions moy. / post',
        data: themes.map(t => {
          const d = themeDataMap[t];
          return d.length > 0 ? sum(d, 'impressions') / d.length : 0;
        }),
        backgroundColor: themes.map(t => themeColorMap[t]),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${fmtK(item.parsed.y)} impressions / post`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ beginAtZero: true }),
      },
    },
  });
}

function renderCTPerfChart(themeDataMap, themes, themeColorMap) {
  destroyChart('chart-ct-perf');
  const allColors = DATA_COLORS();
  const ctx = $('chart-ct-perf').getContext('2d');
  state.charts['chart-ct-perf'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: themes,
      datasets: [
        {
          label: 'Engagement moyen (%)',
          data: themes.map(t => avg(themeDataMap[t], 'tauxEngagement')),
          backgroundColor: hexToRgba(allColors[0], 0.9),
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Taux de clics moyen (%)',
          data: themes.map(t => avg(themeDataMap[t], 'tauxClics')),
          backgroundColor: hexToRgba(allColors[1], 0.9),
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => ` ${item.dataset.label} : ${fmtPct(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => `${v.toFixed(1)} %` },
        }),
      },
    },
  });
}

function renderCTTrendChart(themeDataMap, themes, themeColorMap) {
  destroyChart('chart-ct-trend');
  const datasets = themes.map((t, i) => {
    const d = themeDataMap[t];
    const color = themeColorMap[t];
    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const rows = d.filter(r => r.date && r.date.getMonth() === m);
      return rows.length > 0 ? avg(rows, 'tauxEngagement') : null;
    });
    return {
      label: t,
      data: byMonth,
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      pointStyle: POINT_STYLES[i % POINT_STYLES.length],
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
    };
  });

  const ctx = $('chart-ct-trend').getContext('2d');
  state.charts['chart-ct-trend'] = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => MONTH_LABELS[items[0].dataIndex],
            label: (item) => item.parsed.y !== null
              ? ` ${item.dataset.label} : ${fmtPct(item.parsed.y)}`
              : ` ${item.dataset.label} : —`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => `${v.toFixed(1)} %` },
        }),
      },
    },
  });
}

function renderCTDelta(themeDataMap, themeA, themeB, themeColorMap) {
  const dA = themeDataMap[themeA];
  const dB = themeDataMap[themeB];

  const metrics = [
    { label: 'Publications',        valA: dA.length,                                           valB: dB.length,                                           fmtFn: fmt    },
    { label: 'Impressions totales', valA: sum(dA, 'impressions'),                               valB: sum(dB, 'impressions'),                               fmtFn: fmtK   },
    { label: 'Impressions / post',  valA: dA.length ? sum(dA, 'impressions') / dA.length : 0,  valB: dB.length ? sum(dB, 'impressions') / dB.length : 0,  fmtFn: fmtK   },
    { label: 'Engagement moyen',    valA: avg(dA, 'tauxEngagement'),                            valB: avg(dB, 'tauxEngagement'),                            fmtFn: fmtPct },
    { label: 'Taux de clics moyen', valA: avg(dA, 'tauxClics'),                                 valB: avg(dB, 'tauxClics'),                                 fmtFn: fmtPct },
    { label: 'Total interactions',  valA: sum(dA, 'totalInteractions'),                         valB: sum(dB, 'totalInteractions'),                         fmtFn: fmt    },
  ];

  const rows = metrics.map(m => {
    const delta = m.valA === 0 ? null : ((m.valB - m.valA) / Math.abs(m.valA)) * 100;
    let deltaHtml;
    if (delta === null) {
      deltaHtml = `<span class="delta-neutral">—</span>`;
    } else {
      const sign = delta >= 0 ? '+' : '';
      const cls = delta > 0.05 ? 'delta-positive' : delta < -0.05 ? 'delta-negative' : 'delta-neutral';
      deltaHtml = `<span class="${cls}">${sign}${delta.toFixed(1)} %</span>`;
    }
    return `<tr>
      <td>${escHtml(m.label)}</td>
      <td class="text-right" style="font-variant-numeric:tabular-nums;font-family:var(--font-mono)">${m.fmtFn(m.valA)}</td>
      <td class="text-right" style="font-variant-numeric:tabular-nums;font-family:var(--font-mono)">${m.fmtFn(m.valB)}</td>
      <td class="text-right">${deltaHtml}</td>
    </tr>`;
  }).join('');

  $('ct-delta-table').innerHTML = `
    <table class="data-table" style="width:100%">
      <thead>
        <tr>
          <th>Métrique</th>
          <th class="text-right" style="color:${themeColorMap[themeA]}">${escHtml(themeA)}</th>
          <th class="text-right" style="color:${themeColorMap[themeB]}">${escHtml(themeB)}</th>
          <th class="text-right">Variation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}


/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function sum(arr, key)  { return arr.reduce((acc, d) => acc + (d[key] || 0), 0); }
function avg(arr, key)  { return arr.length === 0 ? 0 : sum(arr, key) / arr.length; }

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupBy(arr, key) {
  const map = {};
  arr.forEach(d => {
    const k = d[key];
    if (!map[k]) map[k] = [];
    map[k].push(d);
  });
  return map;
}

function fmt(n)     { return Math.round(n).toLocaleString('fr-FR'); }
function fmtK(n)    {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtPct(n)  { return `${(+n).toFixed(2).replace('.', ',')} %`; }

function formatDisplayDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
