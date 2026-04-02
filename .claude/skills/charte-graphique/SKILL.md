---
name: flo-design-system-v4
description: >
  Charte graphique personnalisée de Flo. DOIT être utilisé pour TOUTE génération
  ou audit de HTML/CSS : pages, composants UI, dashboards, data-viz, formulaires,
  cartes, tableaux, modales, navigation, ou tout élément d'interface visuelle.
  Déclencher dès qu'il est question de front-end, layout, design system, tokens CSS,
  ou charte graphique — même sans mention explicite par l'utilisateur.
---

# Charte Graphique & Standards UI — Flo Design System v4

## Modes d'utilisation

Ce skill a deux modes. Déterminer lequel appliquer selon la demande :

### Mode GÉNÉRATION
Quand l'utilisateur demande de créer du HTML/CSS (composant, page, dashboard…) :
1. Lire ce fichier + la référence pertinente (voir § Fichiers de référence)
2. Générer du code qui respecte **strictement** tous les tokens et règles ci-dessous
3. Ne jamais hardcoder de valeur — toujours utiliser les variables CSS `var(--…)`
4. Inclure le bloc `:root` complet avec les tokens + le dark mode

### Mode AUDIT
Quand l'utilisateur fournit du code existant à vérifier :
1. Lire ce fichier + la référence pertinente
2. Parcourir le code et lister chaque violation en citant la règle enfreinte
3. Proposer le code corrigé pour chaque violation
4. Structurer le retour : `❌ Violation` → `Règle` → `✅ Correction`

### Règle de contraste contextuel
Avant de signaler un token "incorrect", vérifier le contexte d'imbrication :
un composant peut légitimement dévier du token de référence si ce token
crée une collision visuelle avec son conteneur parent.
Exemple : `field__input` dans une `.card` doit contraster avec
`--color-bg-secondary` (fond de la carte) → `var(--color-bg)` est correct.
Signaler comme **NOTE** plutôt que **VIOLATION** dans ce cas.

---

## Fichiers de référence

Lire le fichier approprié **avant** de générer ou auditer :

| Besoin | Fichier | Quand le lire |
|---|---|---|
| Boutons, inputs, cartes, modales, badges, tableaux, navigation, séparateurs, tab bar, search field | `references/components.md` | Dès qu'un composant UI est impliqué |
| Graphiques, charts, dashboards, data-viz | `references/data-viz.md` | Dès qu'il y a un graphique ou des données à visualiser |
| Animations, transitions, skeleton loaders, états spéciaux | `references/motion-states.md` | Dès qu'il y a du mouvement ou des états loading/empty/error |

---

## Contexte d'exécution

Le HTML généré sera typiquement rendu comme **artifact** (fichier `.html` autonome dans `/mnt/user-data/outputs`). En conséquence :

- Chaque fichier HTML doit être **autonome** : inclure le bloc `:root` complet et tous les styles inline dans un `<style>`.
- **Police Geist :** toujours inclure les liens Google Fonts dans le `<head>` :
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  ```
  Si le réseau n'est pas disponible, le fallback `system-ui, -apple-system, sans-serif` s'applique via la pile `var(--font-sans)`.

---

## 6 Principes Fondamentaux

Ces règles gouvernent TOUTES les décisions de design :

1. **Le contenu est roi, l'interface est son cadre.** Générer uniquement ce qui sert la donnée. Ni section décorative, ni composant non demandé, ni état inutilisé. La qualité vient de la précision, pas de la quantité.
2. **Structure par la grille et le vide.** Espacement strict base 8px. Aucun bloc de couleur lourd.
3. **Typographie "Engineered".** Letter-spacing négatif sur les titres. Dense, technique, précis.
4. **États toujours visibles.** Focus, Hover, Active, Disabled — chaque état interactif doit être visuellement distinct.
5. **Élévation sans ombre.** `backdrop-blur` + bordures pour détacher les éléments flottants. Jamais de `box-shadow` lourde.
6. **Perception de vitesse.** Animations courtes, skeleton loaders, transitions instantanées.

---

## Principe de Proportionnalité — OBLIGATOIRE

Avant de générer, évaluer la portée réelle de la demande :

| Demande | Livrable attendu |
|---|---|
| Composant isolé | Snippet CSS/HTML du composant uniquement — pas de page entière |
| Page / écran | Structure complète avec `:root`, navigation, responsive |
| Dashboard | Layout sidebar + sections + data-viz |

**Ne jamais ajouter** ce qui n'a pas été demandé : si la demande est un composant, pas de page wrapper. Si c'est une page statique, pas de JS complexe. Si c'est un prototype, pas d'états loading/empty sauf si demandés explicitement.

---

## Contenu des démos

- Utiliser du **contenu minimal mais réaliste** : 2–3 items max dans les listes, des valeurs vraisemblables.
- **Jamais** de Lorem ipsum.
- **Jamais** de données en double pour "remplir" (ex : 8 cartes identiques).
- Si des données sont nécessaires, les hardcoder comme constantes JS nommées, pas inline dans le HTML.

---

## JavaScript — Économie

- **CSS d'abord.** Si un état ou une interaction peut être réalisé en CSS pur (`:hover`, `:focus`, `details`, checkbox hack), ne pas écrire de JS.
- JS uniquement pour : fetch de données, toggle de classes, logique métier réelle.
- Pas de framework si le composant ne le nécessite pas. Vanilla JS ou rien.
- Pas d'animation JS si `transition` / `@keyframes` CSS suffisent.

---

## Auto-vérification avant livraison

Répondre mentalement à ces questions avant de générer le code final :

- [ ] Chaque section/composant présent a été **explicitement demandé ou est indispensable** à la fonction ?
- [ ] Le JS présent ne peut pas être remplacé par du CSS ?
- [ ] Le nombre de variants/états générés correspond au besoin réel (pas d'états fantômes) ?
- [ ] Le contenu de démonstration est minimal (≤ 3 items représentatifs) ?
- [ ] Les fichiers de référence pertinents ont bien été lus ?

---

## Tokens de Design (Variables CSS) — SOURCE DE VÉRITÉ

**Ne jamais hardcoder les valeurs. Toujours utiliser `var(--…)`.**

Tout fichier HTML généré DOIT inclure ce bloc `:root` complet :

```css
:root {
  /* Couleurs — Light Mode */
  --color-bg:           #FFFFFF;
  --color-bg-secondary: #FAFAFA;
  --color-bg-tertiary:  #F2F2F2;

  --color-text:         #111111;
  --color-text-muted:   #666666;
  --color-text-subtle:  #999999;

  --color-border:       #EAEAEA;
  --color-border-strong:#000000;
  --color-border-focus: #000000;

  /* Couleur d'accent (bouton primaire, lien actif, highlight) */
  --color-accent:       #000000;
  --color-accent-text:  #FFFFFF;

  /* Couleurs Sémantiques — JAMAIS décoratives */
  --color-success:      #16A34A;
  --color-error:        #EE0000;
  --color-warning:      #F5A623;

  /* Couleurs Data-Viz (graphiques EXCLUSIVEMENT) */
  --color-data-1:       #0070F3;
  --color-data-2:       #06B6D4;
  --color-data-3:       #7928CA;
  --color-data-4:       #FF0080;
  --color-data-5:       #FF4D4D;
  --color-data-6:       #F5A623;
  --color-data-7:       #10B981;
  --color-data-grid: var(--color-border);

  /* Typographie */
  --font-sans:   'Geist', system-ui, -apple-system, sans-serif;
  --font-mono:   'Geist Mono', Menlo, monospace;

  /* Échelle typographique (tokens CSS — ne pas hardcoder les valeurs) */
  --text-h1-size:    42px; --text-h1-weight: 700; --text-h1-lh: 1.1; --text-h1-ls: -0.04em;
  --text-h2-size:    28px; --text-h2-weight: 600; --text-h2-lh: 1.2; --text-h2-ls: -0.03em;
  --text-h3-size:    20px; --text-h3-weight: 600; --text-h3-lh: 1.3; --text-h3-ls: -0.02em;
  --text-body-size:  16px; --text-body-weight: 400; --text-body-lh: 1.5;
  --text-small-size: 14px; --text-small-weight: 400; --text-small-lh: 1.5;
  --text-label-size: 12px; --text-label-weight: 500; --text-label-lh: 1; --text-label-ls: 0.05em;
  --text-code-size:  13px; --text-code-weight: 400; --text-code-lh: 1.6;

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
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:  12px;
  --radius-full: 9999px;

  /* Élévation (3 niveaux UNIQUEMENT) */
  --elevation-0: none;
  --elevation-1: 0 4px 12px rgba(0,0,0,0.05);
  --elevation-2: 0 8px 32px rgba(0,0,0,0.08);

  /* Backdrop (modales, menus flottants) */
  --backdrop:    blur(12px);
  --backdrop-bg: rgba(255,255,255,0.85);

  /* Transitions */
  --duration-fast:   150ms;
  --duration-base:   200ms;
  --duration-slow:   300ms;
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);

  /* Z-Index (couches EXCLUSIVEMENT — ne jamais utiliser de valeur arbitraire) */
  --z-dropdown:  100;
  --z-modal:     200;
  --z-toast:     300;
  --z-tooltip:   400;
}

/*
 * DARK MODE
 * Deux blocs nécessaires (CSS ne permet pas de combiner media query + sélecteur attribut) :
 *   1. @media prefers-color-scheme → préférence système (sauf override light)
 *   2. [data-theme="dark"]        → toggle manuel
 * ⚠ Garder les deux synchronisés — modifier les deux simultanément.
 *
 * Tokens modifiés en dark : bg, text, border, backdrop-bg, elevation, data-*, accent.
 * Les tokens typo, espacement, radius, z-index et transitions sont invariants.
 */

/* [dark tokens — à dupliquer dans les deux blocs ci-dessous] */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --color-accent:       #EDEDED;
  --color-accent-text:  #000000;
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
  --color-data-1: #3291FF; --color-data-2: #22D3EE; --color-data-3: #8A2BE2;
  --color-data-4: #FF1493; --color-data-5: #FF5C5C; --color-data-6: #FBBF24;
  --color-data-7: #34D399; --color-data-grid: var(--color-border);
}}

:root[data-theme="dark"] {
  --color-accent:       #EDEDED;
  --color-accent-text:  #000000;
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
  --color-data-1: #3291FF; --color-data-2: #22D3EE; --color-data-3: #8A2BE2;
  --color-data-4: #FF1493; --color-data-5: #FF5C5C; --color-data-6: #FBBF24;
  --color-data-7: #34D399; --color-data-grid: var(--color-border);
}
```

---

## Palette — Règles Strictes

- L'interface est **monochrome**. Noir, blanc, gris uniquement.
- **Bouton primaire / lien actif / highlight :** utiliser `--color-accent` (jamais une couleur data ou sémantique).
- Les couleurs sémantiques (`success`, `error`, `warning`) sont réservées aux états fonctionnels. **Jamais décoratives.**
- Les couleurs `--color-data-*` sont **exclusivement** pour les graphiques (SVG, Canvas, charts). Jamais pour des boutons, badges, textes d'interface, ou fonds de layout.
- La couleur seule ne doit **jamais** être le seul vecteur d'information — toujours doubler d'une icône ou d'un texte.

---

## Typographie

### Polices
- **Corps / UI :** `var(--font-sans)` → Geist, system-ui, -apple-system, sans-serif
- **Code / Data :** `var(--font-mono)` → Geist Mono, Menlo, monospace

### Échelle Typographique

Tous les rôles sont disponibles en tokens CSS (dans le `:root`) — toujours les utiliser, ne jamais hardcoder :

| Rôle | Token size | Weight | Line-height | Letter-spacing | Casse |
|---|---|---|---|---|---|
| Titre App (H1) | `--text-h1-size` (42px) | 700 | 1.1 | −0.04em | Titre |
| Titre Section (H2) | `--text-h2-size` (28px) | 600 | 1.2 | −0.03em | Titre |
| Titre Carte (H3) | `--text-h3-size` (20px) | 600 | 1.3 | −0.02em | Titre |
| Corps (défaut) | `--text-body-size` (16px) | 400 | 1.5 | 0 | Normal |
| Corps (dense) | `--text-small-size` (14px) | 400 | 1.5 | 0 | Normal |
| Label / Surtitre | `--text-label-size` (12px) | 500 | 1 | +0.05em | UPPERCASE |
| Code inline | `--text-code-size` (13px) | 400 | 1.6 | 0 | Normal |

### Règles typo strictes
- **Jamais** de texte en dessous de 12px.
- **Maximum 3 poids** de fonte dans une même interface.
- Labels 12px uppercase → toujours en `var(--color-text-muted)`.
- Code inline → `var(--font-mono)`, fond `var(--color-bg-tertiary)`, `padding: 2px 6px`, `border-radius: var(--radius-sm)`.
- Tout affichage de valeur numérique (KPI, tableau, date, compteur) doit utiliser `font-variant-numeric: tabular-nums`.

---

## Iconographie

- **Bibliothèque :** Lucide Icons ou Radix Icons exclusivement.
- **Style :** Ligne (stroke) uniquement — **jamais** d'icônes remplies (fill).
- **Stroke-width :** `1.5px` (compact) ou `2px` (accent). Constant dans toute l'interface.
- **Tailles :** `16px` (inline/label), `20px` (bouton/action), `24px` (accent décoratif max).
- **Alignement :** Toujours aligné verticalement avec le texte adjacent.

---

## Espacement & Layout

### Grille
- **Desktop :** 12 colonnes, `gap: 24px`, `max-width: 1200px`, centré.
- **Tablette (768–1024px) :** 8 colonnes, `gap: 16px`.
- **Mobile (<768px) :** 4 colonnes ou linéaire, `gap: 16px`, padding `16px`.

### Breakpoints

Les breakpoints sont des **valeurs littérales** dans les `@media` (CSS natif ne supporte pas `var()` dans les media queries) :

| Nom | Valeur | Usage |
|---|---|---|
| Mobile | `480px` | Small phones |
| Tablet | `768px` | Tablettes, sidebar collapse |
| Desktop | `1024px` | Layout multi-colonnes |
| Wide | `1280px` | Contenus larges |

### Règles d'espacement
- Toujours des multiples de 8px : `4, 8, 12, 16, 24, 32, 48, 64px`.
- **Padding de page :** `64px` (desktop) → `32px` (tablette) → `16px` (mobile).
- **Gap entre sections :** `48–64px`.
- **Gap entre composants dans une section :** `16–24px`.
- **Padding interne d'une carte :** `24px`.

### Layout Dashboard (Sidebar + Main)

**Desktop :** Sidebar `260px` fixe, `position: sticky`, hauteur `100vh - nav`. Séparée du contenu principal par `border-right: 1px solid var(--color-border)`.

**Mobile (`≤768px`) :** La sidebar perd sa position sticky et devient une **bande horizontale** en haut du contenu (`width: 100%`, `height: auto`, `border-right: none`, `border-bottom: 1px solid var(--color-border)`). Les filtres s'organisent en `flex-direction: row; flex-wrap: wrap`.

---

## Élévation & Profondeur

3 niveaux UNIQUEMENT. Aucune shadow arbitraire.

| Niveau | Valeur | Usage |
|---|---|---|
| 0 | `none` | Flat — cartes par défaut |
| 1 | `var(--elevation-1)` | Card hover, dropdowns |
| 2 | `var(--elevation-2)` | Modales, command palette |

Pour les éléments flottants : toujours combiner `elevation-2` + `backdrop-filter: blur(12px)` + `border: 1px solid var(--color-border)`.

---

## Accessibilité — Obligatoire

### Focus (ne jamais supprimer)
```css
*:focus { outline: none; }
*:focus-visible {
  outline:        2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius:  var(--radius-sm);
}
```

### Contrastes WCAG AA
| Texte | Rapport minimum |
|---|---|
| Corps (16px+) | 4.5:1 |
| Grand texte (18px+) | 3:1 |
| Composants UI | 3:1 |

### Règles
- Tous les inputs ont un `<label>` associé (jamais placeholder seul).
- Icônes décoratives : `aria-hidden="true"`. Icônes fonctionnelles : `aria-label` explicite.
- Modales : focus-trap + fermeture `Escape`.
- Ordre de tabulation logique et visible.
- Toujours respecter `prefers-reduced-motion`.

---

## Interdictions Absolues

Ces règles ne sont **jamais** négociables :

- Spinner plein écran (utiliser des skeleton loaders)
- Gradients décoratifs
- Icônes remplies (fill)
- Animer `width`, `height`, `top`, `left`, `margin`, `padding` — **exception unique :** `.search-field__input` au focus
- `box-shadow` hors des 3 niveaux définis
- Texte < 12px
- Plus de 3 poids de fonte
- Classes Tailwind mélangées avec du CSS custom pour les mêmes propriétés
- Supprimer `outline` sans `:focus-visible`
- Valeurs `z-index` arbitraires — toujours utiliser `var(--z-dropdown/modal/toast/tooltip)`
