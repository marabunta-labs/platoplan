/**
 * PlatoPlan - shopping list review classification
 *
 * Every item must be reviewed by the user, including the ones the pantry
 * supposedly already covers. Until reviewed, an item stays in "pending".
 */

export type PantryReview = 'confirmed' | 'none';
export type ReviewStatus = PantryReview | 'unknown';
export type ItemSection = 'pending' | 'buy' | 'done';

/** Status of an item: whatever the user answered, otherwise still unknown. */
export function reviewStatusOf(
  reviewed: Record<string, PantryReview>,
  ingredientId: string
): ReviewStatus {
  return reviewed[ingredientId] ?? 'unknown';
}

export function classifyItem(status: ReviewStatus, purchaseUnits: number): ItemSection {
  if (status === 'unknown') return 'pending';
  if (status === 'none' || purchaseUnits > 0) return 'buy';
  return 'done';
}
