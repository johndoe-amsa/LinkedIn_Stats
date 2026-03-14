/* ═══════════════════════════════════════════════════════════════
   LinkedIn Analytics Dashboard — app.js
   100% client-side — no data leaves the browser
   5-tab architecture: Overview, Performance, Thematic, Engagement, Leaderboard
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── State ─────────────────────────────────────────────────── */
const state = {
  rawData: [],
  filteredData: [],
  filename: '',

  /* Filters */
  filters: { theme: '', media: '', type: '' },

  /* Active tab */
  activeTab: 'overview',

  /* Leaderboard table */
  searchQuery: '',
  sortCol: 'impressions',
  sortDir: 'desc',
  page: 1,
  pageSize: 20,

  /* Podium month filter */
  podiumMonth: '',

  /* Engagement stacked mode */
  stackedMode: 'theme',

  /* Chart.js instances (keyed by canvas id) */
  charts: {},
};


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
  ];
}

/* UI/chart structural colors (grid, text, border) — toujours monochromes */
const C = {
  text:        () => cssVar('--color-text'),
  muted:       () => cssVar('--color-text-muted'),
  subtle:      () => cssVar('--color-text-subtle'),
  border:      () => cssVar('--color-border'),
  borderStrong:() => cssVar('--color-border-strong'),
  bg:          () => cssVar('--color-bg'),
  bgSecondary: () => cssVar('--color-bg-secondary'),
  dataGrid:    () => cssVar('--color-data-grid'),
};

const POINT_STYLES = ['circle', 'triangle', 'rect', 'rectRot', 'star', 'crossRot'];


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

const tableSearch    = $('table-search');
const tableBody      = $('table-body');
const tableEmpty     = $('table-empty');
const tableCount     = $('table-count');
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
  if (e.target !== browseBtn && !browseBtn.contains(e.target)) fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-dragging');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('is-dragging');
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
  fileInput.value = '';
});

resetBtn.addEventListener('click', resetDashboard);

function resetDashboard() {
  Object.values(state.charts).forEach(c => c && c.destroy());
  state.charts = {};
  state.rawData = [];
  state.filteredData = [];
  state.filename = '';
  state.filters = { theme: '', media: '', type: '' };
  state.activeTab = 'overview';
  state.searchQuery = '';
  state.sortCol = 'impressions';
  state.sortDir = 'desc';
  state.page = 1;
  state.podiumMonth = '';
  state.stackedMode = 'theme';

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
    delimitersToGuess: [';', ',', '\t'],
    complete(results) {
      if (!results.data || results.data.length === 0) {
        showError('Le fichier CSV est vide ou ne contient pas de données lisibles.');
        return;
      }
      const parsed = parseRows(results.data);
      if (parsed.length === 0) {
        showError('Impossible de lire les données. Vérifiez le format du CSV.');
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

function parseRows(rows) {
  return rows
    .map(row => {
      const get = (key) => {
        const found = Object.keys(row).find(k => normalize(k) === normalize(key));
        return found ? row[found] : '';
      };

      const date = parseDate(get('Date'));
      if (!date) return null;

      return {
        publication: clean(get('Publication')),
        date,
        dateRaw: get('Date'),
        impressions: parseNum(get('Impressions')),
        vues: parseNum(get('Vues')),
        reactions: parseNum(get('Reactions')),
        commentaires: parseNum(get('Commentaires')),
        republis: parseNum(get('Republi.')),
        clics: parseNum(get('Clics')),
        tauxClics: parsePct(get('Taux de clics')),
        tauxEngagement: parsePct(get("Taux d'engagement")),
        theme: clean(get('Theme')) || clean(get('Thème')) || '—',
        media: clean(get('Media')) || clean(get('Média')) || '—',
        type: clean(get('Type')) || '—',

        get interactions() {
          return this.reactions + this.commentaires + this.republis;
        },
        get totalInteractions() {
          return this.reactions + this.commentaires + this.republis + this.clics;
        },
      };
    })
    .filter(Boolean);
}

function normalize(str) {
  return str.trim().toLowerCase().replace(/['\u2019]/g, "'").replace(/\s+/g, ' ');
}
function clean(str) { return (str || '').trim(); }

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const d = new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseNum(str) {
  if (!str && str !== 0) return 0;
  const cleaned = String(str).trim().replace(/\s/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
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
  $('nav-filename').textContent = state.filename;

  populateFilter(filterTheme, unique(state.rawData, 'theme'));
  populateFilter(filterMedia, unique(state.rawData, 'media'));
  populateFilter(filterType, unique(state.rawData, 'type'));
  populatePodiumMonths();

  filterTheme.addEventListener('change', applyFilters);
  filterMedia.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);
  resetFiltersBtn.addEventListener('click', () => {
    filterTheme.value = '';
    filterMedia.value = '';
    filterType.value = '';
    applyFilters();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  tableSearch.addEventListener('input', debounce(() => {
    state.searchQuery = tableSearch.value;
    state.page = 1;
    renderLeaderboardTable();
  }, 200));

  clearSearchBtn.addEventListener('click', () => {
    tableSearch.value = '';
    state.searchQuery = '';
    state.page = 1;
    renderLeaderboardTable();
  });

  document.querySelectorAll('#posts-table th.sortable').forEach(th => {
    th.addEventListener('click', () => onSort(th.dataset.col));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(th.dataset.col); }
    });
  });

  $('page-prev').addEventListener('click', () => {
    if (state.page > 1) { state.page--; renderLeaderboardTable(); }
  });
  $('page-next').addEventListener('click', () => {
    state.page++;
    renderLeaderboardTable();
  });

  $('podium-month').addEventListener('change', (e) => {
    state.podiumMonth = e.target.value;
    renderPodium(state.filteredData);
  });

  document.querySelectorAll('.stacked-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stacked-toggle').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.stackedMode = btn.dataset.mode;
      renderStackedEngagement(state.filteredData);
    });
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    renderActiveTab();
  });

  applyFilters();
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function unique(data, key) {
  return [...new Set(data.map(d => d[key]).filter(v => v && v !== '—'))].sort();
}

function populateFilter(select, values) {
  while (select.options.length > 1) select.remove(1);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function populatePodiumMonths() {
  const sel = $('podium-month');
  while (sel.options.length > 1) sel.remove(1);
  const months = new Set();
  state.rawData.forEach(d => {
    months.add(`${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`);
  });
  [...months].sort().reverse().forEach(m => {
    const [y, mo] = m.split('-');
    const label = new Date(parseInt(y), parseInt(mo) - 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    sel.appendChild(opt);
  });
}


/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */

const TAB_META = {
  overview:    { label: 'Vue d\'ensemble', title: 'Tableau de bord' },
  performance: { label: 'Performance',     title: 'Formats & Stratégie' },
  thematic:    { label: 'Thématique',      title: 'Analyse des sujets' },
  engagement:  { label: 'Engagement',      title: 'Qualité des interactions' },
  leaderboard: { label: 'Leaderboard',     title: 'Top Publications' },
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
    case 'overview':    renderOverview(data); break;
    case 'performance': renderPerformance(data); break;
    case 'thematic':    renderThematic(data); break;
    case 'engagement':  renderEngagementTab(data); break;
    case 'leaderboard': renderLeaderboard(data); break;
  }
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}


/* ═══════════════════════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════════════════════ */

function applyFilters() {
  state.filters.theme = filterTheme.value;
  state.filters.media = filterMedia.value;
  state.filters.type = filterType.value;

  state.filteredData = state.rawData.filter(row => {
    if (state.filters.theme && row.theme !== state.filters.theme) return false;
    if (state.filters.media && row.media !== state.filters.media) return false;
    if (state.filters.type && row.type !== state.filters.type) return false;
    return true;
  });

  $('nav-count').textContent =
    `${state.filteredData.length} publication${state.filteredData.length !== 1 ? 's' : ''}`;

  state.page = 1;
  renderActiveTab();
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

/**
 * Tooltip "mini-modal" spec (CLAUDE.md §Data-Viz v2.1)
 * bg: color-bg / border: 1px color-border-strong / 12px dense text
 */
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

/**
 * Legend spec: 12px, color-text-muted, pastilles 8px circles (pointStyle: 'circle')
 */
function legendSpec(position = 'top', align = 'end') {
  return {
    display: true,
    position,
    align,
    labels: {
      color:            C.muted(),
      usePointStyle:    true,
      pointStyle:       'circle',
      font:             { size: 12 },
      padding:          16,
    },
  };
}

/**
 * Axis scale: horizontal grids only (y-axis grid on vertical charts).
 * xAxis → no grid. yAxis → grid using --color-data-grid.
 */
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

/* For horizontal bar charts: value axis is X, category axis is Y */
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


/* ═══════════════════════════════════════════════════════════════
   TAB 1: VUE D'ENSEMBLE
   ═══════════════════════════════════════════════════════════════ */

function renderOverview(data) {
  renderKPIs(data);
  renderTimelineChart(data);
  renderFunnelChart(data);
  renderDonutChart(data);
}

/* ── KPIs ── */
function renderKPIs(data) {
  const count = data.length;
  const totalImpressions = sum(data, 'impressions');
  const avgEngagement = avg(data, 'tauxEngagement');
  const medianEngagement = median(data.map(d => d.tauxEngagement));
  const totalInteractions = data.reduce((acc, d) => acc + d.totalInteractions, 0);

  const byMedia = groupBy(data, 'media');
  let topMedia = '—', topMediaImpr = 0;
  Object.entries(byMedia).forEach(([media, rows]) => {
    const tot = sum(rows, 'impressions');
    if (tot > topMediaImpr) { topMedia = media; topMediaImpr = tot; }
  });

  setKPI('kpi-impressions', fmt(totalImpressions));
  setKPI('kpi-engagement', fmtPct(avgEngagement));
  setKPI('kpi-interactions', fmt(totalInteractions));
  setKPI('kpi-top-media', topMedia);

  $('kpi-posts-count').textContent = count;
  $('kpi-engagement-median').textContent = fmtPct(medianEngagement);
  $('kpi-top-media-sub').textContent = `${fmt(topMediaImpr)} impressions`;
}

function setKPI(cardId, value) {
  const el = $(cardId).querySelector('.kpi-card__value');
  el.classList.remove('skeleton');
  el.textContent = value;
}

/* ── Timeline: dual axis — data-1 bars / data-2 line ── */
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

/* ── Funnel — data-1, data-2, data-3 per stage ── */
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
      aspectRatio: 1.6,
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

/* ── Donut: interactions breakdown — data palette ── */
function renderDonutChart(data) {
  if (data.length === 0) return;

  const totalReactions    = sum(data, 'reactions');
  const totalCommentaires = sum(data, 'commentaires');
  const totalRepublis     = sum(data, 'republis');
  const total = totalReactions + totalCommentaires + totalRepublis;

  const labels = ['Réactions', 'Commentaires', 'Republications'];
  const values = [totalReactions, totalCommentaires, totalRepublis];
  const colors = DATA_COLORS().slice(0, 3);

  const ctx = $('chart-donut').getContext('2d');
  destroyChart('chart-donut');

  state.charts['chart-donut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: C.bg(),
        borderWidth: 3,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return `${fmt(ctx.raw)} — ${pct}%`;
            },
          },
        },
      },
    },
  });

  renderDonutLegend('donut-legend', labels, values, colors, total);
}

function renderDonutLegend(containerId, labels, values, colors, total) {
  const legend = $(containerId);
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


/* ═══════════════════════════════════════════════════════════════
   TAB 2: PERFORMANCE PAR FORMAT & STRATÉGIE
   ═══════════════════════════════════════════════════════════════ */

function renderPerformance(data) {
  renderEngagementByMedia(data);
  renderImpressionsByType(data);
  renderVideoFocus(data);
  renderScatterPerf(data);
}

/* ── Horizontal bar: engagement by media — data palette per bar ── */
function renderEngagementByMedia(data) {
  if (data.length === 0) return;

  const byMedia = groupBy(data, 'media');
  const entries = Object.entries(byMedia)
    .map(([media, rows]) => ({ media, avg: avg(rows, 'tauxEngagement') }))
    .filter(e => e.media !== '—')
    .sort((a, b) => b.avg - a.avg);

  const labels = entries.map(e => e.media);
  const values = entries.map(e => +e.avg.toFixed(2));
  const palette = DATA_COLORS();

  const ctx = $('chart-engagement-media').getContext('2d');
  destroyChart('chart-engagement-media');

  state.charts['chart-engagement-media'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Engagement moyen (%)",
        data: values,
        backgroundColor: entries.map((_, i) => palette[i % palette.length]),
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
        tooltip: buildTooltip((items) => [`Engagement : ${fmtPct(items[0].raw)}`]),
      },
      scales: {
        x: scaleXValue({ ticks: { callback: (v) => fmtPct(v) } }),
        y: scaleYCategory(),
      },
    },
  });
}

/* ── Donut: impressions by type — data palette ── */
function renderImpressionsByType(data) {
  if (data.length === 0) return;

  const byType = groupBy(data, 'type');
  const entries = Object.entries(byType)
    .map(([type, rows]) => ({ type, impressions: sum(rows, 'impressions') }))
    .filter(e => e.type !== '—')
    .sort((a, b) => b.impressions - a.impressions);

  const labels = entries.map(e => e.type);
  const values = entries.map(e => e.impressions);
  const total  = values.reduce((a, b) => a + b, 0);
  const colors = DATA_COLORS().slice(0, labels.length);

  const ctx = $('chart-impressions-type').getContext('2d');
  destroyChart('chart-impressions-type');

  state.charts['chart-impressions-type'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: C.bg(),
        borderWidth: 3,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return `${fmt(ctx.raw)} — ${pct}%`;
            },
          },
        },
      },
    },
  });

  renderDonutLegend('type-donut-legend', labels, values, colors, total);
}

/* ── Video focus (conditional) — data-1/data-2 ── */
function renderVideoFocus(data) {
  const videoData = data.filter(d => d.media.toLowerCase().includes('vid'));
  const card = $('video-focus-card');

  if (videoData.length === 0) {
    card.hidden = true;
    destroyChart('chart-video-focus');
    return;
  }

  card.hidden = false;
  const sorted = [...videoData].sort((a, b) => a.date - b.date);
  const labels      = sorted.map(d => truncate(d.publication, 20));
  const impressions = sorted.map(d => d.impressions);
  const vues        = sorted.map(d => d.vues);
  const [d1, d2]    = DATA_COLORS();

  const ctx = $('chart-video-focus').getContext('2d');
  destroyChart('chart-video-focus');

  state.charts['chart-video-focus'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Impressions', data: impressions, backgroundColor: d1, borderRadius: 4, borderSkipped: false },
        { label: 'Vues',        data: vues,        backgroundColor: d2, borderRadius: 4, borderSkipped: false },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => `${ctx.dataset.label} : ${fmt(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { maxRotation: 45 } }),
        y: scaleY({ ticks: { callback: (v) => fmtK(v) } }),
      },
    },
  });
}

/* ── Scatter: impressions vs engagement — data palette per media ── */
function renderScatterPerf(data) {
  if (data.length === 0) return;

  const byMedia  = groupBy(data, 'media');
  const mediaTypes = Object.keys(byMedia).filter(m => m !== '—');
  const palette  = DATA_COLORS();

  const datasets = mediaTypes.map((media, idx) => ({
    label: media,
    data: byMedia[media].map(d => ({ x: d.impressions, y: d.tauxEngagement })),
    backgroundColor: palette[idx % palette.length],
    borderColor:     palette[idx % palette.length],
    pointStyle:      POINT_STYLES[idx % POINT_STYLES.length],
    pointRadius:     5,
    pointHoverRadius: 8,
  }));

  const ctx = $('chart-scatter-perf').getContext('2d');
  destroyChart('chart-scatter-perf');

  state.charts['chart-scatter-perf'] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: () => '',
            label: (ctx) =>
              `${ctx.dataset.label} — ${fmt(ctx.raw.x)} impr. / ${fmtPct(ctx.raw.y)} eng.`,
          },
        },
      },
      scales: {
        x: scaleY({
          ticks:      { callback: (v) => fmtK(v) },
          title:      { text: 'Impressions' },
          extra:      {},
        }),
        y: scaleY({
          ticks: { callback: (v) => fmtPct(v) },
          title: { text: "Taux d'engagement (%)" },
        }),
      },
    },
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 3: ANALYSE THÉMATIQUE
   ═══════════════════════════════════════════════════════════════ */

function renderThematic(data) {
  renderThemeVolume(data);
  renderThemeRadar(data);
  renderThemeSummaryTable(data);
}

/* ── Bar: volume by theme — data palette per theme ── */
function renderThemeVolume(data) {
  if (data.length === 0) return;

  const byTheme = groupBy(data, 'theme');
  const entries = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({ theme, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  const labels  = entries.map(e => e.theme);
  const values  = entries.map(e => e.count);
  const palette = DATA_COLORS();

  const ctx = $('chart-theme-volume').getContext('2d');
  destroyChart('chart-theme-volume');

  state.charts['chart-theme-volume'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Publications',
        data: values,
        backgroundColor: entries.map((_, i) => palette[i % palette.length]),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: Math.max(1, Math.min(2, 12 / entries.length)),
      plugins: {
        legend: { display: false },
        tooltip: buildTooltip((items) =>
          [`${items[0].raw} publication${items[0].raw > 1 ? 's' : ''}`]
        ),
      },
      scales: {
        x: scaleXValue({ ticks: { stepSize: 1 } }),
        y: scaleYCategory(),
      },
    },
  });
}

/* ── Radar: theme comparison — data palette per theme ── */
function renderThemeRadar(data) {
  const radarCard = $('radar-card');
  const byTheme   = groupBy(data, 'theme');
  const themes    = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({
      theme,
      avgClics:       avg(rows, 'tauxClics'),
      avgEngagement:  avg(rows, 'tauxEngagement'),
      avgImpressions: avg(rows, 'impressions'),
    }))
    .sort((a, b) => b.avgImpressions - a.avgImpressions)
    .slice(0, 6);

  if (themes.length < 3) {
    radarCard.hidden = true;
    destroyChart('chart-theme-radar');
    return;
  }

  radarCard.hidden = false;
  const maxImpr = Math.max(...themes.map(t => t.avgImpressions));
  const maxClics = Math.max(...themes.map(t => t.avgClics)) || 1;
  const maxEng   = Math.max(...themes.map(t => t.avgEngagement)) || 1;

  const palette = DATA_COLORS();
  const ctx = $('chart-theme-radar').getContext('2d');
  destroyChart('chart-theme-radar');

  state.charts['chart-theme-radar'] = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Taux de clics', "Taux d'engagement", 'Impressions'],
      datasets: themes.map((t, i) => ({
        label: t.theme,
        data: [
          (t.avgClics / maxClics) * 100,
          (t.avgEngagement / maxEng) * 100,
          (t.avgImpressions / maxImpr) * 100,
        ],
        borderColor:     palette[i % palette.length],
        backgroundColor: hexToRgba(palette[i % palette.length], 0.1),
        borderWidth: 2,
        pointBackgroundColor: palette[i % palette.length],
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.2,
      plugins: {
        legend: legendSpec('bottom', 'center'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toFixed(0)}/100`,
          },
        },
      },
      scales: {
        r: {
          angleLines:  { color: C.dataGrid() },
          grid:        { color: C.dataGrid() },
          pointLabels: { color: C.muted(), font: { size: 12 } },
          ticks:       { display: false },
          suggestedMin: 0,
          suggestedMax: 100,
        },
      },
    },
  });
}

/* ── Theme summary table ── */
function renderThemeSummaryTable(data) {
  const byTheme = groupBy(data, 'theme');
  const entries = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({
      theme,
      count:           rows.length,
      avgImpressions:  avg(rows, 'impressions'),
      avgCommentaires: avg(rows, 'commentaires'),
      avgRepublis:     avg(rows, 'republis'),
      avgEngagement:   avg(rows, 'tauxEngagement'),
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  $('theme-summary-body').innerHTML = entries.map(e => `
    <tr>
      <td><span class="badge badge--neutral">${escHtml(e.theme)}</span></td>
      <td class="text-right">${e.count}</td>
      <td class="text-right">${fmt(Math.round(e.avgImpressions))}</td>
      <td class="text-right">${e.avgCommentaires.toFixed(1)}</td>
      <td class="text-right">${e.avgRepublis.toFixed(1)}</td>
      <td class="text-right">
        <span class="engagement-pill ${engagementClass(e.avgEngagement)}">
          ${fmtPct(e.avgEngagement)}
        </span>
      </td>
    </tr>
  `).join('');
}


/* ═══════════════════════════════════════════════════════════════
   TAB 4: QUALITÉ DE L'ENGAGEMENT
   ═══════════════════════════════════════════════════════════════ */

function renderEngagementTab(data) {
  renderStackedEngagement(data);
  renderClicksVsComments(data);
}

/* ── Stacked 100% bar — data-1/data-2/data-3 ── */
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

/* ── Scatter: clicks vs comments — data-1 ── */
function renderClicksVsComments(data) {
  if (data.length === 0) return;

  const [d1] = DATA_COLORS();
  const points = data.map(d => ({
    x: d.clics,
    y: d.commentaires,
    label: truncate(d.publication, 30),
  }));

  const ctx = $('chart-clicks-comments').getContext('2d');
  destroyChart('chart-clicks-comments');

  state.charts['chart-clicks-comments'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Publications',
        data: points,
        backgroundColor: hexToRgba(d1, 0.5),
        borderColor:     d1,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => items[0].raw.label || '',
            label: (ctx)   => `${ctx.raw.x} clics / ${ctx.raw.y} commentaires`,
          },
        },
      },
      scales: {
        x: scaleY({
          ticks: { stepSize: 1 },
          title: { text: 'Clics' },
        }),
        y: scaleY({
          ticks: { stepSize: 1 },
          title: { text: 'Commentaires' },
        }),
      },
    },
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 5: LEADERBOARD
   ═══════════════════════════════════════════════════════════════ */

function renderLeaderboard(data) {
  renderPodium(data);
  renderLeaderboardTable();
}

/* ── Podium ── */
function renderPodium(data) {
  let filtered = data;
  if (state.podiumMonth) {
    const [y, m] = state.podiumMonth.split('-').map(Number);
    filtered = data.filter(d =>
      d.date.getFullYear() === y && d.date.getMonth() + 1 === m
    );
  }

  const top3 = [...filtered]
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
    lucide.createIcons({ attrs: { 'stroke-width': '2' } });
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
      <p class="podium-card__date">${formatDisplayDate(post.date)}</p>
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

  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

/* ── Leaderboard Table ── */
function renderLeaderboardTable() {
  const q = state.searchQuery.toLowerCase().trim();

  let data = state.filteredData.filter(row => {
    if (!q) return true;
    return (
      row.publication.toLowerCase().includes(q) ||
      row.theme.toLowerCase().includes(q) ||
      row.media.toLowerCase().includes(q) ||
      row.type.toLowerCase().includes(q)
    );
  });

  data = sortData(data, state.sortCol, state.sortDir);

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
      <td class="text-right">${fmt(row.impressions)}</td>
      <td class="text-right">
        <span class="engagement-pill ${engagementClass(row.tauxEngagement)}">
          ${fmtPct(row.tauxEngagement)}
        </span>
      </td>
      <td class="text-right">${fmt(row.clics)}</td>
      <td class="text-right">${fmt(row.reactions)}</td>
      <td class="text-right">${fmt(row.commentaires)}</td>
      <td class="text-right">${fmt(row.republis)}</td>
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

/**
 * Convert a hex colour to rgba(r,g,b,alpha).
 * Works with 3-digit (#ABC) and 6-digit (#AABBCC) hex strings.
 */
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


/* ─── Boot ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons({ attrs: { 'stroke-width': '2' } });
});
