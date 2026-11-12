/**
 * PlatoPlan - RecipeSelectionScreen
 * Allows user to select recipes for lunch and dinner slots:
 * - Two sections: Comidas and Cenas
 * - Type-filtered recipe lists
 * - Counter showing selected/required for each slot
 * - Confirm button enabled when counts match
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import type { PlanningStackParamList, MainTabParamList } from '../../navigation/types';
import type { Recipe, MenuPlan } from '../../models/types';
import { useRecipes, usePlanning, useIngredients } from '../../hooks';
import { planMealsBest } from '../../services/smart-distribution';
import { AlertCompat } from '../../utils/alert';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { confirmLeavePlan } from './confirmLeavePlan';
import { getRecipeEmoji } from '../../utils/recipeEmoji';
import Animated, { LinearTransition } from 'react-native-reanimated';
import {
  type RecipeSelection,
  selectionSignature,
  totalSelected,
  applySelectionDelta,
  clampSelections,
  sortRecipesBySelection,
  filterRecipesByQuery,
  saveSelectionDraft,
  loadSelectionDraft,
  clearSelectionDraft,
} from './selectionDraft';

type NavigationProp = NativeStackNavigationProp<PlanningStackParamList, 'RecipeSelection'>;
type ScreenRoute = RouteProp<PlanningStackParamList, 'RecipeSelection'>;

/** Smooth reorder when a recipe moves to/from the top of the list. */
const ROW_LAYOUT = LinearTransition.duration(320);

export function RecipeSelectionScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { planId } = route.params;

  const { recipes } = useRecipes();
  const { ingredients } = useIngredients();
  const { loadPlan, applyDistribution } = usePlanning();

  const [plan, setPlan] = useState<MenuPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [lunchSelections, setLunchSelections] = useState<RecipeSelection[]>([]);
  const [dinnerSelections, setDinnerSelections] = useState<RecipeSelection[]>([]);

  // Signature of the recipe counts loaded from the existing plan. If the user
  // returns to this step and doesn't change any quantity, we keep the manual
  // day-by-day arrangement they built in the calendar instead of regenerating.
  const loadedSignatureRef = useRef<string | null>(null);
  const hadAssignmentsRef = useRef(false);

  // Set once the initial state (plan assignments or restored draft) is in place,
  // so the draft-saving effect below never overwrites a stored draft with [].
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setPlanLoading(true);
    loadPlan(planId)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);

        let loadedLunch: RecipeSelection[] = [];
        let loadedDinner: RecipeSelection[] = [];

        // Editing an existing plan: seed the counters from its assignments.
        if (p && p.assignments && p.assignments.length > 0) {
          const lunchCounts: Record<string, number> = {};
          const dinnerCounts: Record<string, number> = {};

          p.assignments.forEach((assignment) => {
            if (assignment.slot === 'comida') {
              lunchCounts[assignment.recipeId] = (lunchCounts[assignment.recipeId] || 0) + 1;
            } else if (assignment.slot === 'cena') {
              dinnerCounts[assignment.recipeId] = (dinnerCounts[assignment.recipeId] || 0) + 1;
            }
          });

          loadedLunch = Object.entries(lunchCounts).map(([recipeId, count]) => ({ recipeId, count }));
          loadedDinner = Object.entries(dinnerCounts).map(([recipeId, count]) => ({ recipeId, count }));
          hadAssignmentsRef.current = true;
        } else {
          hadAssignmentsRef.current = false;
        }
        loadedSignatureRef.current = selectionSignature(loadedLunch, loadedDinner);

        // A draft (unsaved choices made before leaving this step, e.g. to create
        // a recipe) wins over the persisted assignments.
        const draft = p ? loadSelectionDraft(planId) : null;
        let initialLunch = loadedLunch;
        let initialDinner = loadedDinner;
        if (draft && p) {
          const lunchFree = p.freeDays.filter((fd) => fd.type === 'comida' || fd.type === 'ambas').length;
          const dinnerFree = p.freeDays.filter((fd) => fd.type === 'cena' || fd.type === 'ambas').length;
          initialLunch = clampSelections(draft.lunch, p.periodDays - lunchFree);
          initialDinner = clampSelections(draft.dinner, p.periodDays - dinnerFree);
        }
        setLunchSelections(initialLunch);
        setDinnerSelections(initialDinner);
        hydratedRef.current = true;
        setPlanLoading(false);
      })
      .catch(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Keep the draft in sync so the choices survive leaving the screen.
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveSelectionDraft(planId, { lunch: lunchSelections, dinner: dinnerSelections });
  }, [planId, lunchSelections, dinnerSelections]);

  const requiredLunches = useMemo(() => {
    if (!plan) return 0;
    const lunchFreeDays = plan.freeDays.filter(
      (fd) => fd.type === 'comida' || fd.type === 'ambas'
    ).length;
    return plan.periodDays - lunchFreeDays;
  }, [plan]);

  const requiredDinners = useMemo(() => {
    if (!plan) return 0;
    const dinnerFreeDays = plan.freeDays.filter(
      (fd) => fd.type === 'cena' || fd.type === 'ambas'
    ).length;
    return plan.periodDays - dinnerFreeDays;
  }, [plan]);

  // Filter recipes by type; chosen ones float to the top (animated via ROW_LAYOUT)
  const lunchRecipes = useMemo(
    () =>
      filterRecipesByQuery(
        sortRecipesBySelection(
          recipes.filter((r) => r.mealType === 'comida' || r.mealType === 'ambas'),
          lunchSelections,
          locale
        ),
        query
      ),
    [recipes, locale, lunchSelections, query]
  );

  const dinnerRecipes = useMemo(
    () =>
      filterRecipesByQuery(
        sortRecipesBySelection(
          recipes.filter((r) => r.mealType === 'cena' || r.mealType === 'ambas'),
          dinnerSelections,
          locale
        ),
        query
      ),
    [recipes, locale, dinnerSelections, query]
  );

  const totalLunchSelected = useMemo(
    () => totalSelected(lunchSelections),
    [lunchSelections]
  );

  const totalDinnerSelected = useMemo(
    () => totalSelected(dinnerSelections),
    [dinnerSelections]
  );

  const lunchCountMatch = totalLunchSelected === requiredLunches;
  const dinnerCountMatch = totalDinnerSelected === requiredDinners;
  // Gaps are allowed on purpose so the user can leave days to improvise.
  const canConfirm = totalLunchSelected + totalDinnerSelected > 0;
  const gapCount =
    Math.max(0, requiredLunches - totalLunchSelected) +
    Math.max(0, requiredDinners - totalDinnerSelected);

  const updateSelection = useCallback(
    (
      setSelections: React.Dispatch<React.SetStateAction<RecipeSelection[]>>,
      recipeId: string,
      delta: number,
      maxTotal: number
    ) => {
      setSelections((prev) => applySelectionDelta(prev, recipeId, delta, maxTotal));
    },
    []
  );

  const getSelectionCount = (
    selections: RecipeSelection[],
    recipeId: string
  ): number => {
    return selections.find((s) => s.recipeId === recipeId)?.count ?? 0;
  };

  const [generating, setGenerating] = useState(false);

  const runDistribution = useCallback(async () => {
    if (!plan) return;

    // If the plan already had a distribution and the user didn't change any
    // recipe quantity, keep the manual day arrangement (don't regenerate, which
    // would wipe the calendar layout). Just continue to the calendar.
    const currentSignature = selectionSignature(lunchSelections, dinnerSelections);
    if (hadAssignmentsRef.current && currentSignature === loadedSignatureRef.current) {
      clearSelectionDraft(planId);
      navigation.navigate('PlanCalendar', { planId });
      return;
    }

    setGenerating(true);
    try {
      const recipesById = new Map(recipes.map((r) => [r.id, r]));
      const toSelected = (selections: RecipeSelection[]) =>
        selections
          .map((s) => {
            const recipe = recipesById.get(s.recipeId);
            return recipe ? { recipeId: s.recipeId, recipe, count: s.count } : null;
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);

      const result = planMealsBest({
        periodDays: plan.periodDays,
        freeDays: plan.freeDays,
        elaborateDays: plan.elaborateDays,
        lunchSelections: toSelected(lunchSelections),
        dinnerSelections: toSelected(dinnerSelections),
        ingredientsById: new Map(ingredients.map((i) => [i.id, i])),
      });

      const applied = await applyDistribution(planId, result.assignments);
      if (!applied.success) {
        AlertCompat.alert(t('common.error'), t('common.retry'));
        return;
      }
      clearSelectionDraft(planId);
      navigation.navigate('PlanCalendar', { planId });
    } finally {
      setGenerating(false);
    }
  }, [
    plan,
    planId,
    recipes,
    ingredients,
    lunchSelections,
    dinnerSelections,
    applyDistribution,
    navigation,
    t,
  ]);

  // Opens the Recipes tab's form to create a recipe without abandoning the plan.
  // Passing returnToPlanId makes the form return here (this plan's recipe step)
  // once the recipe is saved or the user goes back.
  const handleCreateRecipe = useCallback(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
    if (parent) {
      parent.navigate('RecipesTab', { screen: 'RecipeForm', params: { returnToPlanId: planId } });
    }
  }, [navigation, planId]);

  const handleConfirm = useCallback(() => {
    if (gapCount > 0) {
      AlertCompat.alert(
        t('planning.gapsWarningTitle'),
        t('planning.gapsWarningMessage', { count: gapCount }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('planning.continueAnyway'), onPress: () => void runDistribution() },
        ]
      );
      return;
    }
    void runDistribution();
  }, [gapCount, runDistribution, t]);

  const renderRecipeItem = (
    recipe: Recipe,
    selections: RecipeSelection[],
    setSelections: React.Dispatch<React.SetStateAction<RecipeSelection[]>>,
    maxTotal: number
  ) => {
    const count = getSelectionCount(selections, recipe.id);
    const currentTotal = totalSelected(selections);
    const canAdd = currentTotal < maxTotal;

    return (
      <View style={[styles.recipeRow, count > 0 && styles.recipeRowSelected]}>
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeName}>{getRecipeEmoji(recipe)} {recipe.name}</Text>
          <Text style={styles.recipeMeta}>
            {recipe.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`}
          </Text>
        </View>
        <View style={styles.counterContainer}>
          <TouchableOpacity
            style={[styles.counterButton, count === 0 && styles.counterButtonDisabled]}
            onPress={() =>
              updateSelection(setSelections, recipe.id, -1, maxTotal)
            }
            disabled={count === 0}
            accessibilityRole="button"
            accessibilityLabel={`Reducir ${recipe.name}`}
          >
            <Text style={styles.counterButtonText}>−</Text>
          </TouchableOpacity>
          <Text
            style={styles.counterValue}
            accessibilityLabel={`${recipe.name}: ${count}`}
          >
            {count}
          </Text>
          <TouchableOpacity
            style={[styles.counterButton, !canAdd && styles.counterButtonDisabled]}
            onPress={() =>
              updateSelection(setSelections, recipe.id, 1, maxTotal)
            }
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityLabel={`Añadir ${recipe.name}`}
          >
            <Text style={styles.counterButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const lunchDiff = requiredLunches - totalLunchSelected;
  const dinnerDiff = requiredDinners - totalDinnerSelected;

  if (planLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ marginTop: 12, color: colors.textMuted }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.stepBadge}>{t('planning.stepCounter', { current: 6, total: 7 })}</Text>
          <Text style={styles.headerTitle}>{t('planning.selectRecipes')}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => confirmLeavePlan(t, () => navigation.navigate('PlanHistory' as any))}
          accessibilityRole="button"
        >
          <Text style={styles.exitButton}>{t('planning.exit')}</Text>
        </TouchableOpacity>
      </View>

      {/* Quick access to create a new recipe without leaving the plan flow.
          Opens the Recipes tab's form; on return the selection list refreshes
          automatically (recipes table invalidation), so the new recipe appears. */}
      <TouchableOpacity
        style={styles.newRecipeButton}
        onPress={handleCreateRecipe}
        accessibilityRole="button"
        accessibilityLabel={t('recipes.newRecipe')}
      >
        <Text style={styles.newRecipeButtonText}>＋ {t('recipes.newRecipe')}</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder={t('planning.searchRecipes')}
        placeholderTextColor={colors.textFaint}
        clearButtonMode="while-editing"
        accessibilityLabel={t('planning.searchRecipes')}
      />

      {/* Lunch Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🍽️ {t('planning.lunches')}</Text>
          <Text
            style={[
              styles.counter,
              lunchCountMatch ? styles.counterMatch : styles.counterMismatch,
            ]}
          >
            {totalLunchSelected}/{requiredLunches}
          </Text>
        </View>
        {lunchDiff > 0 && (
          <Text style={styles.diffText}>
            {t('planning.remaining', { count: lunchDiff })}
          </Text>
        )}
        {lunchRecipes.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('planning.noRecipesAvailable')}
          </Text>
        ) : (
          lunchRecipes.map((recipe) => (
            <Animated.View key={recipe.id} layout={ROW_LAYOUT}>
              {renderRecipeItem(recipe, lunchSelections, setLunchSelections, requiredLunches)}
            </Animated.View>
          ))
        )}
      </View>

      {/* Dinner Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🌙 {t('planning.dinners')}</Text>
          <Text
            style={[
              styles.counter,
              dinnerCountMatch ? styles.counterMatch : styles.counterMismatch,
            ]}
          >
            {totalDinnerSelected}/{requiredDinners}
          </Text>
        </View>
        {dinnerDiff > 0 && (
          <Text style={styles.diffText}>
            {t('planning.remaining', { count: dinnerDiff })}
          </Text>
        )}
        {dinnerRecipes.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('planning.noRecipesAvailable')}
          </Text>
        ) : (
          dinnerRecipes.map((recipe) => (
            <Animated.View key={recipe.id} layout={ROW_LAYOUT}>
              {renderRecipeItem(recipe, dinnerSelections, setDinnerSelections, requiredDinners)}
            </Animated.View>
          ))
        )}
      </View>

      {/* Gap notice: the plan can still be generated with empty slots */}
      {gapCount > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            {!lunchCountMatch &&
              `${t('planning.lunches')}: ${t('planning.selectedCount', { selected: totalLunchSelected, required: requiredLunches })}. `}
            {!dinnerCountMatch &&
              `${t('planning.dinners')}: ${t('planning.selectedCount', { selected: totalDinnerSelected, required: requiredDinners })}. `}
            {t('planning.gapsWarningMessage', { count: gapCount })}
          </Text>
        </View>
      )}

      {/* Confirm Button */}
      <TouchableOpacity
        style={[styles.confirmButton, (!canConfirm || generating) && styles.confirmButtonDisabled]}
        onPress={handleConfirm}
        disabled={!canConfirm || generating}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.confirmButtonText,
            (!canConfirm || generating) && styles.confirmButtonTextDisabled,
          ]}
        >
          {generating ? t('planning.generating') : t('planning.next')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginLeft: 12 },
  stepBadge: { fontSize: 12, fontWeight: '600', color: colors.textFaint, marginLeft: 12, textTransform: 'uppercase' },
  exitButton: { fontSize: 15, color: colors.dangerText, fontWeight: '600' },
  newRecipeButton: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  newRecipeButtonText: { fontSize: 14, fontWeight: '600', color: colors.accentText },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  counter: { fontSize: 16, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  counterMatch: { backgroundColor: colors.successBg, color: colors.successText },
  counterMismatch: { backgroundColor: colors.warningBg, color: colors.warningText },
  diffText: { fontSize: 13, color: colors.warningText, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textFaint, fontStyle: 'italic', paddingVertical: 12 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.surface, marginBottom: 16 },
  recipeRowSelected: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, borderRadius: 8 },
  recipeInfo: { flex: 1, marginRight: 12 },
  recipeName: { fontSize: 15, fontWeight: '500', color: colors.text },
  recipeMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  counterContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  counterButtonDisabled: { backgroundColor: colors.border },
  counterButtonText: { fontSize: 18, fontWeight: '600', color: colors.textInverse },
  counterValue: { fontSize: 16, fontWeight: '700', color: colors.text, minWidth: 24, textAlign: 'center' },
  warningBox: { backgroundColor: colors.warningBg, borderRadius: 8, padding: 12, marginBottom: 16 },
  warningText: { fontSize: 13, color: colors.warningText },
  confirmButton: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  confirmButtonDisabled: { backgroundColor: colors.borderStrong },
  confirmButtonText: { fontSize: 16, fontWeight: '600', color: colors.textInverse },
  confirmButtonTextDisabled: { color: colors.textFaint },
});