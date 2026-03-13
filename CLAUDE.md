# Charte Graphique & Standards UI

## 1. Principes Fondamentaux

Six règles qui gouvernent toutes les décisions de design :

1. **Le contenu est roi.** Contraste élevé, la donnée est le point focal. Rien ne doit distraire.
2. **Structure par la grille et le vide.** Système d'espacement strict à base 8px. Aucun bloc de couleur lourd.
3. **Typographie "Engineered".** Letter-spacing négatif sur les titres. Dense, technique, précis.
4. **États toujours visibles.** Focus, Hover, Active, Disabled — chaque état interactif doit être visuellement distinct.
5. **Élévation sans ombre.** `backdrop-blur` + bordures pour détacher les éléments flottants. Jamais de `box-shadow` lourde.
6. **Perception de vitesse.** Animations courtes, skeleton loaders, transitions instantanées.

---

## 2. Tokens de Design (Variables CSS)

**Ces variables sont la source de vérité. Ne jamais hardcoder les valeurs.**

```css
:root {
  /* Couleurs — Light Mode */
  --color-bg:           #FFFFFF;
  --color-bg-secondary: #FAFAFA;
  --color-bg-tertiary:  #F2F2F2;

  --color-text:         #000000;
  --color-text-muted:   #666666;
  --color-text-subtle:  #999999;

  --color-border:       #EAEAEA;
  --color-border-strong:#000000;
  --color-border-focus: #000000;

  /* Couleurs Sémantiques */
  --color-success:      #0070F3;
  --color-error:        #EE0000;
  --color-warning:      #F5A623;
  
  /* Couleurs Data-Viz (Graphiques exclusivement) */
  /* Palette désaturée pour maintenir le style minimaliste */
  --color-data-1:       #5E6AD2;
  --color-data-2:       #2B9A9A;
  --color-data-3:       #D4793B;
  --color-data-4:       #B55489;
  --color-data-5:       #6B8E23;
  --color-data-grid: var(--color-border);

  /* Typographie */
  --font-sans:   'Geist', system-ui, -apple-system, sans-serif;
  --font-mono:   'Geist Mono', Menlo, monospace;

  /* Espacement (base 8px) */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm:   6px;   /* badges, tags */
  --radius-md:   8px;   /* inputs, boutons carrés */
  --radius-lg:  12px;   /* cartes, modales */
  --radius-full: 9999px; /* boutons pill */

  /* Élévation (3 niveaux) */
  --elevation-0: none;                              /* flat — pas d'ombre */
  --elevation-1: 0 4px 12px rgba(0,0,0,0.05);      /* card hover */
  --elevation-2: 0 8px 32px rgba(0,0,0,0.08);      /* modales, popovers */

  /* Backdrop (modales, menus flottants) */
  --backdrop:    blur(12px);
  --backdrop-bg: rgba(255,255,255,0.85);

  /* Transitions */
  --duration-fast:   150ms;
  --duration-base:   200ms;
  --duration-slow:   300ms;
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);  /* Expo.out — snappy */
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:           #000000;
    --color-bg-secondary: #0A0A0A;
    --color-bg-tertiary:  #111111;

    --color-text:         #EDEDED;
    --color-text-muted:   #888888;
    --color-text-subtle:  #555555;

    --color-border:       #333333;
    --color-border-strong:#FFFFFF;
    --color-border-focus: #FFFFFF;

    --backdrop-bg: rgba(0,0,0,0.85);
    --elevation-1: 0 4px 12px rgba(0,0,0,0.3);
    --elevation-2: 0 8px 32px rgba(0,0,0,0.5);
    
    /* Data-Viz Dark Mode */
    --color-data-1: #7B88EB;
    --color-data-2: #42BABA;
    --color-data-3: #E89156;
    --color-data-4: #D173A7;
    --color-data-5: #8FBA3A;
    --color-data-grid: var(--color-border);
  }
}
```

---

## 3. Palette de Couleurs

L'interface est strictement **monochrome**. Les couleurs sémantiques sont réservées aux états fonctionnels uniquement.

|Usage|Light|Dark|
|---|---|---|
|Background principal|`#FFFFFF`|`#000000`|
|Background secondaire|`#FAFAFA`|`#0A0A0A`|
|Background tertiaire|`#F2F2F2`|`#111111`|
|Texte principal|`#000000`|`#EDEDED`|
|Texte secondaire|`#666666`|`#888888`|
|Texte subtil|`#999999`|`#555555`|
|Bordure standard|`#EAEAEA`|`#333333`|
|Bordure forte/focus|`#000000`|`#FFFFFF`|

### Couleurs Sémantiques

|Rôle|Hex|Usage|
|---|---|---|
|Succès|`#0070F3`|Confirmations, états positifs|
|Erreur|`#EE0000`|Erreurs, alertes critiques|
|Attention|`#F5A623`|Avertissements, états dégradés|

> **Règle stricte :** ne jamais utiliser ces couleurs à des fins décoratives. Elles portent une signification fonctionnelle.

### Couleurs de Visualisation de Données (Data-Viz)
- **Rôle :** `var(--color-data-1)` à `var(--color-data-5)`.
- **Règle stricte d'isolation :** Ces couleurs sont **exclusivement** réservées aux éléments de type SVG, Canvas, courbes, bar charts et pie charts. Elles ne doivent **jamais** être utilisées pour des textes d'interface, des boutons, des badges ou des fonds de layout.
- **Grilles :** Dans les graphiques, utiliser `var(--color-data-grid)` pour les axes et les lignes de repère pour qu'ils se fondent dans le fond (stroke: 1px, stroke-dasharray optionnel).

---

## 4. Typographie

### Polices

- **Corps / UI :** `Geist`, `system-ui`, `-apple-system`, `sans-serif`
- **Code / Data :** `Geist Mono`, `Menlo`, `monospace`

### Échelle Typographique

|Rôle|Taille|Weight|Line-height|Letter-spacing|Casse|
|---|---|---|---|---|---|
|Titre App (H1)|36–48px|700|1.1|−0.04em|Titre|
|Titre Section (H2)|24–32px|600|1.2|−0.03em|Titre|
|Titre Carte (H3)|18–20px|600|1.3|−0.02em|Titre|
|Corps (défaut)|16px|400|1.5|0|Normal|
|Corps (dense)|14px|400|1.5|0|Normal|
|Label / Surtitre|12px|500|1|+0.05em|UPPERCASE|
|Code inline|13px|400|1.6|0|Normal|

### Règles typographiques

- **Jamais** de texte en dessous de 12px.
- Les labels (`12px uppercase`) sont réservés aux surtitres, métadonnées et légendes. Toujours en `var(--color-text-muted)`.
- Le code inline utilise `var(--font-mono)` avec un fond `var(--color-bg-tertiary)` et `padding: 2px 6px`, `border-radius: var(--radius-sm)`.

---

## 5. Iconographie

- **Bibliothèque :** Lucide Icons ou Radix Icons exclusivement.
- **Style :** Ligne (stroke) uniquement — jamais d'icônes remplies (fill).
- **Stroke-width :** `1.5px` (compact) ou `2px` (accent). Constant dans toute l'interface.
- **Tailles :** `16px` (inline / label), `20px` (bouton / action), `24px` (accent décoratif max).
- **Alignement :** Toujours aligné verticalement avec le texte adjacent (`vertical-align: middle` ou flexbox).

---

## 6. Espacement & Layout

### Système de Grille

- **Desktop :** 12 colonnes, `gap: 24px`, max-width `1200px`, centré.
- **Tablette (768–1024px) :** 8 colonnes, `gap: 16px`.
- **Mobile (<768px) :** 4 colonnes (ou layout linéaire), `gap: 16px`, padding global `16px`.

### Breakpoints

```css
--bp-mobile:  480px;
--bp-tablet:  768px;
--bp-desktop: 1024px;
--bp-wide:    1280px;
```

### Règles d'espacement

- Toujours des multiples de 8px : `4, 8, 12, 16, 24, 32, 48, 64px`.
- **Padding de page :** `64px` horizontal (desktop) → `32px` (tablette) → `16px` (mobile).
- **Gap entre sections :** `48–64px`.
- **Gap entre composants dans une section :** `16–24px`.
- **Padding interne d'une carte :** `24px`.

---

## 7. Composants UI

### 7.1 Boutons

**Géométrie :** `border-radius: var(--radius-full)` (pill). Font-weight `500`.

|Variante|Fond|Texte|Bordure|
|---|---|---|---|
|Primaire|`var(--color-text)`|`var(--color-bg)`|aucune|
|Secondaire|transparent|`var(--color-text)`|`1px solid var(--color-border)`|
|Ghost|transparent|`var(--color-text-muted)`|aucune|
|Destructif|`var(--color-error)`|`#FFFFFF`|aucune|

**Tailles :**

|Taille|Height|Padding H|Font|
|---|---|---|---|
|Small|32px|12px|13px|
|Default|40px|16px|14px|
|Large|48px|24px|16px|

**États interactifs (obligatoires) :**

```css
/* Hover */
opacity: 0.85;
transition: opacity var(--duration-fast) var(--ease-out);

/* Active */
transform: scale(0.97);
transition: transform var(--duration-fast) var(--ease-out);

/* Focus-visible (accessibilité — jamais supprimer) */
outline: 2px solid var(--color-border-focus);
outline-offset: 2px;

/* Disabled */
opacity: 0.4;
cursor: not-allowed;
pointer-events: none;
```

---

### 7.2 Formulaires (Inputs, Selects, Textareas)

```css
/* Style par défaut */
background:    var(--color-bg-secondary);
border:        1px solid var(--color-border);
border-radius: var(--radius-md);
padding:       10px 14px;
font-size:     14px;
color:         var(--color-text);
transition:    border-color var(--duration-fast) var(--ease-out),
               box-shadow   var(--duration-fast) var(--ease-out);

/* Focus */
border-color:  var(--color-border-focus);
outline:       none;
box-shadow:    0 0 0 3px rgba(0,0,0,0.08); /* Light */
/* Dark: 0 0 0 3px rgba(255,255,255,0.1) */

/* Error */
border-color:  var(--color-error);
box-shadow:    0 0 0 3px rgba(238,0,0,0.1);

/* Disabled */
opacity:       0.5;
cursor:        not-allowed;
background:    var(--color-bg-tertiary);
```

**Labels :** toujours visibles au-dessus du champ (jamais placeholder seul). `font-size: 13px`, `font-weight: 500`, `margin-bottom: 6px`.

---

### 7.3 Cartes

```css
background:    var(--color-bg-secondary);
border:        1px solid var(--color-border);
border-radius: var(--radius-lg);
padding:       var(--space-6);  /* 24px */
box-shadow:    var(--elevation-0);
transition:    box-shadow var(--duration-base) var(--ease-out),
               border-color var(--duration-base) var(--ease-out);

/* Hover (cartes cliquables uniquement) */
box-shadow:    var(--elevation-1);
border-color:  var(--color-border-strong);
```

---

### 7.4 Modales & Popovers

**Desktop :** modale centrée. **Mobile :** bottom sheet (slide depuis le bas).

```css
/* Overlay */
background: rgba(0,0,0,0.5);
backdrop-filter: var(--backdrop); /* blur(12px) */

/* Conteneur */
background:    var(--backdrop-bg);
border:        1px solid var(--color-border);
border-radius: var(--radius-lg);
box-shadow:    var(--elevation-2);

/* Animation d'entrée */
animation: modal-in var(--duration-slow) var(--ease-out);

@keyframes modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

/* Bottom sheet — Mobile */
@media (max-width: 768px) {
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  animation: sheet-in var(--duration-slow) var(--ease-out);
}

@keyframes sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

---

### 7.5 Badges & Tags

```css
display:       inline-flex;
align-items:   center;
gap:           4px;
padding:       2px 8px;
border-radius: var(--radius-sm);
font-size:     11px;
font-weight:   500;
letter-spacing: 0.02em;

/* Variantes (toujours sur fond, jamais de couleur seule) */
/* Neutral */ background: var(--color-bg-tertiary); color: var(--color-text-muted);
/* Success */ background: rgba(0,112,243,0.08);     color: var(--color-success);
/* Error   */ background: rgba(238,0,0,0.08);       color: var(--color-error);
/* Warning */ background: rgba(245,166,35,0.1);     color: var(--color-warning);
```

---

### 7.6 Tableaux

```css
/* Table container */
border: 1px solid var(--color-border);
border-radius: var(--radius-lg);
overflow: hidden;

/* Header */
th {
  background:  var(--color-bg-tertiary);
  font-size:   12px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color:       var(--color-text-muted);
  padding:     10px 16px;
  text-align:  left;
  border-bottom: 1px solid var(--color-border);
}

/* Rows */
td {
  padding:     12px 16px;
  font-size:   14px;
  border-bottom: 1px solid var(--color-border);
}

tr:last-child td { border-bottom: none; }

/* Row hover */
tr:hover td { background: var(--color-bg-secondary); }
```

---

### 7.7 Navigation

- **Hauteur :** `64px` desktop, `56px` mobile.
- **Fond :** `var(--backdrop-bg)` + `backdrop-filter: var(--backdrop)`.
- **Bordure basse :** `1px solid var(--color-border)`.
- **Position :** `sticky top: 0`, `z-index: 100`.
- **Nav item actif :** `color: var(--color-text)` + indicateur `2px` en bas ou fond `var(--color-bg-tertiary)`.
- **Nav item inactif :** `color: var(--color-text-muted)`.

---

### 7.8 Séparateurs

```css
/* Ligne standard */
hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-6) 0;
}

/* Séparateur avec label centré */
/* Utiliser flex + deux <hr> de part et d'autre d'un <span> */
```

### 7.9 Graphiques & Dashboards
- **Conteneur :** Les graphiques sont toujours encapsulés dans une carte standard (voir 7.3).
- **Axes et Grilles :** Les lignes de fond (grid lines) doivent être très discrètes (`stroke: var(--color-border)`, `stroke-width: 1px`). Privilégier uniquement les lignes horizontales pour alléger la lecture.
- **Courbes & Barres :** Utiliser les couleurs `--color-data-*` en opacité pleine (100%). Pas de dégradés, pas d'ombres portées sous les courbes.
- **Tooltips (Infobulles) :** Lors du survol d'une donnée, le tooltip doit ressembler à une petite modale : fond `var(--color-bg)`, bordure `var(--color-border-strong)`, ombre `var(--elevation-2)`, texte dense `12px`.
- **Légende :** Typographie `12px`, couleur `var(--color-text-muted)`, accompagnée d'une pastille ronde de `8px` reprenant la couleur de la donnée.

---

## 8. États Spéciaux

### 8.1 Loading / Skeleton

> **Règle absolue : jamais de spinner plein écran.**

```css
/* Skeleton loader */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.skeleton {
  background:    var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  animation:     pulse 1.8s ease-in-out infinite;
}
```

Le skeleton doit reproduire **exactement** la géométrie du contenu attendu (même `border-radius`, même hauteur, même disposition).

### 8.2 États Vides (Empty States)

Structure obligatoire : icône (24px, `var(--color-text-subtle)`) + titre (16px, `font-weight: 600`) + description courte (14px, `var(--color-text-muted)`) + CTA optionnel.

```
┌─────────────────────────────┐
│                             │
│        [icône 24px]         │
│    Aucun résultat trouvé    │
│  Essayez d'élargir votre   │
│        recherche.           │
│    [Réinitialiser →]        │
│                             │
└─────────────────────────────┘
```

### 8.3 États d'Erreur

- **Erreur inline (champ) :** texte rouge `12px` sous le champ, bordure `var(--color-error)`.
- **Erreur de page :** même structure qu'un état vide, avec icône d'alerte et CTA de retry.
- **Toast / Notification :** `bottom-right`, animation `slide-up + fade-in`, durée visible `4s`, `border-radius: var(--radius-lg)`.

### 8.4 États Désactivés

```css
opacity:        0.4;
cursor:         not-allowed;
pointer-events: none;
user-select:    none;
```

Jamais de couleur grise différente — l'opacité seule suffit et préserve la cohérence des thèmes.

---

## 9. Élévation & Profondeur

Trois niveaux uniquement. Aucune shadow arbitraire.

|Niveau|Valeur CSS|Usage|
|---|---|---|
|0|`none`|Flat — cartes par défaut|
|1|`0 4px 12px rgba(0,0,0,0.05)`|Card hover, dropdowns|
|2|`0 8px 32px rgba(0,0,0,0.08)`|Modales, command palette|

**Pour les éléments flottants (menus, toasts) :** toujours combiner `elevation-2` + `backdrop-blur(12px)` + `border: 1px solid var(--color-border)`.

---

## 10. Motion Design

### Courbes & Durées

|Contexte|Durée|Courbe|
|---|---|---|
|Micro-interactions (hover)|150ms|`cubic-bezier(0.16, 1, 0.3, 1)`|
|Transitions d'état|200ms|`cubic-bezier(0.16, 1, 0.3, 1)`|
|Entrées de composants|300ms|`cubic-bezier(0.16, 1, 0.3, 1)`|
|Animations de contenu|200–400ms|`cubic-bezier(0.4, 0, 0.2, 1)`|

### Patterns d'Animation

```css
/* Entrée standard (fade + slide subtil) */
@keyframes enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Sortie */
@keyframes exit {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(4px); }
}

/* Toujours respecter prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Règles Motion

- Jamais d'animation > 400ms.
- Jamais d'animation `ease-in` sur les entrées (commence trop lentement).
- Les éléments sortants s'animent **toujours plus vite** que les entrants.
- `transform` et `opacity` uniquement — jamais animer `width`, `height`, `margin`, `padding`.

---

## 11. Accessibilité

### Focus (obligatoire partout)

```css
/* Règle globale — ne jamais supprimer outline */
*:focus { outline: none; }
*:focus-visible {
  outline:        2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius:  var(--radius-sm);
}
```

### Contrastes Minimum (WCAG AA)

|Texte|Rapport minimum|
|---|---|
|Corps (16px+)|4.5:1|
|Grand texte (18px+)|3:1|
|Composants UI|3:1|

### Règles Accessibilité

- Tous les inputs ont un `<label>` associé (jamais placeholder seul).
- Les icônes décoratives ont `aria-hidden="true"`.
- Les icônes fonctionnelles ont un `aria-label` explicite.
- Les couleurs sémantiques ne sont **jamais** le seul vecteur d'information (toujours doublées d'une icône ou d'un texte).
- Les modales piègent le focus (`focus-trap`) et se ferment avec `Escape`.
- Ordre de tabulation logique et visible.

---

## 12. Do / Don't

### ✅ Toujours

- Utiliser les tokens CSS — jamais de valeurs hardcodées.
- Skeleton loaders reprenant la géométrie exacte du contenu.
- `focus-visible` sur tous les éléments interactifs.
- Transitions sur `transform` et `opacity` uniquement.
- `border-radius` cohérent avec le type de composant (pill = bouton, `12px` = carte, `6px` = badge).
- États vides et d'erreur explicites dans chaque vue.
- Respecter `prefers-reduced-motion`.

### ❌ Jamais

- Spinner plein écran.
- `box-shadow` en dehors des 3 niveaux définis.
- Gradients décoratifs.
- `border-radius` sur les bords partiels (`border-left` + `border-radius` = incohérent).
- Couleur seule pour véhiculer une information sémantique.
- Icônes remplies (fill) — toujours stroke.
- Animer `width`, `height`, `top`, `left`, `margin`, `padding`.
- Supprimer `outline` sans proposer un équivalent `:focus-visible`.
- Texte inférieur à 12px.
- Plus de 3 poids de fonte dans une même interface.
- Ombres différentes de celles définies dans les tokens.
- Classes Tailwind mélangées avec du CSS custom pour les mêmes propriétés — choisir l'un ou l'autre.

---

## 13. Référence Composant (Code de Base)

### Carte standard

```html
<div class="card">
  <p class="card__label">Surtitre</p>
  <h3 class="card__title">Titre de la carte</h3>
  <p class="card__body">Description du contenu.</p>
</div>
```

```css
.card {
  background:    var(--color-bg-secondary);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding:       var(--space-6);
  transition:    box-shadow var(--duration-base) var(--ease-out),
                 border-color var(--duration-base) var(--ease-out);
}
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
  font-size:  14px;
  color:      var(--color-text-muted);
  line-height: 1.5;
}
```

### Bouton Primaire

```html
<button class="btn btn--primary">Action</button>
<button class="btn btn--secondary">Secondaire</button>
```

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
```

### Input standard

```html
<div class="field">
  <label class="field__label" for="email">Email</label>
  <input class="field__input" type="email" id="email" placeholder="you@example.com">
  <p class="field__error" hidden>Format d'email invalide.</p>
</div>
```

```css
.field { display: flex; flex-direction: column; gap: var(--space-1); }

.field__label {
  font-size:   13px;
  font-weight: 500;
  color:       var(--color-text-muted);
}
.field__input {
  height:        40px;
  padding:       0 var(--space-3);
  background:    var(--color-bg-secondary);
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
.field__input.is-error { border-color: var(--color-error); }
.field__error {
  font-size: 12px;
  color:     var(--color-error);
}
```

```html
Carte Graphique (Data-Viz)
<div class="card">
  <div class="card__header">
    <h3 class="card__title">Évolution des revenus</h3>
    <div class="chart-legend">
      <span class="chart-legend__item" style="--dot-color: var(--color-data-1)">Revenus</span>
      <span class="chart-legend__item" style="--dot-color: var(--color-data-2)">Dépenses</span>
    </div>
  </div>
  <div class="chart-container">
    </div>
</div>
```

```css
/* CSS spécifique à la carte graphique */
.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}
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
.chart-container {
  height: 240px;
  width: 100%;
}
```

---

_Cette charte est la source de vérité unique. Toute décision de design doit pouvoir s'y référer._
