/**
 * PlatoPlan - IngredientRow
 *
 * Displays an ingredient within a recipe with its quantity, unit,
 * and a secondary line showing the proportion of the purchase format.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { RecipeIngredient, Ingredient } from '../models/types';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface IngredientRowProps {
  ingredient: RecipeIngredient;
  /** Edit the quantity of this ingredient within the recipe. */
  onEdit?: () => void;
  onDelete?: () => void;
  /** Edit the ingredient's master data (name, unit, purchase format, category). */
  onEditIngredient?: () => void;
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

export const IngredientRow: React.FC<IngredientRowProps> = ({ ingredient, onEdit, onDelete, onEditIngredient }) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayName = ingredient.ingredient?.name ?? ingredient.ingredientId;
  const unit = ingredient.ingredient?.unit ? (t(`units.${ingredient.ingredient.unit}` as any) || ingredient.ingredient.unit) : '';
  const purchaseContext = formatPurchaseContext(ingredient.quantity, ingredient.ingredient);

  const nameContent = (
    <>
      <Text style={styles.name}>{displayName}</Text>
      <Text style={styles.quantity}>
        {ingredient.quantity} {unit}
      </Text>
      {purchaseContext && (
        <Text style={styles.purchaseContext}>{purchaseContext}</Text>
      )}
    </>
  );

  return (
    <View style={styles.container} accessibilityRole="none" accessibilityLabel={`${displayName}`}>
      {onEditIngredient ? (
        <TouchableOpacity
          style={styles.info}
          onPress={onEditIngredient}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.editIngredientData', { name: displayName })}
        >
          {nameContent}
          <Text style={styles.editIngredientHint}>{t('recipes.editIngredientData', { name: '' }).trim()}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.info}>{nameContent}</View>
      )}
      {(onEdit || onDelete) && (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              onPress={onEdit}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel={`${t('recipes.editQuantityAction')} ${displayName}`}
            >
              <Text style={styles.actionText}>{t('recipes.quantity')}</Text>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  quantity: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  purchaseContext: {
    fontSize: 12,
    color: colors.textFaint,
    fontStyle: 'italic',
    marginTop: 2,
  },
  editIngredientHint: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.card,
  },
  deleteButton: {
    backgroundColor: colors.dangerBg,
  },
  actionText: {
    fontSize: 13,
    color: colors.text,
  },
  deleteText: {
    color: colors.danger,
  },
});
