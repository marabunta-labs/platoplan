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
  { name: 'Despensa seca', emoji: '🫙', color: '#5C4B3E', backgroundColor: '#F3EFEA' },
  { name: 'Congelados', emoji: '❄️', color: '#236A9B', backgroundColor: '#E8F7FF' },
  { name: 'Bebidas', emoji: '🥤', color: '#0F766E', backgroundColor: '#E6FFFA' },
  { name: 'Otros', emoji: '🛒', color: '#4A5568', backgroundColor: '#EDF2F7' },
];

export function categoryPresentation(category: string): IngredientCategoryOption {
  return DEFAULT_INGREDIENT_CATEGORIES.find((option) => option.name === category)
    ?? { name: category, emoji: '🏷️', color: '#4A5568', backgroundColor: '#EDF2F7' };
}
