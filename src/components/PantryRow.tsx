import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import type { PantryEntry } from '../models/types';
import { categoryPresentation } from '../constants/ingredient-categories';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface PantryRowProps {
  entry: PantryEntry;
  onQuantityChange: (qty: number) => void;
  /** Renders the row muted, for catalogue ingredients not currently stocked. */
  dimmed?: boolean;
  onEdit?: () => void;
}

export const PantryRow: React.FC<PantryRowProps> = ({ entry, onQuantityChange, dimmed = false, onEdit }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayName = entry.ingredient?.name ?? entry.ingredientId;
  const unit = entry.ingredient?.unit ?? '';
  const categories = entry.ingredient?.categories ?? (entry.ingredient?.category ? [entry.ingredient.category] : []);
  const [quantityText, setQuantityText] = useState(String(entry.quantity));

  useEffect(() => setQuantityText(String(entry.quantity)), [entry.quantity]);

  const commitQuantity = () => {
    const quantity = Number.parseFloat(quantityText.replace(',', '.'));
    if (Number.isFinite(quantity) && quantity >= 0) onQuantityChange(quantity);
    else setQuantityText(String(entry.quantity));
  };

  const handleIncrement = () => {
    onQuantityChange(entry.quantity + 1);
  };

  const handleDecrement = () => {
    if (entry.quantity > 0) {
      onQuantityChange(entry.quantity - 1);
    }
  };

  return (
    <View style={[styles.container, dimmed && styles.containerDimmed]} accessibilityLabel={`Despensa: ${displayName}, cantidad ${entry.quantity}`}>
      <TouchableOpacity style={styles.info} onPress={onEdit} disabled={!onEdit} accessibilityRole={onEdit ? 'button' : undefined}>
        <Text style={[styles.name, dimmed && styles.nameDimmed]}>
          {displayName}{categories.length ? ` · ${categories.map((category) => `${categoryPresentation(category).emoji} ${category}`).join(', ')}` : ''}
        </Text>
        <Text style={styles.unit}>{unit}</Text>
      </TouchableOpacity>
      <View style={styles.quantityControl}>
        <TouchableOpacity
          onPress={handleDecrement}
          style={styles.quantityButton}
          accessibilityRole="button"
          accessibilityLabel={`Reducir cantidad de ${displayName}`}
          disabled={entry.quantity <= 0}
        >
          <Text style={styles.quantityButtonText}>−</Text>
        </TouchableOpacity>
        <TextInput style={styles.quantityValue} value={quantityText} onChangeText={setQuantityText} onBlur={commitQuantity} onSubmitEditing={commitQuantity} keyboardType="decimal-pad" accessibilityLabel={`Cantidad de ${displayName}`} />
        <TouchableOpacity
          onPress={handleIncrement}
          style={styles.quantityButton}
          accessibilityRole="button"
          accessibilityLabel={`Aumentar cantidad de ${displayName}`}
        >
          <Text style={styles.quantityButtonText}>+</Text>
        </TouchableOpacity>
      </View>
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
  containerDimmed: {
    backgroundColor: colors.card,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  nameDimmed: {
    color: colors.textFaint,
    fontWeight: '400',
  },
  unit: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    minWidth: 30,
    padding: 0,
    textAlign: 'center',
  },
});
