# Référence Data-Viz — Graphiques & Dashboards

## Règles fondamentales

- Les graphiques sont **toujours** encapsulés dans une carte standard (`.card`).
- Utiliser les couleurs `--color-data-*` en opacité pleine (100%).
- **Pas de dégradés**, pas d'ombres portées sous les courbes.
- Les couleurs data-viz sont **isolées** : jamais pour des textes, boutons, badges, ou fonds de layout.

---

## Couleurs Data-Viz

### Light Mode
| Token | Hex | Usage type |
|---|---|---|
| `--color-data-1` | `#0070F3` | Série principale |
| `--color-data-2` | `#06B6D4` | Série secondaire |
| `--color-data-3` | `#7928CA` | Série 3 |
| `--color-data-4` | `#FF0080` | Série 4 |
| `--color-data-5` | `#FF4D4D` | Série 5 |
| `--color-data-6` | `#F5A623` | Série 6 |
| `--color-data-7` | `#10B981` | Série 7 |
| `--color-data-grid` | `var(--color-border)` | Axes et lignes de repère |

### Dark Mode
Les variantes dark sont déjà dans les tokens `:root`. Elles s'appliquent automatiquement via `prefers-color-scheme: dark`.

---

## Axes et Grilles

- Lignes de fond très discrètes : `stroke: var(--color-data-grid)`, `stroke-width: 1px`.
- Privilégier **uniquement les lignes horizontales** pour alléger la lecture.
- `stroke-dasharray` optionnel pour les lignes secondaires.

---

## Tooltips (Infobulles)

Au survol d'une donnée, le tooltip doit ressembler à une petite modale :
- Fond : `var(--color-bg)`
- Bordure : `var(--color-border-strong)`
- Ombre : `var(--elevation-2)`
- Texte : `12px`, dense
- `border-radius: var(--radius-md)`

---

## Légendes

- Typographie : `12px`, couleur `var(--color-text-muted)`
- Pastille ronde de `8px` reprenant la couleur de la donnée

```css
.chart-legend {
  display: flex;
  gap: var(--space-4);
}
.chart-legend__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--color-text-muted);
}
.chart-legend__item::before {
  content: '';
  display: block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--dot-color);
}
```

### HTML de référence (carte graphique)

```html
<div class="card">
  <div class="card__header">
    <h3 class="card__title">Évolution des revenus</h3>
    <div class="chart-legend">
      <span class="chart-legend__item" style="--dot-color: var(--color-data-1)">Revenus</span>
      <span class="chart-legend__item" style="--dot-color: var(--color-data-2)">Dépenses</span>
    </div>
  </div>
  <div class="chart-container">
    <!-- Canvas ou SVG ici -->
  </div>
</div>
```

```css
.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}
.chart-container {
  height: 240px;
  width: 100%;
}
```
