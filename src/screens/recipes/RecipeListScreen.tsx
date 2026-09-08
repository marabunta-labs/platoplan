/**
 * PlatoPlan - RecipeListScreen
 * Displays alphabetically sorted list of recipes with empty state.
 * Uses ResponsiveLayout for multi-column grid on wide viewports (> 1024px).
 *
 * Requirements: 3.2, 3.5
 */

import React, { useCallback, useMemo, useState } from 'react';
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
import { RecipeCard, EmptyState, ResponsiveLayout, SortControl, type SortDirection } from '../../components';
import { useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import type { Recipe } from '../../models/types';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';

type NavigationProp = NativeStackNavigationProp<RecipeStackParamList, 'RecipeList'>;

type RecipeSortField = 'name' | 'mealType';

export function RecipeListScreen() {
  const { t, locale } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const { recipes, loading, error } = useRecipes();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sortField, setSortField] = useState<RecipeSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedRecipes = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...recipes].sort((a, b) => {
      if (sortField === 'mealType') {
        const typeCompare = a.mealType.localeCompare(b.mealType, locale);
        if (typeCompare !== 0) return typeCompare * dir;
      }
      return a.name.localeCompare(b.name, locale) * dir;
    });
  }, [recipes, sortField, sortDirection, locale]);

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
        <ActivityIndicator size="large" color={colors.accent} />
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
        <>
          <View style={styles.toolbar}>
            <SortControl<RecipeSortField>
              fields={[
                { key: 'name', label: t('common.sortName') },
                { key: 'mealType', label: t('common.sortMealType') },
              ]}
              activeField={sortField}
              direction={sortDirection}
              onFieldChange={setSortField}
              onDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            />
          </View>
          <ResponsiveLayout
            data={sortedRecipes}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
          />
        </>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  listContent: {
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 15,
    color: colors.danger,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: colors.textInverse,
    fontWeight: '300',
    marginTop: -2,
  },
});
