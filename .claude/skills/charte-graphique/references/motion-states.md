# Référence Motion Design & États Spéciaux

## Table des matières
1. [Courbes & Durées](#courbes--durées)
2. [Patterns d'Animation](#patterns-danimation)
3. [Règles Motion](#règles-motion)
4. [Skeleton / Loading](#skeleton--loading)
5. [États Vides](#états-vides)
6. [États d'Erreur](#états-derreur)
7. [États Désactivés](#états-désactivés)

---

## Courbes & Durées

| Contexte | Durée | Courbe |
|---|---|---|
| Micro-interactions (hover) | 150ms | `var(--ease-out)` — `cubic-bezier(0.16, 1, 0.3, 1)` |
| Transitions d'état | 200ms | `var(--ease-out)` |
| Entrées de composants | 300ms | `var(--ease-out)` |
| Animations de contenu | 200–400ms | `var(--ease-in-out)` — `cubic-bezier(0.4, 0, 0.2, 1)` |

---

## Patterns d'Animation

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

/* TOUJOURS respecter prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Règles Motion — Strictes

- **Jamais** d'animation > 400ms.
- **Jamais** d'animation `ease-in` sur les entrées (commence trop lentement).
- Les éléments sortants s'animent **toujours plus vite** que les entrants.
- Animer **uniquement** `transform` et `opacity`. Jamais `width`, `height`, `margin`, `padding`, `top`, `left` — **sauf exception explicite** : l'expansion d'un champ de recherche au focus (`.search-field__input`) peut animer `width` car l'effet est fonctionnel et l'élément reste dans le flux.

---

## Skeleton / Loading

> **Règle absolue : jamais de spinner plein écran.**

```css
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

Le skeleton doit reproduire **exactement** la géométrie du contenu attendu : même `border-radius`, même hauteur, même disposition.

---

## États Vides (Empty States)

Structure obligatoire :
1. Icône (24px, `var(--color-text-subtle)`)
2. Titre (16px, `font-weight: 600`)
3. Description courte (14px, `var(--color-text-muted)`)
4. CTA optionnel

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

---

## États d'Erreur

- **Erreur inline (champ) :** texte rouge `12px` sous le champ, bordure `var(--color-error)`.
- **Erreur de page :** même structure qu'un état vide, avec icône d'alerte et CTA de retry.
- **Toast / Notification :** `bottom-right`, animation `slide-up + fade-in`, durée visible `4s`, `border-radius: var(--radius-lg)`.

---

## États Désactivés

```css
.is-disabled {
  opacity:        0.4;
  cursor:         not-allowed;
  pointer-events: none;
  user-select:    none;
}
```

Jamais de couleur grise différente — **l'opacité seule suffit** et préserve la cohérence des thèmes.
