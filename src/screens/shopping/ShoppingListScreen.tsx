/**
 * PlatoPlan - ShoppingListScreen
 * Displays shopping list items grouped by category with SectionList,
 * stale notification banner, and empty state.
 * Uses ResponsiveLayout for multi-column grid on wide viewports (> 1024px).
 *
 * Requirements: 3.2, 3.5
 */

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { ShoppingListItem } from '../../models/types';
import { ShoppingItem, EmptyState } from '../../components';
import { ResponsiveLayout, MULTI_COLUMN_BREAKPOINT } from '../../components/ResponsiveLayout';
import { useShoppingList, usePlanning } from '../../hooks';
import { useI18n } from '../../i18n';
import { shareText } from '../../utils/share';
import type { ShoppingStackParamList } from '../../navigation/types';

// --- Interfaces for section data ---

interface ShoppingSection {
  title: string;
  data: ShoppingListItem[];
}

// --- Component ---

export function ShoppingListScreen() {
  const { t, locale } = useI18n();
  const route = useRoute<RouteProp<ShoppingStackParamList, 'ShoppingList'>>();
  const { activePlan, loadPlan } = usePlanning();
  const { shoppingList, loading, error, editQuantity, removeItem, regenerate, loadByPlanId, generate } =
    useShoppingList();

  const requestedPlanId = route.params?.planId;
  const planId = requestedPlanId ?? activePlan?.id;

  // Prefer the plan explicitly opened from the calendar. This prevents the
  // shopping tab from silently showing another draft plan.
  React.useEffect(() => {
    if (planId) {
      loadPlan(planId);
      loadByPlanId(planId);
    }
  }, [planId, loadPlan, loadByPlanId]);

  const activeItems = useMemo(() => {
    if (!shoppingList) return [];
    return shoppingList.items.filter((item) => !item.isRemoved);
  }, [shoppingList]);

  const sections: ShoppingSection[] = useMemo(() => {
    if (activeItems.length === 0) return [];

    const grouped: Record<string, ShoppingListItem[]> = {};

    for (const item of activeItems) {
      const category = item.ingredient?.categories?.[0] ?? item.ingredient?.category ?? t('shopping.otherCategory');
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    }

    // Sort items alphabetically within each category
    const sortedSections = Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b, locale))
      .map((category) => ({
        title: category,
        data: grouped[category].sort((a, b) => {
          const nameA = a.ingredient?.name ?? a.ingredientId;
          const nameB = b.ingredient?.name ?? b.ingredientId;
          return nameA.localeCompare(nameB, locale);
        }),
      }));

    return sortedSections;
  }, [activeItems, locale, t]);

  const handleQuantityChange = useCallback(
    async (itemId: string, newQuantity: number) => {
      if (!shoppingList) return;
      await editQuantity(shoppingList.id, itemId, newQuantity);
    },
    [shoppingList, editQuantity]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!shoppingList) return;
      await removeItem(shoppingList.id, itemId);
    },
    [shoppingList, removeItem]
  );

  const handleRegenerate = useCallback(async () => {
    if (!shoppingList) return;
    await regenerate(shoppingList.id);
  }, [shoppingList, regenerate]);

  const handleGenerate = useCallback(async () => {
    if (!planId) return;
    await generate(planId);
  }, [planId, generate]);

  const handleExportList = useCallback(() => {
    if (sections.length === 0) return;

    let text = `🛒 ${t('shopping.shareTitle')}\n\n`;

    for (const section of sections) {
      text += `${section.title.toUpperCase()}:\n`;
      for (const item of section.data) {
        const name = item.ingredient?.name ?? item.ingredientId;
        const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : t('units.unidades');
        text += `• ${name} - ${item.purchaseUnits} ${unit}\n`;
      }
      text += '\n';
    }

    shareText(t('shopping.shareTitle'), text.trim());
  }, [sections, t]);

  const { width } = useWindowDimensions();
  const isWideViewport = width > MULTI_COLUMN_BREAKPOINT;

  const renderShoppingItem = useCallback(
    ({ item }: { item: ShoppingListItem }) => (
      <ShoppingItem
        item={item}
        onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
        onDelete={() => handleDeleteItem(item.id)}
      />
    ),
    [handleQuantityChange, handleDeleteItem]
  );

  const shoppingKeyExtractor = useCallback(
    (item: ShoppingListItem) => item.id,
    []
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState message={error} actionLabel={planId ? t('common.retry') : undefined} onAction={planId ? () => loadByPlanId(planId) : undefined} />
      </View>
    );
  }

  // Empty state: no shopping list or no active items
  if (!shoppingList || activeItems.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          message={
            planId
              ? t('shopping.notGenerated')
              : t('shopping.empty')
          }
          actionLabel={
            planId
              ? t('shopping.generate')
              : undefined
          }
          onAction={
            planId ? handleGenerate : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with export button */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderTitle}>{t('shopping.title')}</Text>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleExportList}
          accessibilityRole="button"
          accessibilityLabel={t('shopping.share')}
        >
          <Text style={styles.shareButtonText}>{t('shopping.share')}</Text>
        </TouchableOpacity>
      </View>

      {shoppingList.isStale && (
        <View
          style={styles.staleBanner}
          accessibilityRole="alert"
          accessibilityLabel={t('shopping.stale')}
        >
          <Text style={styles.staleBannerText}>
            {t('shopping.stale')}
          </Text>
          <TouchableOpacity
            onPress={handleRegenerate}
            style={styles.regenerateButton}
            accessibilityRole="button"
            accessibilityLabel={t('shopping.regenerate')}
          >
            <Text style={styles.regenerateButtonText}>{t('shopping.regenerate')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isWideViewport ? (
        <ResponsiveLayout
          data={activeItems}
          renderItem={renderShoppingItem}
          keyExtractor={shoppingKeyExtractor}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ShoppingItem
              item={item}
              onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
              onDelete={() => handleDeleteItem(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  shareButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 1,
    borderBottomColor: '#FFB74D',
  },
  staleBannerText: {
    fontSize: 13,
    color: '#E65100',
    flex: 1,
    marginRight: 12,
  },
  regenerateButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FF9800',
    borderRadius: 6,
  },
  regenerateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 16,
  },
});
