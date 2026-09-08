import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { ShoppingListItem } from '../models/types';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface ShoppingItemProps {
  item: ShoppingListItem;
  pantryStatus: 'unknown' | 'confirmed' | 'none';
  onStatusChange: (status: 'confirmed' | 'none') => void;
  /** Persist the user's real pantry stock for this ingredient (writes to pantry + recalculates). */
  onConfirmPantry: (availableQuantity: number) => void;
  /** Manual override of the purchase units (the +/- steppers). */
  onQuantityChange: (qty: number) => void;
  onDelete: () => void;
  onInfo?: () => void;
}

export const ShoppingItem: React.FC<ShoppingItemProps> = ({
  item,
  pantryStatus,
  onStatusChange,
  onConfirmPantry,
  onQuantityChange,
  onDelete,
  onInfo,
}) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [availableText, setAvailableText] = useState(String(item.pantryQuantityDeducted));

  // Keep the input in sync when the item is recalculated (e.g. after confirming).
  useEffect(() => {
    setAvailableText(String(item.pantryQuantityDeducted));
  }, [item.pantryQuantityDeducted]);

  const displayName = item.ingredient?.name ?? item.ingredientId;
  const categoryName = item.ingredient?.categories?.[0] ?? item.ingredient?.category ?? t('shopping.otherCategory');
  const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : '';
  const purchaseFormat = item.ingredient?.purchaseFormat;
  const formatName = purchaseFormat?.description || t('shopping.format');

  const parsedAvailable = () => Math.max(0, Number(availableText.replace(',', '.')) || 0);
  const packageSize = purchaseFormat?.quantity ?? 0;

  // Live preview: recompute what to buy from the pantry amount currently typed,
  // so the "to buy" figure updates in real time before the user confirms.
  const previewAvailable = parsedAvailable();
  const previewNet = Math.max(0, item.totalQuantityNeeded - previewAvailable);
  const previewPackages = packageSize > 0 ? Math.ceil(previewNet / packageSize) : previewNet;
  const covered = previewPackages === 0;

  // The item is "reviewed" once the user has confirmed their pantry for it
  // (either "I have it" or "I don't have it"), regardless of coverage.
  const reviewed = pantryStatus === 'confirmed' || pantryStatus === 'none';
  // Packages needed for the FULL amount (before deducting the pantry).
  const totalPackages = packageSize > 0 ? Math.ceil(item.totalQuantityNeeded / packageSize) : item.totalQuantityNeeded;
  const totalPackagesWord = totalPackages === 1 ? t('shopping.packagesOne') : t('shopping.packagesMany');
  // Packages to actually buy after deducting what's in the pantry (live preview).
  const buyPackagesWord = previewPackages === 1 ? t('shopping.packagesOne') : t('shopping.packagesMany');

  const confirmHave = () => {
    onStatusChange('confirmed');
    onConfirmPantry(parsedAvailable());
  };

  const confirmDontHave = () => {
    setAvailableText('0');
    onStatusChange('none');
    onConfirmPantry(0);
  };

  const handleIncrement = () => onQuantityChange(previewPackages + 1);
  const handleDecrement = () => {
    if (previewPackages > 0) onQuantityChange(previewPackages - 1);
  };

  return (
    <View style={[styles.container, reviewed && styles.containerConfirmed]} accessibilityLabel={displayName}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text style={[styles.name, covered && styles.nameConfirmed]}>{displayName}</Text>
          <Text style={styles.categoryTag}>{categoryName}</Text>
          {reviewed && <Text style={styles.reviewedTag}>{t('shopping.reviewedTag')}</Text>}
        </View>
        {onInfo && (
          <TouchableOpacity onPress={onInfo} style={styles.infoButton} accessibilityRole="button" accessibilityLabel={t('shopping.usedIn')}>
            <Text style={styles.infoButtonText}>ℹ️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* What the plan needs, always shown so the breakdown is clear */}
      <View style={styles.needRow}>
        <View style={styles.needTextBlock}>
          <Text style={styles.needLabel}>{t('shopping.needLabel')}</Text>
          <Text style={styles.needSubtext}>
            {t('shopping.needQuantity', { qty: item.totalQuantityNeeded, unit })}
          </Text>
          <Text style={styles.needSubtext}>
            {t('shopping.needTotalPackages', { size: packageSize, unit, units: totalPackages, packagesWord: totalPackagesWord })}
          </Text>
        </View>
      </View>

      {/* Pantry: what we assume you have, editable + confirm */}
      <View style={styles.pantryBox}>
        <Text style={styles.pantryPrompt}>{t('shopping.pantryPrompt')}</Text>
        <View style={styles.pantryInputRow}>
          <TextInput
            value={availableText}
            onChangeText={setAvailableText}
            keyboardType="decimal-pad"
            style={styles.pantryInput}
            accessibilityLabel={`${t('shopping.pantryPrompt')} ${displayName}`}
          />
          <Text style={styles.pantryUnit}>{unit}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={confirmHave} style={[styles.confirmButton, pantryStatus === 'confirmed' && styles.confirmButtonSelected]} accessibilityRole="button">
            <Text style={[styles.confirmButtonText, pantryStatus === 'confirmed' && { color: colors.successText }]}>{t('shopping.haveIt')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDontHave} style={[styles.confirmButton, pantryStatus === 'none' && styles.confirmButtonMissing]} accessibilityRole="button">
            <Text style={[styles.confirmButtonText, pantryStatus === 'none' && { color: colors.danger }]}>{t('shopping.dontHaveIt')}</Text>
          </TouchableOpacity>
        </View>
        {pantryStatus === 'unknown' && (
          <Text style={styles.estimateHint}>{t('shopping.estimateHint')}</Text>
        )}

        {/* Result after deducting the pantry: what you actually buy */}
        <View style={styles.resultRow}>
          <View style={styles.resultTextBlock}>
            {covered ? (
              <Text style={styles.coveredText}>{t('shopping.allSet')}</Text>
            ) : (
              <>
                <Text style={styles.resultLabel}>{t('shopping.toBuyLabel')}</Text>
                <Text style={styles.resultValue}>
                  {t('shopping.buyPackages', { units: previewPackages, packagesWord: buyPackagesWord, qty: previewNet, unit })}
                </Text>
              </>
            )}
          </View>

          {/* Package stepper to override the amount to buy */}
          <View style={styles.quantityControl}>
            <TouchableOpacity onPress={handleDecrement} style={styles.quantityButton} disabled={previewPackages <= 0} accessibilityRole="button" accessibilityLabel="-">
              <Text style={styles.quantityButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityValue}>{previewPackages}</Text>
            <TouchableOpacity onPress={handleIncrement} style={styles.quantityButton} accessibilityRole="button" accessibilityLabel="+">
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  containerConfirmed: { backgroundColor: colors.successBg },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  nameConfirmed: { color: colors.successText, textDecorationLine: 'line-through' },
  categoryTag: { fontSize: 11, backgroundColor: colors.chipBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: colors.chipText, overflow: 'hidden' },
  reviewedTag: { fontSize: 11, backgroundColor: colors.successBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, color: colors.successText, fontWeight: '600', overflow: 'hidden' },
  infoButton: { padding: 4, backgroundColor: colors.card, borderRadius: 12, marginLeft: 8 },
  infoButtonText: { fontSize: 12 },

  needRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  needTextBlock: { flex: 1, paddingRight: 12 },
  needLabel: { fontSize: 11, fontWeight: '700', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  needValue: { fontSize: 16, fontWeight: '700', color: colors.accent, marginTop: 1 },
  needSubtext: { fontSize: 13, color: colors.chipText, marginTop: 2 },
  estimateHint: { fontSize: 11, color: colors.warningText, fontStyle: 'italic', marginTop: 6 },
  coveredText: { fontSize: 15, fontWeight: '600', color: colors.successText },

  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  resultTextBlock: { flex: 1, paddingRight: 12 },
  resultLabel: { fontSize: 11, fontWeight: '700', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultValue: { fontSize: 16, fontWeight: '700', color: colors.accent, marginTop: 1 },

  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { fontSize: 18, fontWeight: '600', color: colors.text },
  quantityValue: { fontSize: 16, fontWeight: '700', color: colors.text, minWidth: 22, textAlign: 'center' },
  deleteButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  deleteText: { fontSize: 13, color: colors.danger },

  pantryBox: { marginTop: 10, backgroundColor: colors.successBg, borderRadius: 8, padding: 10 },
  pantryPrompt: { fontSize: 12, fontWeight: '600', color: colors.successText, marginBottom: 6 },
  pantryInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pantryInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.inputBg, color: colors.text, fontSize: 14, minWidth: 56, paddingVertical: 4, paddingHorizontal: 8, textAlign: 'center' },
  pantryUnit: { fontSize: 13, color: colors.successText },
  confirmButton: { backgroundColor: colors.card, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  confirmButtonSelected: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.border },
  confirmButtonMissing: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger },
  confirmButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  planTotal: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
});
