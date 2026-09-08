/**
 * PlatoPlan - RecipeDetailScreen
 * Displays recipe details with ingredients and delete functionality
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { RecipeStackParamList } from '../../navigation/types';
import { IngredientRow, ConfirmDialog } from '../../components';
import { useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';

type NavigationProp = NativeStackNavigationProp<RecipeStackParamList, 'RecipeDetail'>;
type DetailRouteProp = RouteProp<RecipeStackParamList, 'RecipeDetail'>;

export function RecipeDetailScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DetailRouteProp>();
  const { recipeId } = route.params;

  const { recipes, loading, error, deleteRecipe } = useRecipes();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;

  const handleEdit = () => {
    navigation.navigate('RecipeForm', { recipeId });
  };

  const handleDeletePress = () => {
    setDeleteDialogVisible(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteDialogVisible(false);
    await deleteRecipe(recipeId);
    navigation.goBack();
  };

  const handleCancelDelete = () => {
    setDeleteDialogVisible(false);
  };

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

  if (!recipe) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>{t('recipes.loadingRecipe')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.recipeName}>{recipe.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{t('recipes.typeLabel')}</Text>
            <Text style={styles.metaValue}>
              {t(`mealTypes.${recipe.mealType}` as any) || recipe.mealType}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{t('recipes.prepLabel')}</Text>
            <Text style={styles.metaValue}>
              {t(`prepTimes.${recipe.prepTime}` as any) || recipe.prepTime}
            </Text>
          </View>
        </View>

        {recipe.servings && (
          <View style={styles.servingsBadge}>
            <Text style={styles.servingsText}>
              {t('recipes.forPersons', { count: recipe.servings })}
            </Text>
          </View>
        )}

        {recipe.description ? (
          <>
            <Text style={styles.sectionTitle}>{t('recipes.description')}</Text>
            <Text style={styles.descriptionText}>{recipe.description}</Text>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{t('recipes.ingredients')}</Text>

        {recipe.ingredients.length === 0 ? (
          <Text style={styles.noIngredients}>{t('recipes.noIngredients')}</Text>
        ) : (
          recipe.ingredients.map((ingredient) => (
            <IngredientRow
              key={ingredient.ingredientId}
              ingredient={ingredient}
            />
          ))
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEdit}
          accessibilityRole="button"
          accessibilityLabel={t('common.edit')}
        >
          <Text style={styles.editButtonText}>{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeletePress}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={deleteDialogVisible}
        title={t('recipes.deleteRecipe')}
        message={t('recipes.deleteConfirm', { name: recipe.name })}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  recipeName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textFaint,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  noIngredients: {
    fontSize: 14,
    color: colors.textFaint,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  servingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  servingsText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accent,
  },
  descriptionText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textInverse,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: colors.dangerBg,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  errorText: {
    fontSize: 15,
    color: colors.danger,
    textAlign: 'center',
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
});
