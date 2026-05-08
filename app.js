/* ═══════════════════════════════════════════════════════════════
   LinkedIn Analytics Dashboard V2 — app.js
   100% client-side — no data leaves the browser
   4-tab architecture: Bilan, Matrice, Entonnoir, Laboratoire
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Config ────────────────────────────────────────────────── */
const DEFAULT_DROPBOX_URL = 'https://www.dropbox.com/scl/fi/7o46j9pe859l3i4xlbqws/BDD-Stats-LinkedIn.xlsx?rlkey=qhww9jiegen7lo8qime9pf53k&st=qwb10pmw&dl=0';

/* ─── State ─────────────────────────────────────────────────── */
const state = {
  rawData: [],
  filteredData: [],
  filename: '',
  subscriberData: [],  /* [{ date, abonnes }] — feuille "Abonnés" du fichier Excel */

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

  /* Années tab: mode toggle */
  statsMode: 'tendances',  // 'tendances' | 'compare'

  /* Thèmes tab: mode toggle + selected theme for analyse */
  themeMode:  'analyse',   // 'analyse' | 'compare'
  themeStats: '',          // selected theme in analyse mode

  /* Thèmes -> Analyse: Top/Flop ranking mode */
  tsTopFlopMode: 'normalized', // 'normalized' | 'raw'

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

/* Trouve la feuille "Abonnés" dans le classeur (insensible à la casse / accents) */
function findSubscriberSheet(workbook) {
  const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const target = ['abonnes', 'abonnés', 'subscribers', 'abonne'];
  const name = workbook.SheetNames.find(n => target.includes(normalize(n)));
  return name ? workbook.Sheets[name] : null;
}

/* Parse la feuille abonnés.
   Colonnes attendues : Date | Abo Sponso | Abo Orga | Total Abo
   Rétrocompatible : si les colonnes détaillées sont absentes, tente
   de lire une colonne générique "Abonnés" pour le total. */
function parseSubscriberRows(rows) {
  if (!rows || rows.length === 0) return [];
  const norm = s => String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
  const header = Object.keys(rows[0]);
  const find = (...keys) => header.find(h => keys.some(k => norm(h) === k || norm(h).includes(k)));

  const colDate    = find('date');
  const colSponso  = find('abosponso', 'sponso', 'sponsorise', 'sponsored');
  const colOrga    = find('aboorga', 'orga', 'organique', 'organic');
  const colTotal   = find('totalabo', 'total', 'abonnes', 'subscribers', 'abonne', 'nb');

  if (!colDate || !colTotal) return [];

  return rows
    .map(r => ({
      date:      parseDate(r[colDate]),
      abonnes:   parseNum(r[colTotal]),
      aboSponso: colSponso ? parseNum(r[colSponso]) : null,
      aboOrga:   colOrga   ? parseNum(r[colOrga])   : null,
    }))
    .filter(r => r.date && !isNaN(r.date.getTime()) && r.abonnes > 0)
    .sort((a, b) => a.date - b.date);
}

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
  const str = String(val).replace(/\s/g, '');
  if (str.includes('%')) {
    // Already expressed as a percentage (e.g. "5 %" from CSV exports)
    return parseFloat(str.replace('%', '').replace(',', '.')) || 0;
  }
  // SheetJS returns Excel percentage cells as decimals (0.05 = 5%) — multiply back to %
  return (parseFloat(str.replace(',', '.')) || 0) * 100;
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

function showUrlError(msg) {
  $('url-error').hidden = false;
  $('url-error-msg').textContent = msg;
}

function toDropboxDirectUrl(url) {
  const u = new URL(url.replace('www.dropbox.com', 'dl.dropboxusercontent.com'));
  u.searchParams.delete('dl');
  return u.toString();
}

async function handleUrl(url) {
  $('upload-error').hidden = true;
  $('url-error').hidden = true;
  const btn = $('url-connect-btn');
  btn.disabled = true;
  btn.textContent = 'Chargement…';

  try {
    const directUrl = toDropboxDirectUrl(url.trim());
    const response = await fetch(directUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const subSheet = findSubscriberSheet(workbook);
    const subRows  = subSheet ? XLSX.utils.sheet_to_json(subSheet, { defval: '' }) : [];
    const filename = url.split('/').pop().split('?')[0] || 'dropbox-file.xlsx';
    finalizeParsedData(parseRows(rows), parseSubscriberRows(subRows), filename);
  } catch {
    showUrlError('Impossible de charger le fichier. Vérifiez que le lien est public et valide.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connecter';
  }
}

function finalizeParsedData(data, subscriberData, filename) {
  if (data.length === 0) {
    showUploadError('Aucune ligne valide trouvée. Vérifiez le format du fichier.');
    return;
  }
  state.rawData = data;
  state.filteredData = [...data];
  state.subscriberData = subscriberData || [];
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
        const subSheet = findSubscriberSheet(workbook);
        const subRows  = subSheet ? XLSX.utils.sheet_to_json(subSheet, { defval: '' }) : [];
        finalizeParsedData(parseRows(rows), parseSubscriberRows(subRows), file.name);
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
        finalizeParsedData(parseRows(results.data), [], file.name);
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
  filterDateFrom.addEventListener('change', () => { clearQuickDateActive(); applyFilters(); });
  filterDateTo.addEventListener('change', () => { clearQuickDateActive(); applyFilters(); });
  document.querySelectorAll('.date-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickDateFilter(btn.dataset.preset));
  });
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

  /* Années tab — mode toggle (Tendances / Comparaison) */
  document.querySelectorAll('.sy-mode-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      state.statsMode = btn.dataset.mode;
      renderStatsPanel(state.filteredData);
    });
  });

  /* Années tab — CTA "Comparer →" depuis le chart YTD */
  const gotoCompareBtn = document.getElementById('sy-goto-compare');
  if (gotoCompareBtn) {
    gotoCompareBtn.addEventListener('click', () => {
      state.statsMode = 'compare';
      renderStatsPanel(state.filteredData);
    });
  }

  /* Thèmes tab — mode toggle (Analyse / Comparaison) */
  document.querySelectorAll('.ct-mode-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      state.themeMode = btn.dataset.mode;
      renderThemePanel(state.filteredData);
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

  /* URL connect */
  const urlInput      = $('url-input');
  const urlConnectBtn = $('url-connect-btn');
  if (DEFAULT_DROPBOX_URL) urlInput.value = DEFAULT_DROPBOX_URL;
  urlConnectBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) handleUrl(url);
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') urlConnectBtn.click();
  });

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
  state.subscriberData = [];
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
  state.compareThemes = [];
  state.themeMode  = 'analyse';
  state.themeStats = '';
  state.charts = {};

  $('dashboard-screen').hidden = true;
  $('upload-screen').hidden = false;
  $('file-input').value = '';
}


/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════════════════════════ */

const TAB_META = {
  bilan:            { label: 'Résumé',                      title: 'Synthèse du compte' },
  matrice:          { label: 'La Matrice Stratégique',      title: 'Croisement Thème × Média' },
  entonnoir:        { label: "L'Entonnoir de l'Audience",   title: 'Conversion & Interactions' },
  laboratoire:      { label: 'La Liste',                    title: 'Tops & Flops' },
  statistiques:     { label: 'Années',                      title: 'Tendances annuelles' },
  'compare-themes': { label: 'Thèmes',                      title: 'Analyse & comparaison de thèmes' },
  abonnes:          { label: 'Abonnés',                     title: 'Évolution des abonnés' },
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
    case 'statistiques': renderStatsPanel(data); break;
    case 'compare-themes':  renderThemePanel(data);      break;
    case 'abonnes':         renderAbonnesPanel();        break;
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
  clearQuickDateActive();
  applyFilters();
}

function clearQuickDateActive() {
  document.querySelectorAll('.date-quick-btn').forEach(btn => btn.classList.remove('is-active'));
}

function applyQuickDateFilter(preset) {
  /* Use local date components to avoid UTC timezone shift (toISOString would
     convert midnight local time to the previous day in UTC+ zones). */
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dates = state.rawData.map(d => d.date).filter(Boolean);
  if (dates.length === 0) return;
  const toDate   = new Date();
  const dataMin  = new Date(Math.min(...dates));
  let   fromDate = new Date(toDate);

  if (preset === '30d') {
    fromDate.setDate(fromDate.getDate() - 29);
  } else if (preset === '3m') {
    fromDate.setMonth(fromDate.getMonth() - 3);
    fromDate.setDate(fromDate.getDate() + 1);
  } else if (preset === '1y') {
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    fromDate.setDate(fromDate.getDate() + 1);
  }

  if (fromDate < dataMin) fromDate = dataMin;

  filterDateFrom.value = fmt(fromDate);
  filterDateTo.value   = fmt(toDate);

  clearQuickDateActive();
  document.querySelectorAll(`.date-quick-btn[data-preset="${preset}"]`)
    .forEach(btn => btn.classList.add('is-active'));

  applyFilters();
}


/* ═══════════════════════════════════════════════════════════════
   SHARED CHART HELPERS
   ═══════════════════════════════════════════════════════════════ */

Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
Chart.defaults.font.size = 12;

// Returns a scriptable pointRadius that shows only the last non-null data point
function lastPointRadius(visibleRadius = 4) {
  return (ctx) => {
    const data = ctx.dataset.data;
    let lastIdx = data.length - 1;
    while (lastIdx > 0 && (data[lastIdx] === null || data[lastIdx] === undefined)) lastIdx--;
    return ctx.dataIndex === lastIdx ? visibleRadius : 0;
  };
}

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
          pointStyle: 'circle',
          pointRadius: lastPointRadius(),
          pointHoverRadius: 4,
          tension: 0,
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
  const engValues   = data.map(d => d.tauxEngagement).sort((a, b) => a - b);
  const imprValues  = data.map(d => d.impressions).sort((a, b) => a - b);
  const reactValues = data.map(d => d.reactions).sort((a, b) => a - b);
  const commValues  = data.map(d => d.commentaires).sort((a, b) => a - b);
  const repValues   = data.map(d => d.republis).sort((a, b) => a - b);
  const clicsRawValues = data.map(d => d.clics).sort((a, b) => a - b);
  const clicsValues = data.map(d => d.tauxClics).sort((a, b) => a - b);

  const p10 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.1)] : -Infinity;
  const p90 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.9)] : Infinity;

  const engP10 = p10(engValues),       engP90 = p90(engValues);
  const imprP10 = p10(imprValues),     imprP90 = p90(imprValues);
  const reactP10 = p10(reactValues),   reactP90 = p90(reactValues);
  const commP10 = p10(commValues),     commP90 = p90(commValues);
  const repP10 = p10(repValues),       repP90 = p90(repValues);
  const clicsRawP10 = p10(clicsRawValues), clicsRawP90 = p90(clicsRawValues);
  const clicsP10 = p10(clicsValues),   clicsP90 = p90(clicsValues);

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
      <td class="text-right ${cellClass(row.impressions, imprP10, imprP90)}">${fmt(row.impressions)}</td>
      <td class="text-right ${cellClass(row.reactions, reactP10, reactP90)}">${fmt(row.reactions)}</td>
      <td class="text-right ${cellClass(row.commentaires, commP10, commP90)}">${fmt(row.commentaires)}</td>
      <td class="text-right ${cellClass(row.republis, repP10, repP90)}">${fmt(row.republis)}</td>
      <td class="text-right ${cellClass(row.clics, clicsRawP10, clicsRawP90)}">${fmt(row.clics)}</td>
      <td class="text-right ${cellClass(row.tauxClics, clicsP10, clicsP90)}">${fmtPct(row.tauxClics)}</td>
      <td class="text-right ${cellClass(row.tauxEngagement, engP10, engP90)}">
        <span class="engagement-pill ${engagementClass(row.tauxEngagement)}">
          ${fmtPct(row.tauxEngagement)}
        </span>
      </td>
      <td>${row.media !== '—' ? `<span class="badge badge--neutral">${escHtml(row.media)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
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
      case 'impressions':   return mult * (a.impressions - b.impressions);
      case 'reactions':     return mult * (a.reactions - b.reactions);
      case 'commentaires':  return mult * (a.commentaires - b.commentaires);
      case 'republis':      return mult * (a.republis - b.republis);
      case 'clics':         return mult * (a.clics - b.clics);
      case 'tauxClics':     return mult * (a.tauxClics - b.tauxClics);
      case 'engagement':   return mult * (a.tauxEngagement - b.tauxEngagement);
      default:             return 0;
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   TAB 5: ANNÉES (Tendances + Comparaison)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Builds a stable year→color mapping from DATA_COLORS().
 * Shared by both modes so colors are consistent across Tendances and Comparaison.
 */
function buildYearColorMap(data) {
  const allYears = [...new Set(data.filter(d => d.date).map(d => d.date.getFullYear()))].sort((a, b) => a - b);
  const colors = DATA_COLORS();
  const map = {};
  allYears.forEach((y, i) => { map[y] = colors[i % colors.length]; });
  return { allYears, yearColorMap: map };
}

/**
 * Point d'entrée — dispatche vers renderStatistiques() ou renderComparaison()
 * selon state.statsMode.
 */
function renderStatsPanel(data) {
  renderStatsModeToggle(data);

  const tendancesSection = document.getElementById('sy-tendances');
  const compareSection   = document.getElementById('sy-compare');

  if (state.statsMode === 'tendances') {
    if (tendancesSection) tendancesSection.hidden = false;
    if (compareSection)   compareSection.hidden   = true;
    $('tab-section-title').textContent = 'Tendances annuelles';
    renderStatistiques(data);
  } else {
    if (tendancesSection) tendancesSection.hidden = true;
    if (compareSection)   compareSection.hidden   = false;
    $('tab-section-title').textContent = 'Comparaison multi-années';
    renderComparaison(data);
  }
  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function renderStatsModeToggle(data) {
  const bar = document.getElementById('sy-mode-bar');
  if (!bar) return;

  bar.querySelectorAll('.sy-mode-toggle').forEach(btn => {
    const active = btn.dataset.mode === state.statsMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active);
  });

  /* Badge dynamique sur le bouton Comparaison */
  const badgeEl = document.getElementById('sy-compare-btn-label');
  if (badgeEl && data) {
    const count = state.compareYears.length;
    badgeEl.textContent = count >= 2 ? `Comparaison · ${count}` : 'Comparaison';
  }
}

const MONTH_LABELS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

function renderStatistiques(data) {
  renderYtdCumulChart(data);
  renderYearlyTotalChart(data);
  renderYearlyImpressionsChart(data);
  renderYearlyEngClicksChart(data);
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
  const { yearColorMap } = buildYearColorMap(data);
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

    const color = yearColorMap[year];
    return {
      label: String(year),
      data: trimmed,
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      pointStyle: 'circle',
      pointRadius: lastPointRadius(),
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0,
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
  const { yearColorMap } = buildYearColorMap(data);

  const ctx = $('chart-yearly-total').getContext('2d');
  state.charts['chart-yearly-total'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [{
        label: 'Publications',
        data: counts,
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


function renderYearlyImpressionsChart(data) {
  destroyChart('chart-yearly-impressions');
  if (!data.length) return;

  const byYear = {};
  data.forEach(d => {
    if (!d.date) return;
    const y = d.date.getFullYear();
    if (!byYear[y]) byYear[y] = { total: 0, count: 0 };
    byYear[y].total += (d.impressions || 0);
    byYear[y].count++;
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const totals   = years.map(y => byYear[y].total);
  const averages = years.map(y => Math.round(byYear[y].total / byYear[y].count));

  const [d1, d2] = DATA_COLORS();

  const ctx = $('chart-yearly-impressions').getContext('2d');
  state.charts['chart-yearly-impressions'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [
        {
          label: 'Total impressions',
          type: 'bar',
          data: totals,
          backgroundColor: d1,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Moy. par post',
          type: 'line',
          data: averages,
          borderColor: d2,
          borderWidth: 2,
          backgroundColor: 'transparent',
          pointBackgroundColor: d2,
          pointStyle: 'circle',
          pointRadius: lastPointRadius(),
          pointHoverRadius: 4,
          tension: 0,
          yAxisID: 'y1',
          order: 1,
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
            label: (item) => item.dataset.label === 'Moy. par post'
              ? ` Moy. par post : ${fmt(item.raw)}`
              : ` Total : ${fmtK(item.raw)}`,
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { color: C.muted() } }),
        y: { ...scaleY({ ticks: { callback: (v) => fmtK(v) } }), position: 'left' },
        y1: {
          position: 'right',
          grid:   { display: false },
          border: { display: false },
          ticks:  { color: C.muted(), callback: (v) => fmtK(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderYearlyEngClicksChart(data) {
  destroyChart('chart-yearly-eng-clicks');
  if (!data.length) return;

  const byYear = {};
  data.forEach(d => {
    if (!d.date) return;
    const y = d.date.getFullYear();
    if (!byYear[y]) byYear[y] = { eng: [], clics: [] };
    if (d.tauxEngagement != null) byYear[y].eng.push(d.tauxEngagement);
    if (d.tauxClics     != null) byYear[y].clics.push(d.tauxClics);
  });

  const years   = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const avgEng  = years.map(y => {
    const arr = byYear[y].eng;
    return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
  });
  const avgClics = years.map(y => {
    const arr = byYear[y].clics;
    return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
  });

  const [d1, , d3] = DATA_COLORS();

  const ctx = $('chart-yearly-eng-clicks').getContext('2d');
  state.charts['chart-yearly-eng-clicks'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [
        {
          label: "Taux d'engagement",
          data: avgEng,
          backgroundColor: d1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Taux de clics',
          data: avgClics,
          backgroundColor: d3,
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
            label: (item) => ` ${item.dataset.label} : ${fmtPct(item.raw)}`,
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { color: C.muted() } }),
        y: scaleY({ ticks: { callback: (v) => fmtPct(v) } }),
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
  const { allYears, yearColorMap } = buildYearColorMap(data);

  /* Init or prune selected years */
  if (state.compareYears.length === 0 || state.compareYears.every(y => !allYears.includes(y))) {
    state.compareYears = [...allYears];
  } else {
    state.compareYears = state.compareYears.filter(y => allYears.includes(y));
  }

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

  const deltaSection = $('compare-delta-section');
  if (selected.length === 2) {
    deltaSection.hidden = false;
    $('compare-delta-title').textContent = `${selected[0]} → ${selected[1]} — Variation`;
    renderCompareDelta(yearDataMap, selected[0], selected[1], yearColorMap);
  } else {
    deltaSection.hidden = true;
  }

  renderComparePostsChart(yearDataMap, selected, yearColorMap);
  renderCompareDistImpressionsChart(yearDataMap, selected, yearColorMap);
  renderCompareRadarChart(yearDataMap, selected, yearColorMap);
  renderCompareTrendChart(yearDataMap, selected, yearColorMap);
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
      renderStatsModeToggle(state.filteredData);
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
  if (!years.length) return;

  /* Build monthly counts then cumulative sums for each selected year */
  const datasets = years.map((year, i) => {
    const monthly = new Array(12).fill(0);
    yearDataMap[year].forEach(d => {
      if (d.date) monthly[d.date.getMonth()]++;
    });

    /* Cumulative sum, trimmed at last month with data */
    let lastNonZero = 11;
    while (lastNonZero > 0 && monthly[lastNonZero] === 0) lastNonZero--;
    const cumul = [];
    let acc = 0;
    for (let m = 0; m <= lastNonZero; m++) {
      acc += monthly[m];
      cumul.push(acc);
    }

    const color = yearColorMap[year];
    return {
      label: String(year),
      data: cumul,
      borderColor: color,
      backgroundColor: 'transparent',
      pointBackgroundColor: color,
      pointStyle: 'circle',
      pointRadius: lastPointRadius(),
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0,
    };
  });

  const ctx = $('chart-compare-posts').getContext('2d');
  state.charts['chart-compare-posts'] = new Chart(ctx, {
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
        y: scaleY({ beginAtZero: true, ticks: { color: C.muted(), stepSize: 1, precision: 0 } }),
      },
    },
  });
}

function renderCompareDistImpressionsChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-dist-impressions');

  // One scatter dataset per year (one dot = one post)
  const scatterDatasets = years.map((y, i) => ({
    label: String(y),
    type: 'scatter',
    data: yearDataMap[y].map((post, idx) => ({
      x: i + ((idx % 9) - 4) * 0.07,  // deterministic jitter ±0.28
      y: post.impressions,
      pub: post.publication,
    })),
    backgroundColor: hexToRgba(yearColorMap[y], 0.65),
    borderColor: C.bg(),
    borderWidth: 1,
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  // Average marker: short horizontal dashed segment per year
  const avgDatasets = years.map((y, i) => {
    const mean = yearDataMap[y].length ? sum(yearDataMap[y], 'impressions') / yearDataMap[y].length : 0;
    return {
      label: `_avg_${y}`,
      type: 'line',
      data: [{ x: i - 0.32, y: mean }, { x: i + 0.32, y: mean }],
      borderColor: yearColorMap[y],
      borderWidth: 2.5,
      borderDash: [4, 3],
      pointRadius: 0,
      showLine: true,
      tension: 0,
    };
  });

  const ctx = $('chart-compare-dist-impressions').getContext('2d');
  state.charts['chart-compare-dist-impressions'] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [...scatterDatasets, ...avgDatasets] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          filter: (item) => !item.dataset.label.startsWith('_avg_'),
          callbacks: {
            title: (items) => {
              const raw = items[0].raw;
              return raw.pub ? truncate(raw.pub, 44) : String(years[Math.round(items[0].parsed.x)]);
            },
            label: (item) => ` ${fmtK(item.parsed.y)} impressions`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.7,
          max: years.length - 0.3,
          grid: { display: false },
          border: { display: false },
          ticks: {
            stepSize: 1,
            color: C.muted(),
            callback: (v) => {
              const idx = Math.round(v);
              return years[idx] !== undefined ? String(years[idx]) : '';
            },
          },
        },
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => fmtK(v) },
        }),
      },
    },
  });
}

function renderCompareRadarChart(yearDataMap, years, yearColorMap) {
  destroyChart('chart-compare-radar');

  const radarMetrics = [
    { label: 'Engagement',        getValue: (y) => avg(yearDataMap[y], 'tauxEngagement'),                                                    fmt: fmtPct },
    { label: 'Taux de clics',     getValue: (y) => avg(yearDataMap[y], 'tauxClics'),                                                         fmt: fmtPct },
    { label: 'Impressions/post',  getValue: (y) => yearDataMap[y].length ? sum(yearDataMap[y], 'impressions') / yearDataMap[y].length : 0,   fmt: fmtK   },
    { label: 'Interactions/post', getValue: (y) => avg(yearDataMap[y], 'interactions'),                                                      fmt: (v) => v.toFixed(1) },
  ];

  // Raw values indexed as [metricIndex][yearIndex]
  const rawVals = radarMetrics.map(m => years.map(y => m.getValue(y)));

  // Normalize each metric to 0–100 (winner = 100)
  const normalized = rawVals.map(vals => {
    const maxVal = Math.max(...vals);
    return vals.map(v => maxVal > 0 ? (v / maxVal) * 100 : 0);
  });

  const datasets = years.map((y, yi) => ({
    label: String(y),
    data: radarMetrics.map((_, mi) => normalized[mi][yi]),
    backgroundColor: hexToRgba(yearColorMap[y], 0.15),
    borderColor: yearColorMap[y],
    borderWidth: 2,
    pointBackgroundColor: yearColorMap[y],
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  const ctx = $('chart-compare-radar').getContext('2d');
  state.charts['chart-compare-radar'] = new Chart(ctx, {
    type: 'radar',
    data: { labels: radarMetrics.map(m => m.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => radarMetrics[items[0].dataIndex].label,
            label: (item) => {
              const raw = rawVals[item.dataIndex][item.datasetIndex];
              return ` ${years[item.datasetIndex]} : ${radarMetrics[item.dataIndex].fmt(raw)}`;
            },
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          grid:       { color: C.dataGrid() },
          angleLines: { color: C.dataGrid() },
          ticks:      { display: false, stepSize: 25 },
          pointLabels: {
            color: C.muted(),
            font:  { size: 12, family: "'Geist', system-ui, sans-serif" },
          },
        },
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
      pointStyle: 'circle',
      pointRadius: lastPointRadius(),
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0,
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
  const colorA = yearColorMap[yearA];
  const colorB = yearColorMap[yearB];

  const metrics = [
    { label: 'Publications',        valA: dA.length,                                           valB: dB.length,                                           fmtFn: fmt    },
    { label: 'Impressions totales', valA: sum(dA, 'impressions'),                               valB: sum(dB, 'impressions'),                               fmtFn: fmtK   },
    { label: 'Impressions / post',  valA: dA.length ? sum(dA, 'impressions') / dA.length : 0,  valB: dB.length ? sum(dB, 'impressions') / dB.length : 0,  fmtFn: fmtK   },
    { label: 'Engagement moyen',    valA: avg(dA, 'tauxEngagement'),                            valB: avg(dB, 'tauxEngagement'),                            fmtFn: fmtPct },
    { label: 'Taux de clics moyen', valA: avg(dA, 'tauxClics'),                                 valB: avg(dB, 'tauxClics'),                                 fmtFn: fmtPct },
    { label: 'Total interactions',  valA: sum(dA, 'totalInteractions'),                         valB: sum(dB, 'totalInteractions'),                         fmtFn: fmt    },
  ];

  const rows = metrics.map(m => {
    /* Proportional split bar — minimum 3% per side so it's always visible */
    const total = m.valA + m.valB;
    const pctA  = total > 0 ? Math.max((m.valA / total) * 100, 3) : 50;
    const pctB  = total > 0 ? Math.max((m.valB / total) * 100, 3) : 50;

    /* Advantage badge: who wins and by how much */
    let badgeHtml;
    if (m.valA === 0 && m.valB === 0) {
      badgeHtml = `<span class="ct-adv-badge ct-adv-badge--neutral">—</span>`;
    } else if (Math.abs(m.valA - m.valB) / Math.max(Math.abs(m.valA), Math.abs(m.valB)) <= 0.005) {
      badgeHtml = `<span class="ct-adv-badge ct-adv-badge--neutral">≈ égal</span>`;
    } else if (m.valA >= m.valB) {
      const diff = m.valB === 0 ? 100 : ((m.valA - m.valB) / Math.abs(m.valB)) * 100;
      badgeHtml = `<span class="ct-adv-badge" style="color:${colorA}">${yearA}&nbsp;+${diff.toFixed(1)}&thinsp;%</span>`;
    } else {
      const diff = m.valA === 0 ? 100 : ((m.valB - m.valA) / Math.abs(m.valA)) * 100;
      badgeHtml = `<span class="ct-adv-badge" style="color:${colorB}">${yearB}&nbsp;+${diff.toFixed(1)}&thinsp;%</span>`;
    }

    return `<tr>
      <td class="ct-delta-metric">${escHtml(m.label)}</td>
      <td class="ct-delta-val text-right">${m.fmtFn(m.valA)}</td>
      <td class="ct-delta-split">
        <div class="ct-split-bar">
          <div class="ct-split-bar__seg" style="width:${pctA.toFixed(1)}%;background:${colorA}"></div>
          <div class="ct-split-bar__seg" style="width:${pctB.toFixed(1)}%;background:${colorB}"></div>
        </div>
      </td>
      <td class="ct-delta-val text-right">${m.fmtFn(m.valB)}</td>
      <td class="ct-delta-adv text-right">${badgeHtml}</td>
    </tr>`;
  }).join('');

  $('compare-delta-table').innerHTML = `
    <table class="data-table" style="width:100%">
      <thead>
        <tr>
          <th>Métrique</th>
          <th class="text-right">
            <span class="ct-th-theme" style="--theme-color:${colorA}"><span class="ct-th-dot"></span>${yearA}</span>
          </th>
          <th class="ct-delta-split-th">Répartition</th>
          <th class="text-right">
            <span class="ct-th-theme" style="--theme-color:${colorB}"><span class="ct-th-dot"></span>${yearB}</span>
          </th>
          <th class="text-right">Avantage</th>
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

  /* Fixed colors: theme A = data-1, theme B = data-2 */
  const colors = DATA_COLORS();
  const themeColorMap = {};
  if (state.compareThemes[0]) themeColorMap[state.compareThemes[0]] = colors[0];
  if (state.compareThemes[1]) themeColorMap[state.compareThemes[1]] = colors[1];

  renderCTSelectors(allThemes);

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

  /* Delta table first */
  $('ct-delta-title').textContent = `${selected[0]} vs ${selected[1]} — Variation`;
  renderCTDelta(themeDataMap, selected[0], selected[1], themeColorMap);

  /* Then charts */
  renderCTPostsChart(themeDataMap, selected, themeColorMap);
  renderCTImpressionsChart(themeDataMap, selected, themeColorMap);
  renderCTPerfChart(themeDataMap, selected, themeColorMap);
  renderCTTrendChart(themeDataMap, selected, themeColorMap);
}

function renderCTSelectors(allThemes) {
  const selA = $('ct-theme-a');
  const selB = $('ct-theme-b');
  const swapBtn = $('ct-swap');

  const opts = '<option value="">— Choisir —</option>' +
    allThemes.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');

  selA.innerHTML = opts;
  selB.innerHTML = opts;

  /* Clone FIRST (cloneNode doesn't preserve programmatic .value) */
  const newA = selA.cloneNode(true);
  const newB = selB.cloneNode(true);
  selA.parentNode.replaceChild(newA, selA);
  selB.parentNode.replaceChild(newB, selB);

  /* Restore .value on the clones now in DOM */
  if (state.compareThemes[0] && allThemes.includes(state.compareThemes[0])) {
    newA.value = state.compareThemes[0];
  }
  if (state.compareThemes[1] && allThemes.includes(state.compareThemes[1])) {
    newB.value = state.compareThemes[1];
  }

  /* Change handler — reads state for swap detection, not DOM */
  function handleChange(changedIdx, otherIdx) {
    return (e) => {
      const newVal = e.target.value;
      const otherVal = state.compareThemes[otherIdx] || '';

      if (newVal && newVal === otherVal) {
        /* Swap: give the other dropdown the previous value of this one */
        state.compareThemes[otherIdx] = state.compareThemes[changedIdx] || '';
      }

      state.compareThemes[changedIdx] = newVal;
      state.compareThemes = state.compareThemes.filter(Boolean);
      renderCompareThemes(state.filteredData);
    };
  }

  newA.addEventListener('change', handleChange(0, 1));
  newB.addEventListener('change', handleChange(1, 0));

  /* Swap button */
  const newSwap = swapBtn.cloneNode(true);
  swapBtn.parentNode.replaceChild(newSwap, swapBtn);
  newSwap.addEventListener('click', () => {
    state.compareThemes = [state.compareThemes[1], state.compareThemes[0]].filter(Boolean);
    renderCompareThemes(state.filteredData);
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

  // One scatter dataset per theme (one dot = one post)
  const scatterDatasets = themes.map((t, i) => ({
    label: t,
    type: 'scatter',
    data: themeDataMap[t].map((post, idx) => ({
      x: i + ((idx % 9) - 4) * 0.07,  // deterministic jitter ±0.28
      y: post.impressions,
      pub: post.publication,
    })),
    backgroundColor: hexToRgba(themeColorMap[t], 0.65),
    borderColor: C.bg(),
    borderWidth: 1,
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  // Average marker: short horizontal segment per theme
  const avgDatasets = themes.map((t, i) => {
    const mean = themeDataMap[t].length ? sum(themeDataMap[t], 'impressions') / themeDataMap[t].length : 0;
    return {
      label: `_avg_${t}`,
      type: 'line',
      data: [{ x: i - 0.32, y: mean }, { x: i + 0.32, y: mean }],
      borderColor: themeColorMap[t],
      borderWidth: 2.5,
      borderDash: [4, 3],
      pointRadius: 0,
      showLine: true,
      tension: 0,
    };
  });

  const ctx = $('chart-ct-impressions').getContext('2d');
  state.charts['chart-ct-impressions'] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [...scatterDatasets, ...avgDatasets] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          filter: (item) => !item.dataset.label.startsWith('_avg_'),
          callbacks: {
            title: (items) => {
              const raw = items[0].raw;
              return raw.pub ? truncate(raw.pub, 44) : themes[Math.round(items[0].parsed.x)];
            },
            label: (item) => ` ${fmtK(item.parsed.y)} impressions`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.7,
          max: themes.length - 0.3,
          grid: { display: false },
          border: { display: false },
          ticks: {
            stepSize: 1,
            color: C.muted(),
            callback: (v) => {
              const idx = Math.round(v);
              return themes[idx] !== undefined ? themes[idx] : '';
            },
          },
        },
        y: scaleY({
          beginAtZero: true,
          ticks: { callback: (v) => fmtK(v) },
        }),
      },
    },
  });
}

function renderCTPerfChart(themeDataMap, themes, themeColorMap) {
  destroyChart('chart-ct-perf');

  const radarMetrics = [
    { label: 'Engagement',       getValue: (t) => avg(themeDataMap[t], 'tauxEngagement'),                                                   fmt: fmtPct },
    { label: 'Taux de clics',    getValue: (t) => avg(themeDataMap[t], 'tauxClics'),                                                        fmt: fmtPct },
    { label: 'Impressions/post', getValue: (t) => themeDataMap[t].length ? sum(themeDataMap[t], 'impressions') / themeDataMap[t].length : 0, fmt: fmtK   },
    { label: 'Interactions/post',getValue: (t) => avg(themeDataMap[t], 'interactions'),                                                     fmt: (v) => v.toFixed(1) },
  ];

  // Raw values indexed as [metricIndex][themeIndex]
  const rawVals = radarMetrics.map(m => themes.map(t => m.getValue(t)));

  // Normalize each metric to 0–100 (winner = 100)
  const normalized = rawVals.map(vals => {
    const maxVal = Math.max(...vals);
    return vals.map(v => maxVal > 0 ? (v / maxVal) * 100 : 0);
  });

  const datasets = themes.map((t, ti) => ({
    label: t,
    data: radarMetrics.map((_, mi) => normalized[mi][ti]),
    backgroundColor: hexToRgba(themeColorMap[t], 0.15),
    borderColor: themeColorMap[t],
    borderWidth: 2,
    pointBackgroundColor: themeColorMap[t],
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  const ctx = $('chart-ct-perf').getContext('2d');
  state.charts['chart-ct-perf'] = new Chart(ctx, {
    type: 'radar',
    data: { labels: radarMetrics.map(m => m.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: (items) => radarMetrics[items[0].dataIndex].label,
            label: (item) => {
              const raw = rawVals[item.dataIndex][item.datasetIndex];
              return ` ${themes[item.datasetIndex]} : ${radarMetrics[item.dataIndex].fmt(raw)}`;
            },
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          grid:       { color: C.dataGrid() },
          angleLines: { color: C.dataGrid() },
          ticks:      { display: false, stepSize: 25 },
          pointLabels: {
            color: C.muted(),
            font:  { size: 12, family: "'Geist', system-ui, sans-serif" },
          },
        },
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
      pointStyle: 'circle',
      pointRadius: lastPointRadius(),
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0,
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
  const colorA = themeColorMap[themeA];
  const colorB = themeColorMap[themeB];

  const metrics = [
    { label: 'Publications',        valA: dA.length,                                          valB: dB.length,                                          fmtFn: fmt    },
    { label: 'Impressions totales', valA: sum(dA, 'impressions'),                              valB: sum(dB, 'impressions'),                              fmtFn: fmtK   },
    { label: 'Impressions / post',  valA: dA.length ? sum(dA,'impressions')/dA.length : 0,    valB: dB.length ? sum(dB,'impressions')/dB.length : 0,    fmtFn: fmtK   },
    { label: 'Engagement moyen',    valA: avg(dA, 'tauxEngagement'),                           valB: avg(dB, 'tauxEngagement'),                           fmtFn: fmtPct },
    { label: 'Taux de clics moyen', valA: avg(dA, 'tauxClics'),                                valB: avg(dB, 'tauxClics'),                                fmtFn: fmtPct },
    { label: 'Total interactions',  valA: sum(dA, 'totalInteractions'),                        valB: sum(dB, 'totalInteractions'),                        fmtFn: fmt    },
  ];

  const rows = metrics.map(m => {
    /* Proportional split bar — minimum 3% per side so it's always visible */
    const total = m.valA + m.valB;
    const pctA  = total > 0 ? Math.max((m.valA / total) * 100, 3) : 50;
    const pctB  = total > 0 ? Math.max((m.valB / total) * 100, 3) : 50;

    /* Advantage badge: who wins and by how much */
    let badgeHtml;
    if (m.valA === 0 && m.valB === 0) {
      badgeHtml = `<span class="ct-adv-badge ct-adv-badge--neutral">—</span>`;
    } else if (Math.abs(m.valA - m.valB) / Math.max(Math.abs(m.valA), Math.abs(m.valB)) <= 0.005) {
      badgeHtml = `<span class="ct-adv-badge ct-adv-badge--neutral">≈ égal</span>`;
    } else if (m.valA >= m.valB) {
      const diff = m.valB === 0 ? 100 : ((m.valA - m.valB) / Math.abs(m.valB)) * 100;
      badgeHtml = `<span class="ct-adv-badge" style="color:${colorA}">A&nbsp;+${diff.toFixed(1)}&thinsp;%</span>`;
    } else {
      const diff = m.valA === 0 ? 100 : ((m.valB - m.valA) / Math.abs(m.valA)) * 100;
      badgeHtml = `<span class="ct-adv-badge" style="color:${colorB}">B&nbsp;+${diff.toFixed(1)}&thinsp;%</span>`;
    }

    return `<tr>
      <td class="ct-delta-metric">${escHtml(m.label)}</td>
      <td class="ct-delta-val text-right">${m.fmtFn(m.valA)}</td>
      <td class="ct-delta-split">
        <div class="ct-split-bar">
          <div class="ct-split-bar__seg" style="width:${pctA.toFixed(1)}%;background:${colorA}"></div>
          <div class="ct-split-bar__seg" style="width:${pctB.toFixed(1)}%;background:${colorB}"></div>
        </div>
      </td>
      <td class="ct-delta-val text-right">${m.fmtFn(m.valB)}</td>
      <td class="ct-delta-adv text-right">${badgeHtml}</td>
    </tr>`;
  }).join('');

  $('ct-delta-table').innerHTML = `
    <table class="data-table" style="width:100%">
      <thead>
        <tr>
          <th>Métrique</th>
          <th class="text-right">
            <span class="ct-th-theme" style="--theme-color:${colorA}"><span class="ct-th-dot"></span>${escHtml(themeA)}</span>
          </th>
          <th class="ct-delta-split-th">Répartition</th>
          <th class="text-right">
            <span class="ct-th-theme" style="--theme-color:${colorB}"><span class="ct-th-dot"></span>${escHtml(themeB)}</span>
          </th>
          <th class="text-right">Avantage</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}


/* ═══════════════════════════════════════════════════════════════
   TAB 8: ANALYSE THÈME (mode analyse du panel Thèmes)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Point d'entrée — dispatche vers renderThemeStats() ou renderCompareThemes()
 * selon state.themeMode.
 */
function renderThemePanel(data) {
  renderTSModeToggle();

  const analyseSection = $('ct-analyse');
  const compareSection = $('ct-compare');

  if (state.themeMode === 'analyse') {
    if (analyseSection) analyseSection.hidden = false;
    if (compareSection) compareSection.hidden = true;
    $('tab-section-title').textContent = 'Analyse détaillée d\'un thème';
    renderThemeStats(data);
  } else {
    if (analyseSection) analyseSection.hidden = true;
    if (compareSection) compareSection.hidden = false;
    $('tab-section-title').textContent = 'Comparaison entre thèmes';
    renderCompareThemes(data);
  }
  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function renderTSModeToggle() {
  const bar = $('ct-mode-bar');
  if (!bar) return;
  bar.querySelectorAll('.ct-mode-toggle').forEach(btn => {
    const active = btn.dataset.mode === state.themeMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active);
  });
}

/* ── Orchestrateur mode Analyse ───────────────────────────── */
function renderThemeStats(data) {
  const allThemes = [...new Set(
    data.filter(d => d.theme && d.theme !== '—').map(d => d.theme)
  )].sort((a, b) => a.localeCompare(b, 'fr'));

  renderTSSelector(allThemes);

  const hasTheme = state.themeStats && allThemes.includes(state.themeStats);
  $('ts-empty').hidden   = hasTheme;
  $('ts-content').hidden = !hasTheme;

  if (!hasTheme) return;

  const posts = data.filter(d => d.theme === state.themeStats);

  renderTSKPIs(posts, data);
  renderTSTopFlopBlock(posts, data);
  renderTSScatterChart(posts);
  renderScatterReactionsChart(posts);
  renderTSHourChart(posts);
  renderTSTrendChart(posts);
  renderTSMediaChart(posts);
  renderTSTopFlop(posts);
  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function renderTSSelector(allThemes) {
  const sel = $('ts-theme-select');
  if (!sel) return;

  const prev = state.themeStats;
  const validPrev = allThemes.includes(prev) ? prev : '';

  sel.innerHTML = `<option value="">— Choisir un thème —</option>` +
    allThemes.map(t => `<option value="${escHtml(t)}"${t === validPrev ? ' selected' : ''}>${escHtml(t)}</option>`).join('');

  /* Bind once — remove old listeners by cloning */
  const fresh = sel.cloneNode(true);
  sel.parentNode.replaceChild(fresh, sel);
  fresh.addEventListener('change', () => {
    state.themeStats = fresh.value;
    renderThemeStats(state.filteredData);
  });
}

/* ── KPIs ─────────────────────────────────────────────────── */
function renderTSKPIs(posts, allData) {
  const container = $('ts-kpis');
  if (!container) return;

  const globalAvgImp = avg(allData, 'impressions');
  const globalAvgEng = avg(allData, 'tauxEngagement');
  const globalAvgClic= avg(allData, 'tauxClics');

  const avgImp    = avg(posts, 'impressions');
  const avgEng    = avg(posts, 'tauxEngagement');
  const avgClic   = avg(posts, 'tauxClics');

  function deltaBadge(val, ref, unit = '') {
    if (!ref || ref === 0) return '';
    const diff = ((val - ref) / ref) * 100;
    const abs  = Math.abs(diff).toFixed(1);
    if (diff > 5)  return `<span class="ts-kpi-delta ts-kpi-delta--up">▲ +${abs}% vs global</span>`;
    if (diff < -5) return `<span class="ts-kpi-delta ts-kpi-delta--down">▼ −${abs}% vs global</span>`;
    return `<span class="ts-kpi-delta ts-kpi-delta--neutral">≈ égal au global</span>`;
  }

  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card__header">
        <p class="kpi-card__label">Publications</p>
        <div class="kpi-card__icon"><i data-lucide="file-text" aria-hidden="true"></i></div>
      </div>
      <p class="kpi-card__value">${fmt(posts.length)}</p>
      <p class="kpi-card__sub">posts dans ce thème</p>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__header">
        <p class="kpi-card__label">Impressions / post</p>
        <div class="kpi-card__icon"><i data-lucide="bar-chart-2" aria-hidden="true"></i></div>
      </div>
      <p class="kpi-card__value">${fmtK(avgImp)}</p>
      ${deltaBadge(avgImp, globalAvgImp)}
    </div>
    <div class="kpi-card">
      <div class="kpi-card__header">
        <p class="kpi-card__label">Engagement moyen</p>
        <div class="kpi-card__icon"><i data-lucide="trending-up" aria-hidden="true"></i></div>
      </div>
      <p class="kpi-card__value">${fmtPct(avgEng)}</p>
      ${deltaBadge(avgEng, globalAvgEng)}
    </div>
    <div class="kpi-card">
      <div class="kpi-card__header">
        <p class="kpi-card__label">Taux de clics moyen</p>
        <div class="kpi-card__icon"><i data-lucide="mouse-pointer-click" aria-hidden="true"></i></div>
      </div>
      <p class="kpi-card__value">${fmtPct(avgClic)}</p>
      ${deltaBadge(avgClic, globalAvgClic)}
    </div>
  `;
}

/* ── Scatter : Impressions × Engagement ───────────────────── */
function renderTSScatterChart(posts) {
  destroyChart('chart-ts-scatter');
  const canvas = $('chart-ts-scatter');
  if (!canvas) return;

  const color = DATA_COLORS()[0];

  const scatterData = posts.map(p => ({
    x: p.impressions || 0,
    y: p.tauxEngagement || 0,
    pub: p.publication || '',
    dateStr: p.date ? p.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—',
  }));

  const medImp = median(posts.map(p => p.impressions || 0));
  const medEng = median(posts.map(p => p.tauxEngagement || 0));

  const maxImp = Math.max(...posts.map(p => p.impressions || 0)) * 1.05;
  const maxEng = Math.max(...posts.map(p => p.tauxEngagement || 0)) * 1.1;

  const ctx = canvas.getContext('2d');
  state.charts['chart-ts-scatter'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: state.themeStats,
        data: scatterData,
        backgroundColor: hexToRgba(color, 0.7),
        borderColor: color,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
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
            title: (items) => items[0].raw.dateStr,
            label: (item) => [
              ` ${fmtK(item.raw.x)} impressions  ·  ${fmtPct(item.raw.y)} engagement`,
              ` "${truncate(item.raw.pub, 60)}"`,
            ],
          },
        },
        annotation: {
          annotations: {
            lineVertical: {
              type: 'line',
              xMin: medImp,
              xMax: medImp,
              borderColor: C.border(),
              borderWidth: 1,
              borderDash: [4, 4],
            },
            lineHorizontal: {
              type: 'line',
              yMin: medEng,
              yMax: medEng,
              borderColor: C.border(),
              borderWidth: 1,
              borderDash: [4, 4],
            },
            labelViral: {
              type: 'label',
              xValue: maxImp * 0.95,
              yValue: maxEng * 0.95,
              content: ['Viral'],
              color: C.subtle(),
              font: { size: 11, style: 'italic' },
              textAlign: 'right',
            },
            labelNiche: {
              type: 'label',
              xValue: medImp * 0.08,
              yValue: maxEng * 0.95,
              content: ['Niche'],
              color: C.subtle(),
              font: { size: 11, style: 'italic' },
              textAlign: 'left',
            },
            labelReach: {
              type: 'label',
              xValue: maxImp * 0.95,
              yValue: medEng * 0.1,
              content: ['Reach'],
              color: C.subtle(),
              font: { size: 11, style: 'italic' },
              textAlign: 'right',
            },
            labelFaible: {
              type: 'label',
              xValue: medImp * 0.08,
              yValue: medEng * 0.1,
              content: ['Faible'],
              color: C.subtle(),
              font: { size: 11, style: 'italic' },
              textAlign: 'left',
            },
          },
        },
      },
      scales: {
        x: {
          ...scaleX({ ticks: { callback: (v) => fmtK(v) } }),
          title: { display: true, text: 'Impressions', color: C.muted(), font: { size: 12 } },
          max: maxImp,
        },
        y: {
          ...scaleY({ ticks: { callback: (v) => `${v.toFixed(1)} %` } }),
          title: { display: true, text: 'Engagement (%)', color: C.muted(), font: { size: 12 } },
          max: maxEng,
        },
      },
    },
  });
}

/* ── Scatter : Impressions × Réactions ────────────────────── */
function renderScatterReactionsChart(posts) {
  destroyChart('chart-scatter-reactions');
  const canvas = $('chart-scatter-reactions');
  if (!canvas) return;

  const color = DATA_COLORS()[1];

  const scatterData = posts.map(p => ({
    x: p.impressions || 0,
    y: p.reactions   || 0,
    pub:     p.publication || '',
    dateStr: p.date
      ? p.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—',
  }));

  const medImp  = median(posts.map(p => p.impressions || 0));
  const maxImp  = Math.max(...posts.map(p => p.impressions || 0)) * 1.05;
  const maxReac = Math.max(...posts.map(p => p.reactions   || 0)) * 1.1;

  const ctx = canvas.getContext('2d');
  state.charts['chart-scatter-reactions'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: state.themeStats,
        data: scatterData,
        backgroundColor: hexToRgba(color, 0.7),
        borderColor: color,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
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
            title: (items) => items[0].raw.dateStr,
            label: (item) => [
              ` ${fmtK(item.raw.x)} impressions  ·  ${item.raw.y} réaction${item.raw.y > 1 ? 's' : ''}`,
              ` "${truncate(item.raw.pub, 60)}"`,
            ],
          },
        },
        annotation: {
          annotations: {
            lineVertical: {
              type: 'line',
              xMin: medImp,
              xMax: medImp,
              borderColor: C.border(),
              borderWidth: 1,
              borderDash: [4, 4],
            },
          },
        },
      },
      scales: {
        x: {
          ...scaleX({ ticks: { callback: (v) => fmtK(v) } }),
          title: { display: true, text: 'Impressions', color: C.muted(), font: { size: 12 } },
          max: maxImp,
        },
        y: {
          ...scaleY({ ticks: { precision: 0 } }),
          title: { display: true, text: 'Réactions', color: C.muted(), font: { size: 12 } },
          max: maxReac,
        },
      },
    },
  });
}

/* ── Bar : Meilleure heure ─────────────────────────────────── */
function renderTSHourChart(posts) {
  destroyChart('chart-ts-hour');
  const canvas   = $('chart-ts-hour');
  const fallback = $('ts-hour-fallback');

  const withHour = posts.filter(p => p.heure !== null && p.heure !== undefined);

  if (withHour.length === 0) {
    if (canvas)   canvas.hidden   = true;
    if (fallback) fallback.hidden = false;
    return;
  }
  if (canvas)   canvas.hidden   = false;
  if (fallback) fallback.hidden = true;

  const byHour = {};
  withHour.forEach(p => {
    const h = p.heure;
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(p.tauxEngagement || 0);
  });

  const hours  = Object.keys(byHour).map(Number).sort((a, b) => a - b);
  const values = hours.map(h => avg(byHour[h], 0) || byHour[h].reduce((s, v) => s + v, 0) / byHour[h].length);
  const maxVal = Math.max(...values);

  const baseColor = DATA_COLORS()[0];
  const bgColors  = values.map(v => v === maxVal ? baseColor : hexToRgba(baseColor, 0.35));

  const labels = hours.map(h => `${String(h).padStart(2, '0')}h`);

  const ctx = canvas.getContext('2d');
  state.charts['chart-ts-hour'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Engagement moyen',
        data: values,
        backgroundColor: bgColors,
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
            title: (items) => `${labels[items[0].dataIndex]} — ${byHour[hours[items[0].dataIndex]].length} post(s)`,
            label: (item)  => ` Engagement moyen : ${fmtPct(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ ticks: { callback: (v) => `${v.toFixed(1)} %` } }),
      },
    },
  });
}

/* ── Line : Évolution mensuelle ───────────────────────────── */
function renderTSTrendChart(posts) {
  destroyChart('chart-ts-trend');
  const canvas = $('chart-ts-trend');
  if (!canvas) return;

  const color = DATA_COLORS()[0];

  const byMonth = Array.from({ length: 12 }, (_, m) => {
    const rows = posts.filter(r => r.date && r.date.getMonth() === m);
    return rows.length > 0 ? avg(rows, 'tauxEngagement') : null;
  });

  const ctx = canvas.getContext('2d');
  state.charts['chart-ts-trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'Engagement moyen',
        data: byMonth,
        borderColor: color,
        backgroundColor: 'transparent',
        pointBackgroundColor: color,
        pointStyle: 'circle',
        pointRadius: lastPointRadius(),
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title:  (items) => MONTH_LABELS[items[0].dataIndex],
            label:  (item)  => item.parsed.y !== null
              ? ` Engagement : ${fmtPct(item.parsed.y)}`
              : ' Aucun post ce mois',
          },
        },
      },
      scales: {
        x: scaleX(),
        y: scaleY({ ticks: { callback: (v) => `${v.toFixed(1)} %` } }),
      },
    },
  });
}

/* ── Bar groupé : Performance par média ───────────────────── */
function renderTSMediaChart(posts) {
  destroyChart('chart-ts-media');
  const canvas   = $('chart-ts-media');
  const fallback = $('ts-media-fallback');

  const validPosts = posts.filter(p => p.media && p.media !== '—');
  const mediaTypes = [...new Set(validPosts.map(p => p.media))].sort();

  if (mediaTypes.length < 2) {
    if (canvas)   canvas.hidden   = true;
    if (fallback) fallback.hidden = false;
    return;
  }
  if (canvas)   canvas.hidden   = false;
  if (fallback) fallback.hidden = true;

  const colors = DATA_COLORS();
  const avgImps = mediaTypes.map(m => {
    const group = validPosts.filter(p => p.media === m);
    return avg(group, 'impressions') / 1000;
  });
  const avgEngs = mediaTypes.map(m => {
    const group = validPosts.filter(p => p.media === m);
    return avg(group, 'tauxEngagement');
  });

  const ctx = canvas.getContext('2d');
  state.charts['chart-ts-media'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: mediaTypes,
      datasets: [
        {
          label: 'Impressions moy. (k)',
          data: avgImps,
          backgroundColor: hexToRgba(colors[0], 0.85),
          borderRadius: 4,
          yAxisID: 'yImp',
        },
        {
          label: 'Engagement moy. (%)',
          data: avgEngs,
          backgroundColor: hexToRgba(colors[1], 0.85),
          borderRadius: 4,
          yAxisID: 'yEng',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: legendSpec('top', 'end'),
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            label: (item) => item.datasetIndex === 0
              ? ` Impressions : ${item.parsed.y.toFixed(1)}k`
              : ` Engagement : ${fmtPct(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: scaleX(),
        yImp: {
          ...scaleY({ ticks: { callback: (v) => `${v.toFixed(1)}k` } }),
          position: 'left',
        },
        yEng: {
          ...scaleY({ ticks: { callback: (v) => `${v.toFixed(1)} %` } }),
          position: 'right',
          grid: { display: false },
        },
      },
    },
  });
}

/* ── Leaderboard table for Theme Analysis ────────────────── */
const tsLeaderState = {
  searchQuery: '',
  sortCol: 'engagement',
  sortDir: 'desc',
  page: 1,
  pageSize: 20,
};

/* ── Top 5 / Flop 5 du thème (entre KPIs et premier graphique) ── */
function renderTSTopFlopBlock(posts, allData) {
  const container = $('ts-topflop-block');
  if (!container) return;

  const MIN_IMPRESSIONS = 100;
  const eligible = posts.filter(p => p.impressions >= MIN_IMPRESSIONS);

  if (eligible.length < 2) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i data-lucide="bar-chart-2" aria-hidden="true"></i>
        <p class="empty-state__title">Données insuffisantes</p>
        <p class="empty-state__desc">Il faut au moins 2 publications avec ≥ ${MIN_IMPRESSIONS} impressions pour établir un classement.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
    return;
  }

  /* Médianes d'engagement par média sur l'ensemble du dataset (baseline stable). */
  const medianByMedia = {};
  const byMediaAll = groupBy(allData.filter(p => p.impressions >= MIN_IMPRESSIONS), 'media');
  Object.keys(byMediaAll).forEach(m => {
    medianByMedia[m] = median(byMediaAll[m].map(p => p.tauxEngagement));
  });

  const mode = state.tsTopFlopMode;

  /* Score : soit normalisé par format, soit brut. */
  const scored = eligible.map(p => {
    const baseline = medianByMedia[p.media];
    const ratio = (baseline && baseline > 0) ? (p.tauxEngagement / baseline) : null;
    return {
      ...p,
      _ratio: ratio,
      _score: mode === 'normalized'
        ? (ratio !== null ? ratio : -Infinity)
        : p.tauxEngagement,
    };
  });

  const sorted  = [...scored].sort((a, b) => b._score - a._score);
  const ranked  = mode === 'normalized'
    ? sorted.filter(p => p._ratio !== null)
    : sorted;

  const top5  = ranked.slice(0, Math.min(5, ranked.length));
  const flop5 = ranked.slice(-Math.min(5, ranked.length)).reverse();

  function fmtRatio(r) {
    if (r === null || !isFinite(r)) return '—';
    return `${r.toFixed(2).replace('.', ',')}×`;
  }

  function ratioPillClass(r) {
    if (r === null || !isFinite(r)) return 'engagement-pill--low';
    if (r >= 1.2) return 'engagement-pill--high';
    if (r >= 0.8) return 'engagement-pill--mid';
    return 'engagement-pill--low';
  }

  function buildTable(items, cellClass) {
    const scoreHeader = mode === 'normalized'
      ? 'Score vs format'
      : 'Engagement';
    const headerHelp  = mode === 'normalized'
      ? ' title="Taux d\'engagement du post divisé par la médiane des posts de son média"'
      : '';

    return `<div class="table-wrapper"><table class="data-table">
      <thead><tr>
        <th>Publication</th>
        <th>Média</th>
        <th class="text-right"${headerHelp}>${scoreHeader}</th>
        <th class="text-right">Engagement</th>
        <th class="text-right">Impressions</th>
      </tr></thead>
      <tbody>${items.map(row => {
        const scoreCell = mode === 'normalized'
          ? `<span class="engagement-pill ${ratioPillClass(row._ratio)}">${fmtRatio(row._ratio)}</span>`
          : `<span class="engagement-pill ${engagementClass(row.tauxEngagement)}">${fmtPct(row.tauxEngagement)}</span>`;
        return `
        <tr>
          <td class="${cellClass}"><span class="pub-title" title="${escHtml(row.publication)}">${escHtml(truncate(row.publication, 35))}</span></td>
          <td class="${cellClass}">${row.media !== '—' ? `<span class="badge badge--neutral">${escHtml(row.media)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
          <td class="text-right ${cellClass}">${scoreCell}</td>
          <td class="text-right ${cellClass}">${fmtPct(row.tauxEngagement)}</td>
          <td class="text-right ${cellClass}">${fmt(row.impressions)}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  }

  const topLabel  = mode === 'normalized'
    ? 'Top 5 — Sur-performance vs format'
    : 'Top 5 — Meilleur engagement';
  const flopLabel = mode === 'normalized'
    ? 'Flop 5 — Sous-performance vs format'
    : 'Flop 5 — Plus faible engagement';

  container.innerHTML = `
    <div class="tops-flops__col">
      <h4 class="tops-flops__heading tops-flops__heading--top">
        <i data-lucide="arrow-up-circle" aria-hidden="true"></i>
        ${topLabel}
      </h4>
      ${buildTable(top5, 'cell--top')}
    </div>
    <div class="tops-flops__col">
      <h4 class="tops-flops__heading tops-flops__heading--flop">
        <i data-lucide="arrow-down-circle" aria-hidden="true"></i>
        ${flopLabel}
      </h4>
      ${buildTable(flop5, 'cell--bottom')}
    </div>
  `;

  /* Sync visual state of toggle buttons + bind click (idempotent). */
  document.querySelectorAll('.ts-tf-toggle').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        if (state.tsTopFlopMode === btn.dataset.mode) return;
        state.tsTopFlopMode = btn.dataset.mode;
        const all = state.filteredData;
        const themePosts = all.filter(d => d.theme === state.themeStats);
        renderTSTopFlopBlock(themePosts, all);
      });
    }
  });

  if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': '2' } });
}

function renderTSTopFlop(posts) {
  const container = $('ts-topflop');
  if (!container) return;

  tsLeaderState.searchQuery = '';
  tsLeaderState.page = 1;

  container.innerHTML = `
    <section class="table-section" aria-label="Classement des publications du thème">
      <div class="table-section__header">
        <div class="table-section__title-group">
          <p class="section-label">Classement</p>
          <h2 class="section-title">Toutes les publications</h2>
        </div>
        <div class="table-section__controls">
          <div class="search-field">
            <i data-lucide="search" aria-hidden="true"></i>
            <input
              type="search"
              id="ts-table-search"
              class="search-field__input"
              placeholder="Rechercher une publication…"
              aria-label="Rechercher dans les publications"
            />
          </div>
          <span class="table-count" id="ts-table-count"></span>
        </div>
      </div>

      <div class="table-wrapper" role="region" aria-label="Tableau scrollable">
        <table class="data-table" id="ts-posts-table" aria-label="Publications du thème">
          <thead>
            <tr>
              <th class="sortable" data-col="date" tabindex="0" aria-sort="none">
                Date <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable col-pub" data-col="publication" tabindex="0" aria-sort="none">
                Publication <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="impressions" tabindex="0" aria-sort="none">
                Impressions <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="reactions" tabindex="0" aria-sort="none">
                Réactions <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="commentaires" tabindex="0" aria-sort="none">
                Commentaires <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="republis" tabindex="0" aria-sort="none">
                Republi. <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="clics" tabindex="0" aria-sort="none">
                Clics <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="tauxClics" tabindex="0" aria-sort="none">
                Tx Clics <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th class="sortable text-right" data-col="engagement" tabindex="0" aria-sort="none">
                Engagement <span class="sort-icon" aria-hidden="true">↕</span>
              </th>
              <th>Média</th>
            </tr>
          </thead>
          <tbody id="ts-table-body"></tbody>
        </table>
      </div>

      <div class="empty-state" id="ts-table-empty" hidden>
        <i data-lucide="search-x" aria-hidden="true"></i>
        <p class="empty-state__title">Aucun résultat</p>
        <p class="empty-state__desc">Aucune publication ne correspond à votre recherche.</p>
        <button type="button" class="btn btn--secondary btn--sm" id="ts-clear-search-btn">
          Réinitialiser la recherche
        </button>
      </div>

      <div class="pagination" id="ts-pagination">
        <span class="pagination__info" id="ts-pagination-info"></span>
        <div class="pagination__controls">
          <button type="button" class="btn btn--ghost btn--sm" id="ts-page-prev" disabled aria-label="Page précédente">
            <i data-lucide="chevron-left" aria-hidden="true"></i>
          </button>
          <span class="pagination__current" id="ts-pagination-current"></span>
          <button type="button" class="btn btn--ghost btn--sm" id="ts-page-next" aria-label="Page suivante">
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>`;

  const searchInput = document.getElementById('ts-table-search');
  const clearBtn    = document.getElementById('ts-clear-search-btn');
  const prevBtn     = document.getElementById('ts-page-prev');
  const nextBtn     = document.getElementById('ts-page-next');

  searchInput.addEventListener('input', () => {
    tsLeaderState.searchQuery = searchInput.value;
    tsLeaderState.page = 1;
    renderTSTable(posts);
  });

  clearBtn.addEventListener('click', () => {
    tsLeaderState.searchQuery = '';
    searchInput.value = '';
    tsLeaderState.page = 1;
    renderTSTable(posts);
  });

  prevBtn.addEventListener('click', () => { tsLeaderState.page--; renderTSTable(posts); });
  nextBtn.addEventListener('click', () => { tsLeaderState.page++; renderTSTable(posts); });

  document.querySelectorAll('#ts-posts-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (tsLeaderState.sortCol === col) {
        tsLeaderState.sortDir = tsLeaderState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        tsLeaderState.sortCol = col;
        tsLeaderState.sortDir = 'desc';
      }
      tsLeaderState.page = 1;
      renderTSTable(posts);
    });
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
    });
  });

  renderTSTable(posts);
}

function renderTSTable(posts) {
  const q = tsLeaderState.searchQuery.toLowerCase().trim();

  let data = posts.filter(row => {
    if (!q) return true;
    return (
      (row.publication || '').toLowerCase().includes(q) ||
      (row.media || '').toLowerCase().includes(q)
    );
  });

  data = sortData(data, tsLeaderState.sortCol, tsLeaderState.sortDir);

  const engValues      = data.map(d => d.tauxEngagement).sort((a, b) => a - b);
  const imprValues     = data.map(d => d.impressions).sort((a, b) => a - b);
  const reactValues    = data.map(d => d.reactions).sort((a, b) => a - b);
  const commValues     = data.map(d => d.commentaires).sort((a, b) => a - b);
  const repValues      = data.map(d => d.republis).sort((a, b) => a - b);
  const clicsRawValues = data.map(d => d.clics).sort((a, b) => a - b);
  const clicsValues    = data.map(d => d.tauxClics).sort((a, b) => a - b);

  const p10 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.1)] : -Infinity;
  const p90 = (arr) => arr.length >= 10 ? arr[Math.floor(arr.length * 0.9)] : Infinity;

  const engP10      = p10(engValues),      engP90      = p90(engValues);
  const imprP10     = p10(imprValues),     imprP90     = p90(imprValues);
  const reactP10    = p10(reactValues),    reactP90    = p90(reactValues);
  const commP10     = p10(commValues),     commP90     = p90(commValues);
  const repP10      = p10(repValues),      repP90      = p90(repValues);
  const clicsRawP10 = p10(clicsRawValues), clicsRawP90 = p90(clicsRawValues);
  const clicsP10    = p10(clicsValues),    clicsP90    = p90(clicsValues);

  function cellClass(val, low, high) {
    if (val >= high) return 'cell--top';
    if (val <= low)  return 'cell--bottom';
    return '';
  }

  document.querySelectorAll('#ts-posts-table th.sortable').forEach(th => {
    th.classList.toggle('is-sorted', th.dataset.col === tsLeaderState.sortCol);
    th.setAttribute('aria-sort', th.dataset.col === tsLeaderState.sortCol
      ? (tsLeaderState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = th.dataset.col === tsLeaderState.sortCol
      ? (tsLeaderState.sortDir === 'asc' ? '↑' : '↓') : '↕';
  });

  const total = posts.length;
  document.getElementById('ts-table-count').textContent = q
    ? `${data.length} / ${total} résultat${data.length !== 1 ? 's' : ''}`
    : `${total} publication${total !== 1 ? 's' : ''}`;

  const tableEmpty   = document.getElementById('ts-table-empty');
  const tableWrapper = document.getElementById('ts-table-body').closest('.table-wrapper');
  tableEmpty.hidden = data.length > 0;
  if (tableWrapper) tableWrapper.style.display = data.length === 0 ? 'none' : '';

  const totalPages = Math.max(1, Math.ceil(data.length / tsLeaderState.pageSize));
  if (tsLeaderState.page > totalPages) tsLeaderState.page = totalPages;
  const start    = (tsLeaderState.page - 1) * tsLeaderState.pageSize;
  const end      = Math.min(start + tsLeaderState.pageSize, data.length);
  const pageData = data.slice(start, end);

  document.getElementById('ts-pagination-info').textContent    = data.length > 0 ? `${start + 1}–${end} sur ${data.length}` : '';
  document.getElementById('ts-pagination-current').textContent = data.length > 0 ? `Page ${tsLeaderState.page} / ${totalPages}` : '';
  document.getElementById('ts-page-prev').disabled = tsLeaderState.page <= 1;
  document.getElementById('ts-page-next').disabled = tsLeaderState.page >= totalPages;
  document.getElementById('ts-pagination').style.display = data.length > tsLeaderState.pageSize ? '' : 'none';

  document.getElementById('ts-table-body').innerHTML = pageData.map(row => `
    <tr>
      <td style="white-space:nowrap;font-variant-numeric:tabular-nums;font-family:var(--font-mono);font-size:13px;">
        ${formatDisplayDate(row.date)}
      </td>
      <td class="col-pub">
        <span class="pub-title" title="${escHtml(row.publication)}">
          ${escHtml(row.publication) || '<em style="color:var(--color-text-subtle)">Sans titre</em>'}
        </span>
      </td>
      <td class="text-right ${cellClass(row.impressions, imprP10, imprP90)}">${fmt(row.impressions)}</td>
      <td class="text-right ${cellClass(row.reactions, reactP10, reactP90)}">${fmt(row.reactions)}</td>
      <td class="text-right ${cellClass(row.commentaires, commP10, commP90)}">${fmt(row.commentaires)}</td>
      <td class="text-right ${cellClass(row.republis, repP10, repP90)}">${fmt(row.republis)}</td>
      <td class="text-right ${cellClass(row.clics, clicsRawP10, clicsRawP90)}">${fmt(row.clics)}</td>
      <td class="text-right ${cellClass(row.tauxClics, clicsP10, clicsP90)}">${fmtPct(row.tauxClics)}</td>
      <td class="text-right ${cellClass(row.tauxEngagement, engP10, engP90)}">
        <span class="engagement-pill ${engagementClass(row.tauxEngagement)}">
          ${fmtPct(row.tauxEngagement)}
        </span>
      </td>
      <td>${row.media !== '—' ? `<span class="badge badge--neutral">${escHtml(row.media)}</span>` : '<span style="color:var(--color-text-subtle)">—</span>'}</td>
    </tr>
  `).join('');
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

/* ═══════════════════════════════════════════════════════════════
   TAB — ABONNÉS
   ═══════════════════════════════════════════════════════════════ */

function renderAbonnesPanel() {
  const { dateFrom, dateTo } = state.filters;
  const data = state.subscriberData.filter(d => {
    if (dateFrom && d.date < dateFrom) return false;
    if (dateTo   && d.date > dateTo)   return false;
    return true;
  });
  const empty   = $('abonnes-empty');
  const content = $('abonnes-content');

  if (!data || data.length === 0) {
    empty.hidden   = false;
    content.hidden = true;
    return;
  }
  empty.hidden   = true;
  content.hidden = false;

  /* Format mois court : "janv. 25" */
  const fmtMois = d => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

  /* ── KPIs ── */
  const first   = data[0];
  const last    = data[data.length - 1];
  const gainAbs = last.abonnes - first.abonnes;
  const gainPct = first.abonnes > 0 ? (gainAbs / first.abonnes) * 100 : 0;

  /* Gain moyen mensuel (chaque relevé = 1 mois) */
  const deltas   = data.slice(1).map((d, i) => d.abonnes - data[i].abonnes);
  const avgGain  = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;

  const setAbKPI = (cardId, value, sub) => {
    $(cardId).querySelector('.kpi-card__value').textContent = value;
    const subEl = $(cardId + '-sub');
    if (subEl) subEl.textContent = sub || '';
  };

  /* ── Hero ── */
  $('ab-hero-count').textContent     = fmt(last.abonnes);
  const gainEl                       = $('ab-hero-gain');
  gainEl.textContent                 = (gainAbs >= 0 ? '+' : '') + fmt(gainAbs) + ' abonnés';
  gainEl.style.color                 = gainAbs >= 0 ? cssVar('--color-success') : cssVar('--color-error');
  $('ab-hero-gain-sub').textContent  = `depuis ${fmtMois(first.date)} · ${data.length} relevés`;

  setAbKPI('kpi-ab-pct',
    (gainPct >= 0 ? '+' : '') + gainPct.toFixed(1).replace('.', ',') + '\u202f%',
    `Par rapport au premier relevé (${fmtMois(first.date)})`);
  setAbKPI('kpi-ab-avg',
    (avgGain >= 0 ? '+' : '') + fmt(Math.round(avgGain)),
    `Médiane : ${fmt(Math.round(median(deltas)))} abonnés / mois`);

  /* ── KPIs croisés publications / abonnés ── */
  const postData = state.filteredData;
  const totalImpressions = postData.reduce((a, d) => a + d.impressions, 0);

  const ratioImprAbo = last.abonnes > 0 ? totalImpressions / last.abonnes : 0;
  setAbKPI('kpi-ab-ratio',
    fmtK(Math.round(ratioImprAbo)),
    `${fmtK(totalImpressions)} impressions pour ${fmt(last.abonnes)} abonnés`);

  const convCost = gainAbs > 0 ? Math.round(totalImpressions / gainAbs) : null;
  setAbKPI('kpi-ab-conversion',
    convCost !== null ? fmtK(convCost) : '—',
    convCost !== null
      ? `Impressions nécessaires pour gagner 1 abonné`
      : `Aucune croissance sur la période`);

  /* ── Graphique combiné (évolution + variations) ── */
  renderAbonnesCombined(data, deltas);

  /* ── Bubble : volume impressions × abonnés par mois ── */
  renderAbonnesOverlay(data, postData);
}


function renderAbonnesCombined(subData, deltas) {
  destroyChart('chart-abonnes-combined');
  if (!$('chart-abonnes-combined')) return;

  const fmtMois    = d => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  const [c1, c2]   = DATA_COLORS();
  const errorColor = cssVar('--color-error');

  const labels      = subData.map(d => fmtMois(d.date));
  const abonneVals  = subData.map(d => d.abonnes);
  /* Les deltas ont un élément de moins — on aligne en décalant d'un mois */
  const deltaVals   = [null, ...deltas];
  const deltaColors = deltaVals.map(v => v === null ? 'transparent' : v >= 0 ? c1 : errorColor);

  state.charts['chart-abonnes-combined'] = new Chart($('chart-abonnes-combined'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Variation mensuelle',
          type: 'bar',
          data: deltaVals,
          backgroundColor: deltaColors,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Abonnés',
          type: 'line',
          data: abonneVals,
          borderColor: c2,
          backgroundColor: hexToRgba(c2, 0.08),
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: c2,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1,
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
            title: items => items[0].label,
            label: ctx => {
              if (ctx.dataset.label === 'Abonnés') return `Abonnés : ${fmt(ctx.raw)}`;
              if (ctx.raw === null) return null;
              return `Variation : ${ctx.raw >= 0 ? '+' : ''}${fmt(ctx.raw)} abonnés`;
            },
          },
        },
      },
      scales: {
        x: scaleX({ ticks: { maxRotation: 30, maxTicksLimit: 18 } }),
        y: {
          ...scaleY({ ticks: { callback: v => (v > 0 ? '+' : '') + fmt(v) } }),
          position: 'left',
          title: { display: true, text: 'Variation / mois', color: C.muted(), font: { size: 11 } },
        },
        y1: {
          position: 'right',
          grid:   { display: false },
          border: { display: false },
          ticks:  { color: C.muted(), font: { size: 11 }, callback: v => fmt(v) },
          beginAtZero: false,
          title: { display: true, text: 'Total abonnés', color: C.muted(), font: { size: 11 } },
        },
      },
    },
  });
}

function renderAbonnesOverlay(subData, postData) {
  destroyChart('chart-abonnes-overlay');
  if (!$('chart-abonnes-overlay')) return;

  /* Agréger les impressions des posts par mois */
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const impByMonth = {};
  postData.forEach(d => {
    const k = monthKey(d.date);
    impByMonth[k] = (impByMonth[k] || 0) + d.impressions;
  });

  const fmtMois = d => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

  /* Radius normalisé avec racine carrée pour ne pas écraser les petites valeurs */
  const impressions = subData.map(d => impByMonth[monthKey(d.date)] || 0);
  const maxImp = Math.max(...impressions, 1);
  const toRadius = imp => 5 + Math.sqrt(imp / maxImp) * 26;

  const bubbleData = subData.map((d, i) => ({
    x:           i,
    y:           d.abonnes,
    r:           toRadius(impressions[i]),
    label:       fmtMois(d.date),
    impressions: impressions[i],
  }));

  const [c1] = DATA_COLORS();
  /* Couleur de chaque bulle : plus foncée = plus d'impressions */
  const bubbleColors = bubbleData.map(b =>
    hexToRgba(c1, 0.25 + 0.65 * Math.sqrt((b.impressions || 0) / maxImp))
  );

  state.charts['chart-abonnes-overlay'] = new Chart($('chart-abonnes-overlay'), {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Mois',
        data: bubbleData,
        backgroundColor: bubbleColors,
        borderColor: bubbleColors.map(c => c.replace(/[\d.]+\)$/, '0.9)')),
        borderWidth: 1,
        hoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase(),
          callbacks: {
            title: () => '',
            label: ctx => {
              const b = ctx.raw;
              return [
                `  ${b.label}`,
                `  Abonnés : ${fmt(b.y)}`,
                `  Impressions ce mois : ${b.impressions > 0 ? fmt(b.impressions) : '—'}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          grid:   { color: C.dataGrid(), drawTicks: false },
          border: { display: false },
          min: -0.5,
          max: subData.length - 0.5,
          ticks: {
            color: C.muted(),
            font: { size: 11 },
            maxRotation: 30,
            callback: (v) => {
              const i = Math.round(v);
              return subData[i] ? fmtMois(subData[i].date) : '';
            },
            stepSize: 1,
          },
        },
        y: {
          grid:   { color: C.dataGrid(), drawTicks: false },
          border: { display: false },
          ticks:  { color: C.muted(), font: { size: 11 }, callback: v => fmt(v) },
          title: { display: true, text: 'Abonnés', color: C.muted(), font: { size: 11 } },
        },
      },
    },
  });
}



/* ─── Utilities ──────────────────────────────────────────────── */

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
