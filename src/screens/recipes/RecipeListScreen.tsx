/**
 * PlatoPlan - RecipeListScreen
 * Displays sorted list of recipes with empty state and a labelled
 * "New recipe" header button (coherent with the Pantry screen).
 * Uses ResponsiveLayout for multi-column grid on wide viewports (> 1024px)
 * when sorting by name, and grouped sections (Comidas / Cenas) when
 * sorting by meal type.
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
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RecipeStackParamList } from '../../navigation/types';
import { RecipeCard, EmptyState, ResponsiveLayout, SortControl, SearchBar, type SortDirection } from '../../components';
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
  const [query, setQuery] = useState('');

  // Recipes filtered by the search query (case/accent-insensitive on name).
  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  // Flat, name-sorted list honoring sort direction (used for the 'name' view
  // and as the base ordering within each meal-type group).
  const sortedByName = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filteredRecipes].sort((a, b) => a.name.localeCompare(b.name, locale) * dir);
  }, [filteredRecipes, sortDirection, locale]);

  // Recipes grouped into Comidas / Cenas. 'ambas' appears in both groups
  // because such a recipe can be used for either meal. Ordering within each
  // group reuses the name sort above (so sortDirection is honored).
  const mealTypeSections = useMemo(() => {
    const lunches = sortedByName.filter(
      (r) => r.mealType === 'comida' || r.mealType === 'ambas'
    );
    const dinners = sortedByName.filter(
      (r) => r.mealType === 'cena' || r.mealType === 'ambas'
    );
    return [
      { key: 'comida', title: t('planning.lunches'), data: lunches },
      { key: 'cena', title: t('planning.dinners'), data: dinners },
    ];
  }, [sortedByName, t]);

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

  const isEmpty = recipes.length === 0;

  return (
    <View style={styles.container}>
      {/* Header: title + labelled "New recipe" button. Always visible so the
          empty state renders below it. Matches the Pantry screen pattern. */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('recipes.title')}</Text>
        <TouchableOpacity
          style={styles.newRecipeButton}
          onPress={handleAddRecipe}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.addIngredientFab')}
        >
          <Text style={styles.newRecipeButtonText}>＋ {t('recipes.addIngredientFab')}</Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <EmptyState
          message={t('recipes.emptyState')}
          actionLabel={t('recipes.addIngredientFab')}
          onAction={handleAddRecipe}
        />
      ) : (
        <>
          <View style={styles.searchBar}>
            <SearchBar
              placeholder={t('recipes.searchRecipe')}
              onSearch={setQuery}
            />
          </View>

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

          {sortedByName.length === 0 ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>{t('recipes.noRecipesFound')}</Text>
            </View>
          ) : sortField === 'mealType' ? (
            <ScrollView contentContainerStyle={styles.listContent}>
              {mealTypeSections.map((section) => (
                <View key={section.key}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{section.title}</Text>
                    <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
                  </View>
                  {section.data.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      onPress={() => handleRecipePress(recipe.id)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : (
            <ResponsiveLayout
              data={sortedByName}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  newRecipeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  newRecipeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textInverse,
  },
  searchBar: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  noResults: {
    alignItems: 'center',
    padding: 32,
  },
  noResultsText: {
    fontSize: 15,
    color: colors.textFaint,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 10,
    backgroundColor: colors.card,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
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
});
