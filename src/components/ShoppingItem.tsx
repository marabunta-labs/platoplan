import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { ShoppingListItem } from '../models/types';
import { useI18n } from '../i18n';

export interface ShoppingItemProps {
  item: ShoppingListItem;
  onQuantityChange: (qty: number) => void;
  onDelete: () => void;
}

export const ShoppingItem: React.FC<ShoppingItemProps> = ({ item, onQuantityChange, onDelete }) => {
  const { t } = useI18n();
  const [pantryStatus, setPantryStatus] = useState<'unknown' | 'confirmed' | 'none'>('unknown');
  const [availableText, setAvailableText] = useState(String(item.pantryQuantityDeducted));
  const displayName = item.ingredient?.name ?? item.ingredientId;
  const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : '';
  const purchaseFormat = item.ingredient?.purchaseFormat;
  const confirmedAvailable = pantryStatus === 'none' ? 0 : Math.max(0, Number(availableText.replace(',', '.')) || 0);
  const adjustedNet = Math.max(0, item.totalQuantityNeeded - confirmedAvailable);
  const adjustedUnits = purchaseFormat?.quantity ? Math.ceil(adjustedNet / purchaseFormat.quantity) : item.purchaseUnits;
  const formatLabel = purchaseFormat ? `${purchaseFormat.description || 'formato'} · ${purchaseFormat.quantity} ${unit}` : t('shopping.itemCount', { count: item.purchaseUnits });

  const confirmPantry = (status: 'confirmed' | 'none') => {
    setPantryStatus(status);
    const available = status === 'none' ? 0 : Math.max(0, Number(availableText.replace(',', '.')) || 0);
    const units = purchaseFormat?.quantity ? Math.ceil(Math.max(0, item.totalQuantityNeeded - available) / purchaseFormat.quantity) : item.purchaseUnits;
    if (units === 0) onDelete();
    else onQuantityChange(units);
  };

  const handleIncrement = () => {
    onQuantityChange(item.purchaseUnits + 1);
  };

  const handleDecrement = () => {
    if (item.purchaseUnits > 1) {
      onQuantityChange(item.purchaseUnits - 1);
    }
  };

  return (
    <View style={styles.container} accessibilityLabel={`${displayName}, ${item.purchaseUnits} ${unit}`}>
      <View style={styles.info}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.detail}>Plan: {item.totalQuantityNeeded} {unit}</Text>
        <View style={styles.pantryRow}>
          <Text style={styles.pantryDetail}>Despensa prevista: {item.pantryQuantityDeducted} {unit}</Text>
          <TextInput value={availableText} onChangeText={setAvailableText} keyboardType="decimal-pad" style={styles.pantryInput} accessibilityLabel={`Cantidad disponible de ${displayName}`} />
          <Text style={styles.pantryDetail}>{unit}</Text>
        </View>
        <View style={styles.confirmRow}>
          <TouchableOpacity onPress={() => confirmPantry('confirmed')} style={[styles.confirmButton, pantryStatus === 'confirmed' && styles.confirmButtonSelected]} accessibilityRole="button"><Text style={styles.confirmButtonText}>✓ Lo tengo</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => confirmPantry('none')} style={[styles.confirmButton, pantryStatus === 'none' && styles.confirmButtonMissing]} accessibilityRole="button"><Text style={styles.confirmButtonText}>No lo tengo</Text></TouchableOpacity>
        </View>
        <Text style={styles.formatDetail}>Formato de compra: {formatLabel}</Text>
        {pantryStatus === 'unknown' ? (
          <Text style={styles.unknownBuy}>? Confirma la despensa para calcular qué comprar.</Text>
        ) : (
          <Text style={styles.buyDetail}>Comprar: {adjustedNet} {unit} → {adjustedUnits} × {purchaseFormat?.description || 'formato'}</Text>
        )}
      </View>
      <View style={styles.actions}>
        <View style={styles.quantityControl}>
          <TouchableOpacity
            onPress={handleDecrement}
            style={styles.quantityButton}
            accessibilityRole="button"
            accessibilityLabel={`Reducir cantidad de ${displayName}`}
            disabled={item.purchaseUnits <= 1}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.quantityValue}>{item.purchaseUnits}</Text>
          <TouchableOpacity
            onPress={handleIncrement}
            style={styles.quantityButton}
            accessibilityRole="button"
            accessibilityLabel={`Aumentar cantidad de ${displayName}`}
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${displayName} de la lista`}
        >
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
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
  detail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  pantryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  pantryDetail: { fontSize: 12, color: '#237A45' },
  pantryInput: { borderBottomWidth: 1, borderBottomColor: '#9AC9AA', color: '#1A1A1A', fontSize: 13, minWidth: 42, padding: 1, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 7, marginTop: 7 },
  confirmButton: { backgroundColor: '#EEF2F5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  confirmButtonSelected: { backgroundColor: '#DDF5E5' },
  confirmButtonMissing: { backgroundColor: '#FDECEA' },
  confirmButtonText: { color: '#3F4A54', fontSize: 12, fontWeight: '600' },
  formatDetail: { fontSize: 12, color: '#667085', marginTop: 7 },
  buyDetail: { fontSize: 13, fontWeight: '600', color: '#1D4ED8', marginTop: 3 },
  unknownBuy: { backgroundColor: '#FFF7D6', borderRadius: 6, color: '#8A5A00', fontSize: 12, fontWeight: '600', marginTop: 6, padding: 6 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  quantityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    minWidth: 20,
    textAlign: 'center',
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 14,
    color: '#c00',
  },
});
