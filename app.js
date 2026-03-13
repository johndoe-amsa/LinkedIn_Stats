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


/* ─── Dark mode detection ───────────────────────────────────── */
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const C = {
  primary:     () => isDark() ? '#EDEDED' : '#000000',
  secondary:   () => isDark() ? '#888888' : '#666666',
  tertiary:    () => isDark() ? '#555555' : '#999999',
  border:      () => isDark() ? '#333333' : '#EAEAEA',
  bg:          () => isDark() ? '#000000' : '#FFFFFF',
  bgSecondary: () => isDark() ? '#111111' : '#F2F2F2',
  success:     '#0070F3',
  warning:     '#F5A623',
  error:       '#EE0000',
};

/* Monochrome shades for multi-series charts */
function shades(count) {
  if (isDark()) {
    const base = [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.15, 0.1];
    return Array.from({ length: count }, (_, i) =>
      `rgba(237,237,237,${base[i % base.length]})`
    );
  }
  const base = [1, 0.7, 0.5, 0.35, 0.22, 0.14, 0.1, 0.06];
  return Array.from({ length: count }, (_, i) =>
    `rgba(0,0,0,${base[i % base.length]})`
  );
}

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
  $('nav-filename').textContent = state.filename;

  /* Populate filter dropdowns */
  populateFilter(filterTheme, unique(state.rawData, 'theme'));
  populateFilter(filterMedia, unique(state.rawData, 'media'));
  populateFilter(filterType, unique(state.rawData, 'type'));

  /* Populate podium month dropdown */
  populatePodiumMonths();

  /* Bind filter events */
  filterTheme.addEventListener('change', applyFilters);
  filterMedia.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);
  resetFiltersBtn.addEventListener('click', () => {
    filterTheme.value = '';
    filterMedia.value = '';
    filterType.value = '';
    applyFilters();
  });

  /* Tab events */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* Table events */
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

  /* Sort events */
  document.querySelectorAll('#posts-table th.sortable').forEach(th => {
    th.addEventListener('click', () => onSort(th.dataset.col));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort(th.dataset.col);
      }
    });
  });

  /* Pagination events */
  $('page-prev').addEventListener('click', () => {
    if (state.page > 1) { state.page--; renderLeaderboardTable(); }
  });
  $('page-next').addEventListener('click', () => {
    state.page++;
    renderLeaderboardTable();
  });

  /* Podium month filter */
  $('podium-month').addEventListener('change', (e) => {
    state.podiumMonth = e.target.value;
    renderPodium(state.filteredData);
  });

  /* Stacked engagement toggle */
  document.querySelectorAll('.stacked-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stacked-toggle').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.stackedMode = btn.dataset.mode;
      renderStackedEngagement(state.filteredData);
    });
  });

  /* Dark mode change */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    renderActiveTab();
  });

  /* Initial render */
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
    const label = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
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

  $('nav-count').textContent = `${state.filteredData.length} publication${state.filteredData.length !== 1 ? 's' : ''}`;

  state.page = 1;
  renderActiveTab();
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

  /* Top media */
  const byMedia = groupBy(data, 'media');
  let topMedia = '—';
  let topMediaImpr = 0;
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
  const card = $(cardId);
  const el = card.querySelector('.kpi-card__value');
  el.classList.remove('skeleton');
  el.textContent = value;
}

/* ── Timeline: dual axis (impressions + engagement) ── */
function renderTimelineChart(data) {
  if (data.length === 0) return;

  /* Aggregate by month */
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
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });
  const impressionValues = sorted.map(([, v]) => v.impressions);
  const engagementValues = sorted.map(([, v]) => {
    const s = v.engagements.reduce((a, b) => a + b, 0);
    return +(s / v.engagements.length).toFixed(2);
  });

  /* Range badge */
  if (sorted.length > 1) {
    const [fy, fm] = sorted[0][0].split('-');
    const [ly, lm] = sorted[sorted.length - 1][0].split('-');
    const first = new Date(parseInt(fy), parseInt(fm) - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    const last = new Date(parseInt(ly), parseInt(lm) - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    $('chart-timeline-range').textContent = `${first} → ${last}`;
  }

  const ctx = $('chart-timeline').getContext('2d');
  destroyChart('chart-timeline');

  const color = C.primary();
  const borderColor = C.border();
  const textMuted = C.secondary();

  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, isDark() ? 'rgba(237,237,237,0.12)' : 'rgba(0,0,0,0.07)');
  gradient.addColorStop(1, isDark() ? 'rgba(237,237,237,0)' : 'rgba(0,0,0,0)');

  state.charts['chart-timeline'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Impressions',
          type: 'bar',
          data: impressionValues,
          backgroundColor: isDark() ? 'rgba(237,237,237,0.2)' : 'rgba(0,0,0,0.1)',
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Engagement (%)',
          type: 'line',
          data: engagementValues,
          borderColor: color,
          borderWidth: 2,
          backgroundColor: 'transparent',
          pointBackgroundColor: color,
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
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: textMuted,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { size: 12 },
          },
        },
        tooltip: buildTooltip((items) =>
          items.map(i => {
            if (i.dataset.label === 'Engagement (%)') return `Engagement : ${fmtPct(i.raw)}`;
            return `Impressions : ${fmt(i.raw)}`;
          })
        ),
      },
      scales: {
        x: {
          grid: { color: borderColor, drawTicks: false },
          border: { display: false },
          ticks: { color: textMuted, maxRotation: 0 },
        },
        y: {
          position: 'left',
          grid: { color: borderColor, drawTicks: false },
          border: { display: false },
          ticks: { color: textMuted, callback: (v) => fmtK(v) },
          beginAtZero: true,
        },
        y1: {
          position: 'right',
          grid: { display: false },
          border: { display: false },
          ticks: { color: textMuted, callback: (v) => fmtPct(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

/* ── Funnel ── */
function renderFunnelChart(data) {
  if (data.length === 0) return;

  const totalImpressions = sum(data, 'impressions');
  const totalClics = sum(data, 'clics');
  const totalInteractions = data.reduce((acc, d) => acc + d.interactions, 0);

  const labels = ['Impressions', 'Clics', 'Interactions'];
  const values = [totalImpressions, totalClics, totalInteractions];

  const ctx = $('chart-funnel').getContext('2d');
  destroyChart('chart-funnel');

  const grayShades = isDark()
    ? ['rgba(237,237,237,0.8)', 'rgba(237,237,237,0.4)', 'rgba(237,237,237,0.2)']
    : ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.15)'];

  state.charts['chart-funnel'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: grayShades,
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
        tooltip: buildTooltip((items) => {
          const i = items[0];
          const pct = totalImpressions > 0 ? ((i.raw / totalImpressions) * 100).toFixed(1) : 0;
          return [`${i.label} : ${fmt(i.raw)} (${pct}% du total)`];
        }),
      },
      scales: {
        x: {
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => fmtK(v) },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: C.secondary(), font: { weight: 500 } },
        },
      },
    },
  });
}

/* ── Donut: interactions breakdown ── */
function renderDonutChart(data) {
  if (data.length === 0) return;

  const totalReactions = sum(data, 'reactions');
  const totalCommentaires = sum(data, 'commentaires');
  const totalRepublis = sum(data, 'republis');
  const total = totalReactions + totalCommentaires + totalRepublis;

  const labels = ['Réactions', 'Commentaires', 'Republications'];
  const values = [totalReactions, totalCommentaires, totalRepublis];

  const colors = isDark()
    ? ['#EDEDED', '#666666', '#333333']
    : ['#000000', '#666666', '#CCCCCC'];

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
        tooltip: buildTooltip((items) => {
          const i = items[0];
          const pct = total > 0 ? ((i.raw / total) * 100).toFixed(1) : 0;
          return [`${i.label} : ${fmt(i.raw)} (${pct}%)`];
        }),
      },
    },
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


/* ═══════════════════════════════════════════════════════════════
   TAB 2: PERFORMANCE PAR FORMAT & STRATÉGIE
   ═══════════════════════════════════════════════════════════════ */

function renderPerformance(data) {
  renderEngagementByMedia(data);
  renderImpressionsByType(data);
  renderVideoFocus(data);
  renderScatterPerf(data);
}

/* ── Horizontal bar: engagement by media ── */
function renderEngagementByMedia(data) {
  if (data.length === 0) return;

  const byMedia = groupBy(data, 'media');
  const entries = Object.entries(byMedia)
    .map(([media, rows]) => ({ media, avg: avg(rows, 'tauxEngagement') }))
    .filter(e => e.media !== '—')
    .sort((a, b) => b.avg - a.avg);

  const labels = entries.map(e => e.media);
  const values = entries.map(e => +e.avg.toFixed(2));

  const ctx = $('chart-engagement-media').getContext('2d');
  destroyChart('chart-engagement-media');

  const color = C.primary();

  state.charts['chart-engagement-media'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: "Taux d'engagement moyen (%)",
        data: values,
        backgroundColor: entries.map((_, i) =>
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
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => fmtPct(v) },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: C.secondary() },
        },
      },
    },
  });
}

/* ── Donut: impressions by type ── */
function renderImpressionsByType(data) {
  if (data.length === 0) return;

  const byType = groupBy(data, 'type');
  const entries = Object.entries(byType)
    .map(([type, rows]) => ({ type, impressions: sum(rows, 'impressions') }))
    .filter(e => e.type !== '—')
    .sort((a, b) => b.impressions - a.impressions);

  const labels = entries.map(e => e.type);
  const values = entries.map(e => e.impressions);
  const total = values.reduce((a, b) => a + b, 0);

  const colors = isDark()
    ? ['#EDEDED', '#888888', '#555555', '#333333']
    : ['#000000', '#666666', '#999999', '#CCCCCC'];

  const ctx = $('chart-impressions-type').getContext('2d');
  destroyChart('chart-impressions-type');

  state.charts['chart-impressions-type'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
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
        tooltip: buildTooltip((items) => {
          const i = items[0];
          const pct = total > 0 ? ((i.raw / total) * 100).toFixed(1) : 0;
          return [`${i.label} : ${fmt(i.raw)} (${pct}%)`];
        }),
      },
    },
  });

  /* Custom legend */
  const legend = $('type-donut-legend');
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

/* ── Video focus (conditional) ── */
function renderVideoFocus(data) {
  const videoData = data.filter(d =>
    d.media.toLowerCase().includes('vid')
  );

  const card = $('video-focus-card');
  if (videoData.length === 0) {
    card.hidden = true;
    destroyChart('chart-video-focus');
    return;
  }

  card.hidden = false;

  const sorted = [...videoData].sort((a, b) => a.date - b.date);
  const labels = sorted.map(d => truncate(d.publication, 20));
  const impressions = sorted.map(d => d.impressions);
  const vues = sorted.map(d => d.vues);

  const ctx = $('chart-video-focus').getContext('2d');
  destroyChart('chart-video-focus');

  state.charts['chart-video-focus'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Impressions',
          data: impressions,
          backgroundColor: isDark() ? 'rgba(237,237,237,0.6)' : 'rgba(0,0,0,0.6)',
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Vues',
          data: vues,
          backgroundColor: isDark() ? 'rgba(237,237,237,0.2)' : 'rgba(0,0,0,0.2)',
          borderRadius: 4,
          borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: C.secondary(), usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } },
        },
        tooltip: buildTooltip((items) =>
          items.map(i => `${i.dataset.label} : ${fmt(i.raw)}`)
        ),
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: C.secondary(), maxRotation: 45 },
        },
        y: {
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => fmtK(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

/* ── Scatter: impressions vs engagement ── */
function renderScatterPerf(data) {
  if (data.length === 0) return;

  const byMedia = groupBy(data, 'media');
  const mediaTypes = Object.keys(byMedia).filter(m => m !== '—');
  const s = shades(mediaTypes.length);

  const datasets = mediaTypes.map((media, idx) => ({
    label: media,
    data: byMedia[media].map(d => ({ x: d.impressions, y: d.tauxEngagement })),
    backgroundColor: s[idx],
    borderColor: s[idx],
    pointStyle: POINT_STYLES[idx % POINT_STYLES.length],
    pointRadius: 5,
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
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: C.secondary(),
            usePointStyle: true,
            padding: 16,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
          titleColor: isDark() ? '#EDEDED' : '#000000',
          bodyColor: isDark() ? '#888888' : '#666666',
          borderColor: isDark() ? '#333333' : '#EAEAEA',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: () => '',
            label: (ctx) =>
              `${ctx.dataset.label} — ${fmt(ctx.raw.x)} impr. / ${fmtPct(ctx.raw.y)} eng.`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Impressions', color: C.secondary(), font: { size: 12 } },
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => fmtK(v) },
          beginAtZero: true,
        },
        y: {
          title: { display: true, text: "Taux d'engagement (%)", color: C.secondary(), font: { size: 12 } },
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => fmtPct(v) },
          beginAtZero: true,
        },
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

/* ── Bar: volume by theme ── */
function renderThemeVolume(data) {
  if (data.length === 0) return;

  const byTheme = groupBy(data, 'theme');
  const entries = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({ theme, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  const labels = entries.map(e => e.theme);
  const values = entries.map(e => e.count);

  const ctx = $('chart-theme-volume').getContext('2d');
  destroyChart('chart-theme-volume');

  const color = C.primary();

  state.charts['chart-theme-volume'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Publications',
        data: values,
        backgroundColor: entries.map((_, i) =>
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
      aspectRatio: Math.max(1, Math.min(2, 12 / entries.length)),
      plugins: {
        legend: { display: false },
        tooltip: buildTooltip((items) =>
          items.map(i => `${i.raw} publication${i.raw > 1 ? 's' : ''}`)
        ),
      },
      scales: {
        x: {
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), stepSize: 1 },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: C.secondary() },
        },
      },
    },
  });
}

/* ── Radar: theme comparison ── */
function renderThemeRadar(data) {
  const radarCard = $('radar-card');

  const byTheme = groupBy(data, 'theme');
  const themes = Object.entries(byTheme)
    .filter(([t]) => t !== '—')
    .map(([theme, rows]) => ({
      theme,
      avgClics: avg(rows, 'tauxClics'),
      avgEngagement: avg(rows, 'tauxEngagement'),
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

  /* Normalize impressions to 0-100 scale */
  const maxImpr = Math.max(...themes.map(t => t.avgImpressions));
  const maxClics = Math.max(...themes.map(t => t.avgClics)) || 1;
  const maxEng = Math.max(...themes.map(t => t.avgEngagement)) || 1;

  const s = shades(themes.length);

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
        borderColor: s[i],
        backgroundColor: s[i].replace(/[\d.]+\)$/, '0.1)'),
        borderWidth: 2,
        pointBackgroundColor: s[i],
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.2,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: C.secondary(), usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
          titleColor: isDark() ? '#EDEDED' : '#000000',
          bodyColor: isDark() ? '#888888' : '#666666',
          borderColor: isDark() ? '#333333' : '#EAEAEA',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toFixed(0)}/100`,
          },
        },
      },
      scales: {
        r: {
          angleLines: { color: C.border() },
          grid: { color: C.border() },
          pointLabels: { color: C.secondary(), font: { size: 12 } },
          ticks: { display: false },
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
      count: rows.length,
      avgImpressions: avg(rows, 'impressions'),
      avgCommentaires: avg(rows, 'commentaires'),
      avgRepublis: avg(rows, 'republis'),
      avgEngagement: avg(rows, 'tauxEngagement'),
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  const tbody = $('theme-summary-body');
  tbody.innerHTML = entries.map(e => `
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
        reactions: sum(rows, 'reactions'),
        commentaires: sum(rows, 'commentaires'),
        republis: sum(rows, 'republis'),
      }))
      .filter(e => (e.reactions + e.commentaires + e.republis) > 0)
      .sort((a, b) => (b.reactions + b.commentaires + b.republis) - (a.reactions + a.commentaires + a.republis));
  } else {
    entries = [...data]
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 15)
      .map(d => ({
        label: truncate(d.publication, 25),
        reactions: d.reactions,
        commentaires: d.commentaires,
        republis: d.republis,
      }))
      .filter(e => (e.reactions + e.commentaires + e.republis) > 0);
  }

  const labels = entries.map(e => e.label);
  const totals = entries.map(e => e.reactions + e.commentaires + e.republis);

  const reactPct = entries.map((e, i) => totals[i] > 0 ? (e.reactions / totals[i]) * 100 : 0);
  const commentPct = entries.map((e, i) => totals[i] > 0 ? (e.commentaires / totals[i]) * 100 : 0);
  const republiPct = entries.map((e, i) => totals[i] > 0 ? (e.republis / totals[i]) * 100 : 0);

  const ctx = $('chart-stacked-engagement').getContext('2d');
  destroyChart('chart-stacked-engagement');

  const colors = isDark()
    ? ['#EDEDED', '#666666', '#333333']
    : ['#000000', '#666666', '#CCCCCC'];

  state.charts['chart-stacked-engagement'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Réactions', data: reactPct, backgroundColor: colors[0], borderSkipped: false },
        { label: 'Commentaires', data: commentPct, backgroundColor: colors[1], borderSkipped: false },
        { label: 'Republications', data: republiPct, backgroundColor: colors[2], borderSkipped: false },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: Math.max(1, Math.min(2.5, 15 / entries.length)),
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: C.secondary(), usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
          titleColor: isDark() ? '#EDEDED' : '#000000',
          bodyColor: isDark() ? '#888888' : '#666666',
          borderColor: isDark() ? '#333333' : '#EAEAEA',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          max: 100,
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), callback: (v) => `${v}%` },
        },
        y: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: C.secondary() },
        },
      },
    },
  });
}

/* ── Scatter: clicks vs comments ── */
function renderClicksVsComments(data) {
  if (data.length === 0) return;

  const points = data.map(d => ({
    x: d.clics,
    y: d.commentaires,
    label: truncate(d.publication, 30),
  }));

  const ctx = $('chart-clicks-comments').getContext('2d');
  destroyChart('chart-clicks-comments');

  const dotColor = isDark() ? 'rgba(237,237,237,0.5)' : 'rgba(0,0,0,0.3)';

  state.charts['chart-clicks-comments'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Publications',
        data: points,
        backgroundColor: dotColor,
        borderColor: C.primary(),
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
          backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
          titleColor: isDark() ? '#EDEDED' : '#000000',
          bodyColor: isDark() ? '#888888' : '#666666',
          borderColor: isDark() ? '#333333' : '#EAEAEA',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items) => items[0].raw.label || '',
            label: (ctx) => `${ctx.raw.x} clics / ${ctx.raw.y} commentaires`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Clics', color: C.secondary(), font: { size: 12 } },
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary() },
          beginAtZero: true,
        },
        y: {
          title: { display: true, text: 'Commentaires', color: C.secondary(), font: { size: 12 } },
          grid: { color: C.border(), drawTicks: false },
          border: { display: false },
          ticks: { color: C.secondary(), stepSize: 1 },
          beginAtZero: true,
        },
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
    filtered = data.filter(d => d.date.getFullYear() === y && d.date.getMonth() + 1 === m);
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

  const ranks = ['1er', '2e', '3e'];
  const rankIcons = ['trophy', 'medal', 'award'];

  container.innerHTML = top3.map((post, i) => `
    <div class="podium-card ${i === 0 ? 'podium-card--gold' : ''}">
      <div class="podium-card__rank">
        <i data-lucide="${rankIcons[i]}" aria-hidden="true"></i>
        <span>${ranks[i]}</span>
      </div>
      <p class="podium-card__title" title="${escHtml(post.publication)}">${escHtml(truncate(post.publication, 60))}</p>
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

  /* Sort */
  data = sortData(data, state.sortCol, state.sortDir);

  /* Update sort UI */
  document.querySelectorAll('#posts-table th.sortable').forEach(th => {
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

  const tableWrapper = tableBody.closest('.table-wrapper');
  if (tableWrapper) tableWrapper.style.display = data.length === 0 ? 'none' : '';

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(data.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, data.length);
  const pageData = data.slice(start, end);

  $('pagination-info').textContent = data.length > 0
    ? `${start + 1}–${end} sur ${data.length}`
    : '';
  $('pagination-current').textContent = data.length > 0
    ? `Page ${state.page} / ${totalPages}`
    : '';
  $('page-prev').disabled = state.page <= 1;
  $('page-next').disabled = state.page >= totalPages;
  $('pagination').style.display = data.length > state.pageSize ? '' : 'none';

  /* Render rows */
  tableBody.innerHTML = pageData.map(row => `
    <tr>
      <td style="white-space:nowrap;font-variant-numeric:tabular-nums;font-family:var(--font-mono);font-size:13px;">
        ${formatDisplayDate(row.date)}
      </td>
      <td class="col-pub">
        <span class="pub-title" title="${escHtml(row.publication)}">${escHtml(row.publication) || '<em style="color:var(--color-text-subtle)">Sans titre</em>'}</span>
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

function buildTooltip(linesFn) {
  return {
    backgroundColor: isDark() ? '#1A1A1A' : '#FFFFFF',
    titleColor: isDark() ? '#EDEDED' : '#000000',
    bodyColor: isDark() ? '#888888' : '#666666',
    borderColor: isDark() ? '#333333' : '#EAEAEA',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    displayColors: false,
    callbacks: {
      title: (items) => items[0].label,
      label: (item) => linesFn([item])[0],
    },
  };
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

function groupBy(arr, key) {
  const map = {};
  arr.forEach(d => {
    const k = d[key];
    if (!map[k]) map[k] = [];
    map[k].push(d);
  });
  return map;
}

function fmt(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

function fmtK(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
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
