/**
 * PlatoPlan - IngredientRow
 *
 * Displays an ingredient within a recipe with its quantity, unit,
 * and a secondary line showing the proportion of the purchase format.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { RecipeIngredient, Ingredient } from '../models/types';
import { useI18n } from '../i18n';

export interface IngredientRowProps {
  ingredient: RecipeIngredient;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Formats the purchase context showing how the recipe quantity
 * relates to the purchase format.
 *
 * Examples:
 * - 500g of a 500g bote → "1 bote"
 * - 250g of a 500g bote → "½ bote"
 * - 125g of a 500g bote → "¼ bote"
 * - 200g of a 500g bote → "40% de bote"
 * - 1000g of a 500g bote → "2 bote"
 * - 750g of a 500g bote → "1.5 bote"
 */
function formatPurchaseContext(quantity: number, ingredient?: Ingredient): string | null {
  if (!ingredient?.purchaseFormat) return null;
  const { quantity: formatQty, description } = ingredient.purchaseFormat;
  if (formatQty <= 0) return null;

  const ratio = quantity / formatQty;
  if (ratio === 1) return `1 ${description}`;
  if (ratio === 0.5) return `½ ${description}`;
  if (ratio === 0.25) return `¼ ${description}`;
  if (ratio < 1) return `${Math.round(ratio * 100)}% de ${description}`;
  if (Number.isInteger(ratio)) return `${ratio} ${description}`;
  return `${ratio.toFixed(1)} ${description}`;
}

export const IngredientRow: React.FC<IngredientRowProps> = ({ ingredient, onEdit, onDelete }) => {
  const { t } = useI18n();
  const displayName = ingredient.ingredient?.name ?? ingredient.ingredientId;
  const unit = ingredient.ingredient?.unit ? (t(`units.${ingredient.ingredient.unit}` as any) || ingredient.ingredient.unit) : '';
  const purchaseContext = formatPurchaseContext(ingredient.quantity, ingredient.ingredient);

  return (
    <View style={styles.container} accessibilityRole="none" accessibilityLabel={`${displayName}`}>
      <View style={styles.info}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.quantity}>
          {ingredient.quantity} {unit}
        </Text>
        {purchaseContext && (
          <Text style={styles.purchaseContext}>{purchaseContext}</Text>
        )}
      </View>
      {(onEdit || onDelete) && (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              onPress={onEdit}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={`${t('common.edit')} ${displayName}`}
            >
              <Text style={styles.actionText}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              style={[styles.actionButton, styles.deleteButton]}
              accessibilityRole="button"
              accessibilityLabel={`${t('common.delete')} ${displayName}`}
            >
              <Text style={[styles.actionText, styles.deleteText]}>{t('common.delete')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  quantity: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  purchaseContext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  deleteButton: {
    backgroundColor: '#fee',
  },
  actionText: {
    fontSize: 13,
    color: '#333',
  },
  deleteText: {
    color: '#c00',
  },
});
