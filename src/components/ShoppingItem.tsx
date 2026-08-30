import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { ShoppingListItem } from '../models/types';
import { useI18n } from '../i18n';

export interface ShoppingItemProps {
  item: ShoppingListItem;
  pantryStatus: 'unknown' | 'confirmed' | 'none';
  onStatusChange: (status: 'confirmed' | 'none') => void;
  onQuantityChange: (qty: number) => void;
  onDelete: () => void;
  onInfo?: () => void; // NUEVO: Para ver las recetas
}

export const ShoppingItem: React.FC<ShoppingItemProps> = ({ 
  item, 
  pantryStatus,
  onStatusChange,
  onQuantityChange, 
  onDelete,
  onInfo
}) => {
  const { t } = useI18n();
  const [availableText, setAvailableText] = useState(String(item.pantryQuantityDeducted));
  
  const displayName = item.ingredient?.name ?? item.ingredientId;
  const categoryName = item.ingredient?.categories?.[0] ?? item.ingredient?.category ?? 'Otros';
  const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : '';
  const purchaseFormat = item.ingredient?.purchaseFormat;
  
  const confirmedAvailable = pantryStatus === 'none' ? 0 : Math.max(0, Number(availableText.replace(',', '.')) || 0);
  const adjustedNet = Math.max(0, item.totalQuantityNeeded - confirmedAvailable);

  const confirmPantry = (status: 'confirmed' | 'none') => {
    onStatusChange(status);
    const available = status === 'none' ? 0 : Math.max(0, Number(availableText.replace(',', '.')) || 0);
    const units = purchaseFormat?.quantity ? Math.ceil(Math.max(0, item.totalQuantityNeeded - available) / purchaseFormat.quantity) : item.purchaseUnits;
    onQuantityChange(units);
  };

  const handleIncrement = () => onQuantityChange(item.purchaseUnits + 1);
  const handleDecrement = () => {
    if (item.purchaseUnits > 0) onQuantityChange(item.purchaseUnits - 1);
  };

  return (
    <View style={[styles.container, item.purchaseUnits === 0 && styles.containerConfirmed]} accessibilityLabel={`${displayName}`}>
      <View style={styles.info}>
        
        <View style={styles.titleRow}>
          <Text style={[styles.name, item.purchaseUnits === 0 && styles.nameConfirmed]}>{displayName}</Text>
          {onInfo && (
            <TouchableOpacity onPress={onInfo} style={styles.infoButton}>
              <Text style={styles.infoButtonText}>ℹ️</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tagsRow}>
          <Text style={styles.categoryTag}>{categoryName}</Text>
          <Text style={styles.detail}>Plan: {item.totalQuantityNeeded} {unit}</Text>
        </View>
        
        <View style={styles.pantryRow}>
          <Text style={styles.pantryDetail}>Despensa prevista: {item.pantryQuantityDeducted} {unit}</Text>
          <TextInput value={availableText} onChangeText={setAvailableText} keyboardType="decimal-pad" style={styles.pantryInput} />
          <Text style={styles.pantryDetail}>{unit}</Text>
        </View>

        <View style={styles.confirmRow}>
          <TouchableOpacity onPress={() => confirmPantry('confirmed')} style={[styles.confirmButton, pantryStatus === 'confirmed' && styles.confirmButtonSelected]}>
            <Text style={[styles.confirmButtonText, pantryStatus === 'confirmed' && {color: '#1E5128'}]}>✓ Lo tengo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmPantry('none')} style={[styles.confirmButton, pantryStatus === 'none' && styles.confirmButtonMissing]}>
            <Text style={[styles.confirmButtonText, pantryStatus === 'none' && {color: '#900'}]}>No lo tengo</Text>
          </TouchableOpacity>
        </View>

        {pantryStatus === 'unknown' ? (
          <Text style={styles.unknownBuy}>? Confirma la despensa para calcular qué comprar.</Text>
        ) : (
          <Text style={styles.buyDetail}>
            {item.purchaseUnits === 0 ? '✔️ Todo listo' : `Comprar: ${adjustedNet} ${unit} → ${item.purchaseUnits} × ${purchaseFormat?.description || 'formato'}`}
          </Text>
        )}
      </View>
      
      <View style={styles.actions}>
        <View style={styles.quantityControl}>
          <TouchableOpacity onPress={handleDecrement} style={styles.quantityButton} disabled={item.purchaseUnits <= 0}>
            <Text style={styles.quantityButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.quantityValue}>{item.purchaseUnits}</Text>
          <TouchableOpacity onPress={handleIncrement} style={styles.quantityButton}>
            <Text style={styles.quantityButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  containerConfirmed: { backgroundColor: '#F9FFF9' },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  nameConfirmed: { color: '#237A45', textDecorationLine: 'line-through' },
  infoButton: { padding: 4, backgroundColor: '#F0F4F8', borderRadius: 12 },
  infoButtonText: { fontSize: 12 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  categoryTag: { fontSize: 10, backgroundColor: '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#475569', overflow: 'hidden' },
  detail: { fontSize: 12, color: '#666' },
  pantryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  pantryDetail: { fontSize: 12, color: '#237A45' },
  pantryInput: { borderBottomWidth: 1, borderBottomColor: '#9AC9AA', color: '#1A1A1A', fontSize: 13, minWidth: 42, padding: 1, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  confirmButton: { backgroundColor: '#EEF2F5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  confirmButtonSelected: { backgroundColor: '#DDF5E5', borderWidth: 1, borderColor: '#9AC9AA' },
  confirmButtonMissing: { backgroundColor: '#FDECEA', borderWidth: 1, borderColor: '#E6B0AA' },
  confirmButtonText: { color: '#3F4A54', fontSize: 12, fontWeight: '600' },
  buyDetail: { fontSize: 13, fontWeight: '600', color: '#1D4ED8', marginTop: 6 },
  unknownBuy: { backgroundColor: '#FFF7D6', borderRadius: 6, color: '#8A5A00', fontSize: 12, fontWeight: '600', marginTop: 6, padding: 6, alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { fontSize: 16, fontWeight: '600', color: '#333' },
  quantityValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', minWidth: 20, textAlign: 'center' },
  deleteButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee', alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, color: '#c00' },
});