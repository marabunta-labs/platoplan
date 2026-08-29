/**
 * PlatoPlan - SuggestedRecipesScreen
 * Shows recipes the user can make with current pantry inventory.
 * Grouped by: 100% coverage and >70% coverage.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import type { PantryStackParamList, MainTabParamList, RecipeStackParamList } from '../../navigation/types';
import { usePantry, useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import { getSuggestedRecipes, type SuggestedRecipe } from '../../services/pantry-suggestions.service';

type NavigationProp = NativeStackNavigationProp<PantryStackParamList, 'SuggestedRecipes'>;

export function SuggestedRecipesScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const { pantryEntries, loading: pantryLoading } = usePantry();
  const { recipes, loading: recipesLoading } = useRecipes();

  const loading = pantryLoading || recipesLoading;

  const suggestions = useMemo(() => {
    if (loading) return [];
    return getSuggestedRecipes(recipes, pantryEntries, 0.7);
  }, [recipes, pantryEntries, loading]);

  const fullCoverage = useMemo(
    () => suggestions.filter((s) => s.coverage >= 1.0),
    [suggestions]
  );

  const partialCoverage = useMemo(
    () => suggestions.filter((s) => s.coverage < 1.0),
    [suggestions]
  );

  const handleRecipePress = (recipeId: string) => {
    // Navigate to the Recipes tab's RecipeDetail screen
    const parent = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
    if (parent) {
      parent.navigate('RecipesTab', {
        screen: 'RecipeDetail',
        params: { recipeId },
      });
    }
  };

  const renderSuggestionCard = ({ item }: { item: SuggestedRecipe }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleRecipePress(item.recipe.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.recipe.name}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.recipe.name}</Text>
        <View style={styles.cardBadges}>
          <View style={[styles.badge, item.recipe.prepTime === 'elaborado' ? styles.badgeElaborate : styles.badgeQuick]}>
            <Text style={styles.badgeText}>
              {item.recipe.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`}
            </Text>
          </View>
          <View style={[styles.badge, item.coverage >= 1.0 ? styles.badgeFull : styles.badgePartial]}>
            <Text style={styles.badgeText}>
              {Math.round(item.coverage * 100)}%
            </Text>
          </View>
        </View>
      </View>
      {item.missingIngredients.length > 0 && (
        <View style={styles.missingSection}>
          <Text style={styles.missingTitle}>{t('pantry.missingTitle')}</Text>
          {item.missingIngredients.map((mi, idx) => (
            <Text key={idx} style={styles.missingItem}>
              • {mi.name} ({t('pantry.moreNeeded', { qty: mi.needed - mi.available, unit: t(`units.${mi.unit}` as any) || mi.unit })})
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('pantry.analyzing')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('pantry.suggestedTitle')}</Text>
      </View>

      {suggestions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {t('pantry.noSuggestionsDetail')}
          </Text>
          <Text style={styles.emptyHint}>
            {t('pantry.noSuggestionsHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(fullCoverage.length > 0
              ? [{ type: 'header' as const, title: `${t('pantry.fullCoverage')} (${fullCoverage.length})` }]
              : []),
            ...fullCoverage.map((s) => ({ type: 'item' as const, data: s })),
            ...(partialCoverage.length > 0
              ? [{ type: 'header' as const, title: `${t('pantry.partialCoverage')} (${partialCoverage.length})` }]
              : []),
            ...partialCoverage.map((s) => ({ type: 'item' as const, data: s })),
          ]}
          keyExtractor={(item, index) =>
            item.type === 'header' ? `header-${index}` : `item-${item.data.recipe.id}`
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{item.title}</Text>
                </View>
              );
            }
            return renderSuggestionCard({ item: item.data });
          }}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    fontSize: 15,
    color: '#007AFF',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  cardBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeElaborate: {
    backgroundColor: '#FFF3E0',
  },
  badgeQuick: {
    backgroundColor: '#E8F5E9',
  },
  badgeFull: {
    backgroundColor: '#C8E6C9',
  },
  badgePartial: {
    backgroundColor: '#FFF9C4',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555',
  },
  missingSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  missingTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 2,
  },
  missingItem: {
    fontSize: 12,
    color: '#888',
    paddingLeft: 4,
    marginBottom: 1,
  },
});
