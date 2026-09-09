export interface IngredientCategoryOption {
  name: string;
  emoji: string;
  color: string;
  backgroundColor: string;
}

/** A compact, opinionated set that covers the usual supermarket aisles. */
export const DEFAULT_INGREDIENT_CATEGORIES: IngredientCategoryOption[] = [
  { name: 'Carnes', emoji: '🥩', color: '#9B2C2C', backgroundColor: '#FDE8E7' },
  { name: 'Pescado y marisco', emoji: '🐟', color: '#1E5A8A', backgroundColor: '#E3F2FD' },
  { name: 'Verduras', emoji: '🥬', color: '#276749', backgroundColor: '#E6F6EC' },
  { name: 'Frutas', emoji: '🍎', color: '#9C4221', backgroundColor: '#FFF1E6' },
  { name: 'Lácteos y huevos', emoji: '🥛', color: '#805AD5', backgroundColor: '#F3EEFF' },
  { name: 'Panadería', emoji: '🥖', color: '#975A16', backgroundColor: '#FFF7D6' },
  { name: 'Pasta, arroz y legumbres', emoji: '🍝', color: '#8A5A00', backgroundColor: '#FFF3D6' },
  { name: 'Conservas', emoji: '🥫', color: '#8A4B08', backgroundColor: '#FBEBD7' },
  { name: 'Aceites y salsas', emoji: '🫒', color: '#5B7A1E', backgroundColor: '#F0F5DE' },
  { name: 'Despensa seca', emoji: '🫙', color: '#5C4B3E', backgroundColor: '#F3EFEA' },
  { name: 'Congelados', emoji: '❄️', color: '#236A9B', backgroundColor: '#E8F7FF' },
  { name: 'Bebidas', emoji: '🥤', color: '#0F766E', backgroundColor: '#E6FFFA' },
  { name: 'Otros', emoji: '🛒', color: '#4A5568', backgroundColor: '#EDF2F7' },
];

/**
 * Order-insensitive key for a category name: lowercased, accent-stripped, and
 * with its significant words sorted. So "Lácteos y huevos" and
 * "Huevos y lácteos" produce the same key and are treated as the same category.
 * The connector "y" and punctuation are ignored.
 */
export function categoryKey(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[.,;]/g, ' ') // punctuation -> space
    .split(/\s+/)
    .filter((w) => w && w !== 'y' && w !== 'e')
    .sort()
    .join(' ');
}

export function categoryPresentation(category: string): IngredientCategoryOption {
  const key = categoryKey(category);
  return DEFAULT_INGREDIENT_CATEGORIES.find((option) => categoryKey(option.name) === key)
    ?? { name: category, emoji: '🏷️', color: '#4A5568', backgroundColor: '#EDF2F7' };
}

/**
 * Merges the built-in categories with any custom ones already in use into a
 * single, case-insensitively deduplicated list. Built-in entries win (so their
 * emoji/colour/casing is kept), custom ones get a generic tag presentation.
 * The result is sorted with built-ins first, then custom alphabetically.
 */
export function mergeCategoryOptions(usedCategories: string[]): IngredientCategoryOption[] {
  // Keyed by the order-insensitive categoryKey so word-order variants collapse
  // into a single option (built-in casing/emoji wins).
  const seen = new Set<string>();

  for (const option of DEFAULT_INGREDIENT_CATEGORIES) {
    seen.add(categoryKey(option.name));
  }

  const customNames: string[] = [];
  for (const raw of usedCategories) {
    const name = raw.trim();
    if (!name) continue;
    const key = categoryKey(name);
    if (!seen.has(key)) {
      seen.add(key);
      customNames.push(name);
    }
  }

  const builtIns = DEFAULT_INGREDIENT_CATEGORIES;
  const customs = customNames
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => categoryPresentation(name));

  return [...builtIns, ...customs];
}
