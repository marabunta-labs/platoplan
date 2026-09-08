import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Recipe } from '../models/types';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onPress }) => {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Receta: ${recipe.name}`}
    >
      <Text style={styles.name}>{recipe.name}</Text>
      <View style={styles.details}>
        <Text style={styles.badge}>
          {t(`mealTypes.${recipe.mealType}` as any) || recipe.mealType}
        </Text>
        <Text style={styles.badge}>
          {t(`prepTimes.${recipe.prepTime}` as any) || recipe.prepTime}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
