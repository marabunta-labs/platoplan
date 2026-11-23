import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ShoppingListItem } from '../models/types';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';
import { categoryPresentation } from '../constants/ingredient-categories';

export interface ShoppingRowProps {
  item: ShoppingListItem;
  pantryStatus: 'unknown' | 'confirmed' | 'none';
  /** "Está bien": keeps the pantry amount shown and marks the item as reviewed. */
  onConfirmHave: () => void;
  onConfirmNone: () => void;
  /** Full card (amount input, stepper, delete) shown when the user taps "Editar". */
  renderEditor: () => React.ReactNode;
}

/**
 * Compact list view of a shopping item, written as plain sentences:
 * what the plan needs, what the pantry has, and what is left to buy.
 */
export const ShoppingRow: React.FC<ShoppingRowProps> = ({ item, pantryStatus, onConfirmHave, onConfirmNone, renderEditor }) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);

  const name = item.ingredient?.name ?? item.ingredientId;
  const categoryName = item.ingredient?.categories?.[0] ?? item.ingredient?.category ?? t('shopping.otherCategory');
  const emoji = categoryPresentation(categoryName).emoji;
  const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : '';
  const packageSize = item.ingredient?.purchaseFormat?.quantity ?? 0;

  const totalPackages = packageSize > 0 ? Math.ceil(item.totalQuantityNeeded / packageSize) : item.totalQuantityNeeded;
  const totalPackagesWord = totalPackages === 1 ? t('shopping.packagesOne') : t('shopping.packagesMany');
  const buyWord = item.purchaseUnits === 1 ? t('shopping.packagesOne') : t('shopping.packagesMany');
  const covered = item.purchaseUnits <= 0;
  const reviewed = pantryStatus !== 'unknown';

  return (
    <View style={[styles.container, reviewed && styles.containerReviewed]} accessibilityLabel={name}>
      <View style={[styles.titleRow, editing && styles.titleRowEditing]}>
        {/* The editor card already shows the name, so only the close button remains. */}
        {!editing && <Text style={styles.emoji}>{emoji}</Text>}
        {!editing && <Text style={styles.name} numberOfLines={2}>{name}</Text>}
        <TouchableOpacity onPress={() => setEditing((e) => !e)} accessibilityRole="button" style={styles.editButton}>
          <Text style={styles.editText}>{editing ? t('shopping.rowClose') : t('shopping.rowEdit')}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.editor}>{renderEditor()}</View>
      ) : (
        <>
          <Text style={styles.line}>{t('shopping.needQuantity', { qty: item.totalQuantityNeeded, unit })}</Text>
          {packageSize > 0 && (
            <Text style={styles.line}>
              {t('shopping.needTotalPackages', { size: packageSize, unit, units: totalPackages, packagesWord: totalPackagesWord })}
            </Text>
          )}
          <Text style={styles.line}>{t('shopping.rowPantry', { qty: item.pantryQuantityDeducted, unit })}</Text>

          <Text style={[styles.result, covered ? styles.resultOk : styles.resultBuy]}>
            {covered
              ? t('shopping.allSet')
              : `🛒 ${t('shopping.buyPackages', { units: item.purchaseUnits, packagesWord: buyWord, qty: item.netQuantity, unit })}`}
          </Text>

          {!reviewed && (
            <View style={styles.actions}>
              <TouchableOpacity onPress={onConfirmHave} style={[styles.actionButton, styles.actionConfirm]} accessibilityRole="button">
                <Text style={[styles.actionText, { color: colors.successText }]}>{t('shopping.rowConfirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirmNone} style={[styles.actionButton, styles.actionNone]} accessibilityRole="button">
                <Text style={[styles.actionText, { color: colors.danger }]}>{t('shopping.dontHaveIt')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  containerReviewed: { backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  titleRowEditing: { justifyContent: 'flex-end' },
  emoji: { fontSize: 20 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  editButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.card },
  editText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  line: { fontSize: 13, color: colors.chipText, marginTop: 2 },
  result: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  resultBuy: { color: colors.accent },
  resultOk: { color: colors.successText },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionButton: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1 },
  actionConfirm: { backgroundColor: colors.successBg, borderColor: colors.success },
  actionNone: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  actionText: { fontSize: 13, fontWeight: '700' },
  editor: { marginHorizontal: -16 },
});
