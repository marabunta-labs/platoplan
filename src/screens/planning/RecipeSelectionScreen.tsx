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
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { PlanningStackParamList } from '../../navigation/types';
import type { Recipe, MenuPlan } from '../../models/types';
import { useRecipes, usePlanning, useIngredients } from '../../hooks';
import { planMeals } from '../../services/smart-distribution';
import { AlertCompat } from '../../utils/alert';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { confirmLeavePlan } from './confirmLeavePlan';

type NavigationProp = NativeStackNavigationProp<PlanningStackParamList, 'RecipeSelection'>;
type ScreenRoute = RouteProp<PlanningStackParamList, 'RecipeSelection'>;

interface RecipeSelection {
  recipeId: string;
  count: number;
}

/** Stable, order-independent signature of the selected recipe counts. */
function selectionSignature(lunch: RecipeSelection[], dinner: RecipeSelection[]): string {
  const norm = (list: RecipeSelection[]) =>
    list
      .filter((s) => s.count > 0)
      .map((s) => `${s.recipeId}:${s.count}`)
      .sort()
      .join(',');
  return `L[${norm(lunch)}]D[${norm(dinner)}]`;
}

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

  const [lunchSelections, setLunchSelections] = useState<RecipeSelection[]>([]);
  const [dinnerSelections, setDinnerSelections] = useState<RecipeSelection[]>([]);

  // Signature of the recipe counts loaded from the existing plan. If the user
  // returns to this step and doesn't change any quantity, we keep the manual
  // day-by-day arrangement they built in the calendar instead of regenerating.
  const loadedSignatureRef = useRef<string | null>(null);
  const hadAssignmentsRef = useRef(false);

  useEffect(() => {
    setPlanLoading(true);
    loadPlan(planId).then((p) => {
      setPlan(p);
      
      // MEJORA: Si el plan ya tiene recetas asignadas (estamos editando), las cargamos en los contadores
      if (p && p.assignments && p.assignments.length > 0) {
        const lunchCounts: Record<string, number> = {};
        const dinnerCounts: Record<string, number> = {};
        
        p.assignments.forEach(assignment => {
          if (assignment.slot === 'comida') {
            lunchCounts[assignment.recipeId] = (lunchCounts[assignment.recipeId] || 0) + 1;
          } else if (assignment.slot === 'cena') {
            dinnerCounts[assignment.recipeId] = (dinnerCounts[assignment.recipeId] || 0) + 1;
          }
        });
        
        const loadedLunch = Object.entries(lunchCounts).map(([recipeId, count]) => ({ recipeId, count }));
        const loadedDinner = Object.entries(dinnerCounts).map(([recipeId, count]) => ({ recipeId, count }));
        setLunchSelections(loadedLunch);
        setDinnerSelections(loadedDinner);
        loadedSignatureRef.current = selectionSignature(loadedLunch, loadedDinner);
        hadAssignmentsRef.current = true;
      } else {
        loadedSignatureRef.current = selectionSignature([], []);
        hadAssignmentsRef.current = false;
      }
      
      setPlanLoading(false);
    });
  }, [planId]);

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

  // Filter recipes by type
  const lunchRecipes = useMemo(
    () =>
      recipes.filter(
        (r) => r.mealType === 'comida' || r.mealType === 'ambas'
      ).sort((a, b) => {
        const selected = (lunchSelections.find((selection) => selection.recipeId === b.id)?.count ?? 0) - (lunchSelections.find((selection) => selection.recipeId === a.id)?.count ?? 0);
        return selected || a.name.localeCompare(b.name, locale);
      }),
    [recipes, locale, lunchSelections]
  );

  const dinnerRecipes = useMemo(
    () =>
      recipes.filter(
        (r) => r.mealType === 'cena' || r.mealType === 'ambas'
      ).sort((a, b) => {
        const selected = (dinnerSelections.find((selection) => selection.recipeId === b.id)?.count ?? 0) - (dinnerSelections.find((selection) => selection.recipeId === a.id)?.count ?? 0);
        return selected || a.name.localeCompare(b.name, locale);
      }),
    [recipes, locale, dinnerSelections]
  );

  const totalLunchSelected = useMemo(
    () => lunchSelections.reduce((sum, s) => sum + s.count, 0),
    [lunchSelections]
  );

  const totalDinnerSelected = useMemo(
    () => dinnerSelections.reduce((sum, s) => sum + s.count, 0),
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
      selections: RecipeSelection[],
      setSelections: React.Dispatch<React.SetStateAction<RecipeSelection[]>>,
      recipeId: string,
      delta: number,
      maxTotal: number
    ) => {
      setSelections((prev) => {
        const currentTotal = prev.reduce((sum, s) => sum + s.count, 0);
        const existing = prev.find((s) => s.recipeId === recipeId);
        const currentCount = existing?.count ?? 0;
        const newCount = Math.max(0, currentCount + delta);

        // Don't exceed required total
        if (delta > 0 && currentTotal >= maxTotal) return prev;

        if (newCount === 0) {
          return prev.filter((s) => s.recipeId !== recipeId);
        }
        if (existing) {
          return prev.map((s) =>
            s.recipeId === recipeId ? { ...s, count: newCount } : s
          );
        }
        return [...prev, { recipeId, count: newCount }];
      });
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

      const result = planMeals({
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
    const currentTotal = selections.reduce((sum, s) => sum + s.count, 0);
    const canAdd = currentTotal < maxTotal;

    return (
      <View style={styles.recipeRow}>
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.recipeMeta}>
            {recipe.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`}
          </Text>
        </View>
        <View style={styles.counterContainer}>
          <TouchableOpacity
            style={[styles.counterButton, count === 0 && styles.counterButtonDisabled]}
            onPress={() =>
              updateSelection(selections, setSelections, recipe.id, -1, maxTotal)
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
              updateSelection(selections, setSelections, recipe.id, 1, maxTotal)
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
            <View key={recipe.id}>
              {renderRecipeItem(recipe, lunchSelections, setLunchSelections, requiredLunches)}
            </View>
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
            <View key={recipe.id}>
              {renderRecipeItem(recipe, dinnerSelections, setDinnerSelections, requiredDinners)}
            </View>
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