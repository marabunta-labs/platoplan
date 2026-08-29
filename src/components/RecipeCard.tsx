import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Recipe } from '../models/types';
import { useI18n } from '../i18n';

export interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onPress }) => {
  const { t } = useI18n();

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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    fontSize: 12,
    color: '#555',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
