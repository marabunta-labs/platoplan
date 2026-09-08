import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { ShoppingListItem, MenuPlan, Recipe } from '../../models/types';
import { ShoppingItem, EmptyState, SortControl, type SortDirection } from '../../components';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { MULTI_COLUMN_BREAKPOINT } from '../../components/ResponsiveLayout';
import { useShoppingList, usePlanning, useRecipes } from '../../hooks';
import { useI18n } from '../../i18n';
import { shareText } from '../../utils/share';
import type { ShoppingStackParamList } from '../../navigation/types';

interface ShoppingSection {
  title: string;
  data: ShoppingListItem[];
  type: 'pending' | 'buy' | 'done';
}

export function ShoppingListScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<RouteProp<ShoppingStackParamList, 'ShoppingList'>>();
  const navigation = useNavigation();
  
  // Extraemos 'history' y 'loadPlans' para recargar
  const { activePlan, loadPlan, history, loadPlans } = usePlanning();
  const { shoppingList, loading, editQuantity, removeItem, regenerate, loadByPlanId, generate, confirmPantryQuantity } = useShoppingList();
  const { recipes } = useRecipes();

  const [reviewedItems, setReviewedItems] = useState<Record<string, 'confirmed' | 'none'>>({});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [ingredientInfo, setIngredientInfo] = useState<ShoppingListItem | null>(null);
  const [sortField, setSortField] = useState<'category' | 'name'>('category');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado local blindado para asegurar que los planes llegan al desplegable
  const [allPlans, setAllPlans] = useState<MenuPlan[]>([]);

  const requestedPlanId = route.params?.planId;
  const currentPlanId = requestedPlanId ?? activePlan?.id;
  const isCustomList = currentPlanId === 'custom_list_current';

  // useFocusEffect se ejecuta CADA VEZ que pisas la pestaña de la Lista de la Compra
  useFocusEffect(
    useCallback(() => {
      if (loadPlans) {
        loadPlans()
          .then((plans) => {
            if (plans) setAllPlans(plans);
          })
          .catch(console.error);
      }
    }, [loadPlans])
  );

  // Usamos los planes recién cargados, o el history si fallan, o el plan activo
  const availablePlans = allPlans.length > 0 ? allPlans : (history && history.length > 0 ? history : (activePlan ? [activePlan] : []));
  const currentPlan = availablePlans.find(p => p.id === currentPlanId) || activePlan;

  useEffect(() => {
    if (currentPlanId) {
      if (!isCustomList) loadPlan(currentPlanId);
      loadByPlanId(currentPlanId);
    }
  }, [currentPlanId, isCustomList, loadPlan, loadByPlanId]);

  useEffect(() => {
    if (shoppingList?.isStale && !isCustomList && !loading) {
      regenerate(shoppingList.id).catch(console.error);
    }
  }, [shoppingList?.isStale, shoppingList?.id, isCustomList, regenerate, loading]);

  const planRecipes = useMemo(() => {
    if (!currentPlan?.assignments) return [];
    const counts = new Map<string, { recipe: Recipe; count: number }>();
    
    currentPlan.assignments.forEach(a => {
      const recipeObj = a.recipe || recipes.find(r => r.id === a.recipeId);
      if (recipeObj) {
        const existing = counts.get(recipeObj.id);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(recipeObj.id, { recipe: recipeObj, count: 1 });
        }
      }
    });
    return Array.from(counts.values());
  }, [currentPlan, recipes]);

  const allVisibleItems = useMemo(() => {
    if (!shoppingList) return [];
    return shoppingList.items.filter((item) => !item.isRemoved);
  }, [shoppingList]);

  const sections: ShoppingSection[] = useMemo(() => {
    if (allVisibleItems.length === 0) return [];

    const pending: ShoppingListItem[] = [];
    const toBuy: ShoppingListItem[] = [];
    const done: ShoppingListItem[] = [];

    for (const item of allVisibleItems) {
      // Keyed by ingredientId (stable) — item.id changes on every regeneration.
      const status = reviewedItems[item.ingredientId] || (item.purchaseUnits <= 0 ? 'confirmed' : 'unknown');
      
      if (status === 'unknown') {
        pending.push(item);
      } else if (status === 'none' || item.purchaseUnits > 0) {
        toBuy.push(item);
      } else {
        done.push(item);
      }
    }

    const dir = sortDirection === 'asc' ? 1 : -1;
    const sortFn = (a: ShoppingListItem, b: ShoppingListItem) => {
      const nameA = a.ingredient?.name ?? a.ingredientId;
      const nameB = b.ingredient?.name ?? b.ingredientId;
      if (sortField === 'category') {
        const catA = a.ingredient?.category || '';
        const catB = b.ingredient?.category || '';
        if (catA !== catB) return catA.localeCompare(catB, locale) * dir;
      }
      return nameA.localeCompare(nameB, locale) * dir;
    };

    const res: ShoppingSection[] = [];
    if (pending.length > 0) res.push({ title: t('shopping.sectionPending', { count: pending.length }), data: pending.sort(sortFn), type: 'pending' });
    if (toBuy.length > 0) res.push({ title: t('shopping.sectionBuy', { count: toBuy.length }), data: toBuy.sort(sortFn), type: 'buy' });
    if (done.length > 0) res.push({ title: t('shopping.sectionDone', { count: done.length }), data: done.sort(sortFn), type: 'done' });

    return res;
  }, [allVisibleItems, reviewedItems, locale, t, sortField, sortDirection]);

  const getRecipesForIngredient = (ingredientId: string) => {
    return planRecipes
      .filter((pr) => pr.recipe.ingredients.some((ri) => ri.ingredientId === ingredientId))
      .map((pr) => {
        const ri = pr.recipe.ingredients.find((x) => x.ingredientId === ingredientId);
        const perRecipe = ri?.quantity ?? 0;
        return { ...pr, perRecipe, subtotal: perRecipe * pr.count };
      });
  };

  const handleQuantityChange = useCallback(async (itemId: string, newQuantity: number) => {
    if (!shoppingList) return;
    await editQuantity(shoppingList.id, itemId, newQuantity);
  }, [shoppingList, editQuantity]);

  const handleConfirmPantry = useCallback(async (ingredientId: string, availableQuantity: number) => {
    if (!shoppingList) return;
    await confirmPantryQuantity(shoppingList.id, ingredientId, availableQuantity);
  }, [shoppingList, confirmPantryQuantity]);

  const handleDeleteItem = useCallback(async (itemId: string) => {
    if (!shoppingList) return;
    await removeItem(shoppingList.id, itemId);
  }, [shoppingList, removeItem]);

  const handleGenerate = useCallback(async () => {
    if (!currentPlanId || isCustomList) return;
    await generate(currentPlanId);
  }, [currentPlanId, isCustomList, generate]);

  const handleExportList = useCallback(() => {
    if (!shoppingList || allVisibleItems.length === 0) return;

    let text = `${t('shopping.exportTitle')}\n`;
    if (currentPlan && !isCustomList) {
      text += `${t('shopping.exportPlanLine', { name: currentPlan.name || formatDate(currentPlan.startDate) })}\n\n`;
    } else {
      text += `\n`;
    }

    const toBuyItems = allVisibleItems.filter(item => item.purchaseUnits > 0);

    if (toBuyItems.length === 0) {
      text += `${t('shopping.exportNothing')}\n`;
    } else {
      const grouped: Record<string, ShoppingListItem[]> = {};
      for (const item of toBuyItems) {
        const cat = item.ingredient?.category || t('shopping.otherCategory');
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }

      for (const [cat, items] of Object.entries(grouped)) {
        text += `\n📦 ${cat.toUpperCase()}:\n`;
        for (const item of items) {
          const name = item.ingredient?.name ?? item.ingredientId;
          const unit = item.ingredient?.unit ? (t(`units.${item.ingredient.unit}` as any) || item.ingredient.unit) : '';
          const purchaseFormat = item.ingredient?.purchaseFormat;
          const formatStr = purchaseFormat 
            ? `${item.purchaseUnits} × ${purchaseFormat.description} (${purchaseFormat.quantity} ${unit})`
            : `${item.purchaseUnits} ${unit}`;
            
          text += `  • ${name}: ${formatStr}\n`;
        }
      }
    }

    shareText(t('shopping.shareTitle'), text);
  }, [shoppingList, allVisibleItems, currentPlan, isCustomList, t]);

  const { width } = useWindowDimensions();
  const isWideViewport = width > MULTI_COLUMN_BREAKPOINT;

  const renderShoppingItem = ({ item }: { item: ShoppingListItem }) => {
    const status = reviewedItems[item.ingredientId] || (item.purchaseUnits <= 0 ? 'confirmed' : 'unknown');
    return (
      <View style={[{ opacity: item.purchaseUnits <= 0 ? 0.6 : 1 }, isWideViewport && styles.gridItemContainer]}>
        <ShoppingItem
          item={item}
          pantryStatus={status}
          onStatusChange={(newStatus) => setReviewedItems(prev => ({...prev, [item.ingredientId]: newStatus}))}
          onConfirmPantry={(available) => handleConfirmPantry(item.ingredientId, available)}
          onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
          onDelete={() => handleDeleteItem(item.id)}
          onInfo={() => setIngredientInfo(item)}
        />
      </View>
    );
  };

  const formatDate = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  const getPlanLabel = (plan: MenuPlan) => {
    const name = plan.name ? `${plan.name} ` : '';
    return `${name}(${formatDate(plan.startDate)}) - ${plan.assignments?.length || 0} comidas`;
  };

  if (loading && !shoppingList) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  let headerTitle = isCustomList ? t('shopping.customList') : (currentPlan ? getPlanLabel(currentPlan) : t('shopping.title'));

  return (
    <View style={styles.container}>
      <View style={styles.listHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.planSelector} 
          onPress={() => !isCustomList && setPickerVisible(true)}
          disabled={isCustomList || availablePlans.length <= 1}
        >
          <Text style={styles.listHeaderTitle} numberOfLines={1}>{headerTitle}</Text>
          {!isCustomList && availablePlans.length > 1 && <Text style={styles.dropdownIcon}>▼</Text>}
        </TouchableOpacity>
        
        <View style={styles.headerActionsGroup}>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.successBg, borderColor: colors.success }]} onPress={handleExportList}>
            <Text style={[styles.headerBtnText, { color: colors.successText }]}>{t('shopping.export')}</Text>
          </TouchableOpacity>

          {!isCustomList && currentPlanId && (
            <TouchableOpacity 
              style={[styles.headerBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} 
              onPress={() => navigation.navigate('PlanningTab' as any, { 
                screen: 'PlanCalendar', 
                params: { planId: currentPlanId } 
              })}
            >
              <Text style={[styles.headerBtnText, { color: colors.accentText }]}>{t('shopping.editMenu')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>{t('shopping.selectPlan')}</Text>
            <FlatList
              data={availablePlans}
              keyExtractor={(p) => p.id}
              renderItem={({ item: p }) => (
                <TouchableOpacity style={[styles.planPickerItem, currentPlanId === p.id && styles.planPickerItemSelected]} onPress={() => { loadPlan(p.id); loadByPlanId(p.id); setPickerVisible(false); }}>
                  <Text style={[styles.planPickerText, currentPlanId === p.id && styles.planPickerTextSelected]}>{getPlanLabel(p)}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.pickerCloseButton} onPress={() => setPickerVisible(false)}>
              <Text style={styles.pickerCloseText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!ingredientInfo} transparent animationType="slide" onRequestClose={() => setIngredientInfo(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.recipesContainer}>
            <View style={styles.recipesHeader}>
              <View>
                <Text style={styles.recipesTitle}>{t('shopping.usedIn')}</Text>
                <Text style={styles.ingredientSubtitle}>{ingredientInfo?.ingredient?.name ?? ingredientInfo?.ingredientId}</Text>
              </View>
              <TouchableOpacity onPress={() => setIngredientInfo(null)}>
                <Text style={styles.recipesClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={ingredientInfo ? getRecipesForIngredient(ingredientInfo.ingredientId) : []}
              keyExtractor={(r) => r.recipe.id}
              ListEmptyComponent={<Text style={{padding: 16, color: colors.textMuted}}>{t('shopping.notInAnyRecipe')}</Text>}
              renderItem={({ item }) => {
                const infoUnit = ingredientInfo?.ingredient?.unit
                  ? (t(`units.${ingredientInfo.ingredient.unit}` as any) || ingredientInfo.ingredient.unit)
                  : '';
                return (
                  <View style={styles.recipeItem}>
                    <Text style={styles.recipeName}>
                      <Text style={styles.recipeMultiplier}>{item.count}x </Text>
                      {item.recipe.name}
                    </Text>
                    <Text style={styles.recipeMeta}>{item.recipe.mealType} · {item.recipe.prepTime}</Text>
                    <Text style={styles.recipeQuantity}>
                      {t('shopping.usedQuantity', { per: item.perRecipe, unit: infoUnit, count: item.count, subtotal: item.subtotal })}
                    </Text>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {(!shoppingList || allVisibleItems.length === 0) ? (
        <EmptyState 
          message={isCustomList ? t('shopping.noRecipesAdded') : (currentPlanId ? t('shopping.notGenerated') : t('shopping.empty'))} 
          actionLabel={!isCustomList && currentPlanId ? t('shopping.generate') : undefined} 
          onAction={!isCustomList && currentPlanId ? handleGenerate : undefined} 
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.sortToolbar}>
            <SortControl<'category' | 'name'>
              fields={[
                { key: 'category', label: t('common.sortCategory') },
                { key: 'name', label: t('common.sortName') },
              ]}
              activeField={sortField}
              direction={sortDirection}
              onFieldChange={setSortField}
              onDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            />
          </View>
          {sections.map(section => (
            <View key={section.type} style={styles.sectionContainer}>
              <View style={[
                styles.sectionHeader, 
                section.type === 'pending' ? styles.headerPending : section.type === 'buy' ? styles.headerBuy : styles.headerDone
              ]}>
                <Text style={[
                  styles.sectionHeaderText,
                  section.type === 'pending' ? styles.headerTextPending : section.type === 'buy' ? styles.headerTextBuy : styles.headerTextDone
                ]}>
                  {section.title}
                </Text>
              </View>
              
              <View style={isWideViewport ? styles.gridContainer : undefined}>
                {section.data.map(item => (
                  <View key={item.id} style={isWideViewport ? styles.gridItem : undefined}>
                    {renderShoppingItem({ item })}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { marginRight: 12, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.card, borderRadius: 8 },
  backButtonText: { fontSize: 14, color: colors.text, fontWeight: 'bold' },
  planSelector: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  listHeaderTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  dropdownIcon: { fontSize: 12, color: colors.textFaint, marginLeft: 6 },
  
  headerActionsGroup: { flexDirection: 'row', gap: 6 },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  headerBtnText: { fontSize: 13, fontWeight: '600' },
  
  sectionContainer: { marginBottom: 16 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  headerPending: { backgroundColor: colors.warningBg, borderBottomColor: colors.warning },
  headerTextPending: { color: colors.warningText },
  headerBuy: { backgroundColor: colors.accentSoft, borderBottomColor: colors.accent },
  headerTextBuy: { color: colors.accentText },
  headerDone: { backgroundColor: colors.successBg, borderBottomColor: colors.success },
  headerTextDone: { color: colors.successText },

  listContent: { paddingBottom: 16 },
  sortToolbar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, marginTop: 8 },
  gridItem: { width: '50%', padding: 8 },
  gridItemContainer: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', height: '100%' },
  
  pickerOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 },
  pickerContainer: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, maxHeight: '80%' },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  planPickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  planPickerItemSelected: { backgroundColor: colors.accentSoft },
  planPickerText: { fontSize: 15, color: colors.text },
  planPickerTextSelected: { color: colors.accent, fontWeight: 'bold' },
  pickerCloseButton: { marginTop: 12, padding: 14, backgroundColor: colors.card, borderRadius: 8, alignItems: 'center' },
  pickerCloseText: { color: colors.text, fontWeight: '600' },

  recipesContainer: { backgroundColor: colors.surface, borderRadius: 12, maxHeight: '70%', marginTop: 'auto', paddingBottom: 24 },
  recipesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  recipesTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  ingredientSubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  recipesClose: { fontSize: 20, color: colors.textFaint, paddingHorizontal: 8 },
  recipeItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  recipeName: { fontSize: 16, fontWeight: '500', color: colors.text },
  recipeMultiplier: { color: colors.accent, fontWeight: 'bold' },
  recipeMeta: { fontSize: 13, color: colors.textFaint, marginTop: 4, textTransform: 'capitalize' },
  recipeQuantity: { fontSize: 13, color: colors.accent, marginTop: 4, fontWeight: '600' },
});