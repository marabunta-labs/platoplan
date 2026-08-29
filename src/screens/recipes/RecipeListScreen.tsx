/**
 * PlatoPlan - RecipeListScreen
 * Displays alphabetically sorted list of recipes with empty state.
 * Uses ResponsiveLayout for multi-column grid on wide viewports (> 1024px).
 *
 * Requirements: 3.2, 3.5
 */

import React, { useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RecipeStackParamList } from '../../navigation/types';
import { RecipeCard, EmptyState, ResponsiveLayout } from '../../components';
import { useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import type { Recipe } from '../../models/types';

type NavigationProp = NativeStackNavigationProp<RecipeStackParamList, 'RecipeList'>;

export function RecipeListScreen() {
  const { t, locale } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const { recipes, loading, error } = useRecipes();

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, locale)
  );

  const handleRecipePress = (recipeId: string) => {
    navigation.navigate('RecipeDetail', { recipeId });
  };

  const handleAddRecipe = () => {
    navigation.navigate('RecipeForm', {});
  };

  const renderItem = useCallback(
    ({ item }: { item: Recipe }) => (
      <RecipeCard
        recipe={item}
        onPress={() => handleRecipePress(item.id)}
      />
    ),
    []
  );

  const keyExtractor = useCallback((item: Recipe) => item.id, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sortedRecipes.length === 0 ? (
        <EmptyState
          message={t('recipes.emptyState')}
          actionLabel={t('recipes.addIngredientFab')}
          onAction={handleAddRecipe}
        />
      ) : (
        <ResponsiveLayout
          data={sortedRecipes}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
        />
      )}

      {sortedRecipes.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAddRecipe}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.addIngredientFab')}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  listContent: {
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#c00',
    textAlign: 'center',
    padding: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
