# Référence Composants UI

## Table des matières
1. [Boutons](#boutons)
2. [Formulaires (Inputs, Selects, Textareas)](#formulaires)
3. [Cartes](#cartes)
4. [Modales & Popovers](#modales--popovers)
5. [Badges & Tags](#badges--tags)
6. [Tableaux](#tableaux)
7. [Navigation](#navigation)
8. [Séparateurs](#séparateurs)
9. [Tab Bar](#tab-bar)
10. [Search Field](#search-field)

---

## Boutons

**Géométrie :** `border-radius: var(--radius-full)` (pill). Font-weight `500`.

### Variantes

| Variante | Fond | Texte | Bordure |
|---|---|---|---|
| Primaire | `var(--color-text)` | `var(--color-bg)` | aucune |
| Secondaire | transparent | `var(--color-text)` | `1px solid var(--color-border)` |
| Ghost | transparent | `var(--color-text-muted)` | aucune |
| Destructif | `var(--color-error)` | `#FFFFFF` | aucune |

### Tailles

| Taille | Height | Padding H | Font |
|---|---|---|---|
| Small | 32px | 12px | 13px |
| Default | 40px | 16px | 14px |
| Large | 48px | 24px | 16px |

### États interactifs (OBLIGATOIRES)

```css
.btn {
  display:        inline-flex;
  align-items:    center;
  gap:            var(--space-2);
  height:         40px;
  padding:        0 var(--space-4);
  border-radius:  var(--radius-full);
  font-size:      14px;
  font-weight:    500;
  font-family:    var(--font-sans);
  border:         none;
  cursor:         pointer;
  transition:     opacity  var(--duration-fast) var(--ease-out),
                  transform var(--duration-fast) var(--ease-out);
}
.btn:hover  { opacity: 0.85; }
.btn:active { transform: scale(0.97); }
.btn:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.btn--primary {
  background: var(--color-text);
  color:      var(--color-bg);
}
.btn--secondary {
  background: transparent;
  color:      var(--color-text);
  border:     1px solid var(--color-border);
}
.btn--ghost {
  background: transparent;
  color:      var(--color-text-muted);
}
.btn--destructive {
  background: var(--color-error);
  color:      #FFFFFF;
}
```

---

## Formulaires

### Input standard

```css
.field { display: flex; flex-direction: column; gap: var(--space-1); }

.field__label {
  font-size:   13px;
  font-weight: 500;
  color:       var(--color-text-muted);
}
/*
 * Fond de l'input — valeur RELATIVE au conteneur parent :
 *   - Input sur fond de page (--color-bg) → légèrement teinté pour ressortir
 *   - Input dans une carte (--color-bg-secondary) → blanc pur pour contraster
 */
.field__input {
  height:        40px;
  padding:       0 var(--space-3);
  background:    var(--color-bg-secondary);  /* contexte par défaut : fond de page */
  border:        1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size:     14px;
  color:         var(--color-text);
  font-family:   var(--font-sans);
  transition:    border-color var(--duration-fast) var(--ease-out),
                 box-shadow   var(--duration-fast) var(--ease-out);
}
.field__input:focus {
  outline:      none;
  border-color: var(--color-border-focus);
  box-shadow:   0 0 0 3px rgba(0,0,0,0.08);
}
/* Dark : box-shadow: 0 0 0 3px rgba(255,255,255,0.1); */

.field__input.is-error { border-color: var(--color-error); box-shadow: 0 0 0 3px rgba(238,0,0,0.1); }
.field__input:disabled { opacity: 0.5; cursor: not-allowed; background: var(--color-bg-tertiary); }

/* Input dans une carte → contraster avec --color-bg-secondary (fond de la carte) */
.card .field__input { background: var(--color-bg); }

.field__error {
  font-size: 12px;
  color:     var(--color-error);
}
```

### HTML de référence

```html
<div class="field">
  <label class="field__label" for="email">Email</label>
  <input class="field__input" type="email" id="email" placeholder="you@example.com">
  <p class="field__error" hidden>Format d'email invalide.</p>
</div>
```

### Règles formulaires
- Labels TOUJOURS visibles au-dessus du champ (jamais placeholder seul).
- `font-size: 13px`, `font-weight: 500`, `margin-bottom: 6px`.

---

## Cartes

```css
.card {
  background:    var(--color-bg-secondary);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding:       var(--space-6);
  box-shadow:    var(--elevation-0);
  transition:    box-shadow var(--duration-base) var(--ease-out),
                 border-color var(--duration-base) var(--ease-out);
}
/* Hover — cartes cliquables UNIQUEMENT */
.card:hover {
  box-shadow:   var(--elevation-1);
  border-color: var(--color-border-strong);
}
.card__label {
  font-size:      12px;
  font-weight:    500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color:          var(--color-text-muted);
  margin-bottom:  var(--space-2);
}
.card__title {
  font-size:      18px;
  font-weight:    600;
  letter-spacing: -0.02em;
  color:          var(--color-text);
  margin-bottom:  var(--space-2);
}
.card__body {
  font-size:   14px;
  color:       var(--color-text-muted);
  line-height: 1.5;
}
```

---

## Modales & Popovers

**Desktop :** modale centrée. **Mobile :** bottom sheet (slide depuis le bas).

```css
/* Overlay */
.modal-overlay {
  background: rgba(0,0,0,0.5);
  backdrop-filter: var(--backdrop);
}

/* Conteneur */
.modal {
  background:    var(--backdrop-bg);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow:    var(--elevation-2);
  animation: modal-in var(--duration-slow) var(--ease-out);
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

/* Bottom sheet — Mobile */
@media (max-width: 768px) {
  .modal {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    animation: sheet-in var(--duration-slow) var(--ease-out);
  }
}
@keyframes sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

### Règles modales
- Focus-trap obligatoire.
- Fermeture avec `Escape`.

---

## Badges & Tags

```css
.badge {
  display:        inline-flex;
  align-items:    center;
  gap:            4px;
  padding:        2px 8px;
  border-radius:  var(--radius-sm);
  font-size:      11px;
  font-weight:    500;
  letter-spacing: 0.02em;
}
.badge--neutral { background: var(--color-bg-tertiary); color: var(--color-text-muted); }
.badge--success { background: rgba(0,112,243,0.08);     color: var(--color-success); }
.badge--error   { background: rgba(238,0,0,0.08);       color: var(--color-error); }
.badge--warning { background: rgba(245,166,35,0.1);     color: var(--color-warning); }
```

---

## Tableaux

```css
.table-container {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-container th {
  background:     var(--color-bg-tertiary);
  font-size:      12px;
  font-weight:    500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color:          var(--color-text-muted);
  padding:        10px 16px;
  text-align:     left;
  border-bottom:  1px solid var(--color-border);
}

.table-container td {
  padding:       12px 16px;
  font-size:     14px;
  border-bottom: 1px solid var(--color-border);
}

.table-container tr:last-child td { border-bottom: none; }
.table-container tr:hover td { background: var(--color-bg-secondary); }
```

---

## Navigation

- **Hauteur :** `64px` desktop, `56px` mobile.
- **Fond :** `var(--backdrop-bg)` + `backdrop-filter: var(--backdrop)`.
- **Bordure basse :** `1px solid var(--color-border)`.
- **Position :** `sticky; top: 0; z-index: 100`.
- **Nav item actif :** `color: var(--color-text)` + indicateur `2px` en bas ou fond `var(--color-bg-tertiary)`.
- **Nav item inactif :** `color: var(--color-text-muted)`.

---

## Séparateurs

```css
hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-6) 0;
}
```

Pour un séparateur avec label centré : utiliser flex + deux `<hr>` de part et d'autre d'un `<span>`.

---

## Tab Bar

```css
/* Conteneur */
.tab-bar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

/* Bouton inactif */
.tab-btn {
  height: 36px;
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out),
              color      var(--duration-fast) var(--ease-out);
}

.tab-btn:hover { color: var(--color-text); background: var(--color-bg-tertiary); }

/* Bouton actif */
.tab-btn.is-active {
  color: var(--color-text);
  background: var(--color-bg);
  box-shadow: var(--elevation-1);  /* seul cas où elevation-1 s'applique sans hover */
}
```

---

## Search Field

Input avec icône incrustée à gauche.

```css
.search-field { position: relative; display: flex; align-items: center; }

/* Icône SVG positionnée en absolu à gauche */
.search-field svg {
  position: absolute;
  left: 10px;
  width: 16px; height: 16px;
  color: var(--color-text-subtle);
  pointer-events: none;
}

.search-field__input {
  height: 36px;
  padding: 0 var(--space-3) 0 34px; /* 34px = espace pour l'icône */
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: 14px;
  color: var(--color-text);
  width: 260px;
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow   var(--duration-fast) var(--ease-out),
              width        var(--duration-base) var(--ease-out); /* exception autorisée — voir règles motion */
}

.search-field__input:focus {
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.08); /* rgba(255,255,255,0.1) en dark */
  width: 320px;
}
```
