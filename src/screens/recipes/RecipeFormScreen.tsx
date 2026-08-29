/**
 * PlatoPlan - RecipeFormScreen
 * Form for creating/editing recipes with validation and ingredient management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AlertCompat } from '../../utils/alert';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { RecipeStackParamList } from '../../navigation/types';
import type { MealType, PrepTime } from '../../models/enums';
import type { RecipeIngredient, Ingredient } from '../../models/types';
import { IngredientRow, SearchBar, IngredientFormModal, Stepper } from '../../components';
import { useRecipes, useIngredients } from '../../hooks';
import { useI18n } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<RecipeStackParamList, 'RecipeForm'>;
type FormRouteProp = RouteProp<RecipeStackParamList, 'RecipeForm'>;

export function RecipeFormScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<FormRouteProp>();
  const isEditing = !!route.params?.recipeId;

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'comida', label: t('mealTypes.comida') },
    { value: 'cena', label: t('mealTypes.cena') },
    { value: 'ambas', label: t('mealTypes.ambas') },
  ];

  const prepTimeOptions: { value: PrepTime; label: string }[] = [
    { value: 'rapido', label: t('prepTimes.rapido') },
    { value: 'elaborado', label: t('prepTimes.elaborado') },
  ];

  const { recipes, createRecipe, updateRecipe } = useRecipes();
  const { searchIngredients } = useIngredients();

  // Form state
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('comida');
  const [prepTime, setPrepTime] = useState<PrepTime>('rapido');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [saving, setSaving] = useState(false);

  // Ingredient search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Ingredient[]>([]);

  // Ingredient creation modal state
  const [showIngredientForm, setShowIngredientForm] = useState(false);

  // Pending ingredient (waiting for quantity input)
  const [pendingIngredient, setPendingIngredient] = useState<Ingredient | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState('');

  // Editing existing ingredient quantity
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState('');

  // Load existing recipe data for editing
  useEffect(() => {
    if (isEditing && route.params?.recipeId) {
      const existing = recipes.find((r) => r.id === route.params.recipeId);
      if (existing) {
        setName(existing.name);
        setMealType(existing.mealType);
        setPrepTime(existing.prepTime);
        setDescription(existing.description ?? '');
        setServings(existing.servings ?? 1);
        setIngredients(existing.ingredients);
      }
    }
  }, [isEditing, route.params?.recipeId, recipes]);

  // Validation
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validate = (): boolean => {
    const newErrors: { name?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('recipes.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const parsedServings = Math.max(1, Math.min(20, servings || 1));
      const input = {
        name: name.trim(),
        mealType,
        prepTime,
        description: description.trim(),
        servings: parsedServings,
        ingredients: ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
        })),
      };

      if (isEditing && route.params?.recipeId) {
        const result = await updateRecipe(route.params.recipeId, input);
        if (result && !result.success) {
          const msg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : 'message' in result.error
                ? result.error.message
                : t('recipes.saveError');
          AlertCompat.alert(t('common.error'), msg);
          return;
        }
      } else {
        const result = await createRecipe(input);
        if (result && !result.success) {
          const msg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : 'message' in result.error
                ? result.error.message
                : t('recipes.saveError');
          AlertCompat.alert(t('common.error'), msg);
          return;
        }
      }
      navigation.goBack();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t('recipes.saveErrorRetry');
      AlertCompat.alert(t('common.error'), errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectIngredient = (ingredient: Ingredient) => {
    const alreadyAdded = ingredients.some(
      (i) => i.ingredientId === ingredient.id
    );
    if (alreadyAdded) {
      AlertCompat.alert(t('recipes.duplicateIngredientTitle'), t('recipes.duplicateIngredientMessage'));
      return;
    }

    // Show quantity input instead of adding directly
    setPendingIngredient(ingredient);
    setPendingQuantity('');
  };

  const handleConfirmAddIngredient = () => {
    if (!pendingIngredient) return;

    const qty = parseFloat(pendingQuantity);
    if (isNaN(qty) || qty <= 0) {
      AlertCompat.alert(t('recipes.invalidQuantityTitle'), t('recipes.invalidQuantityMessage'));
      return;
    }

    setIngredients([
      ...ingredients,
      {
        ingredientId: pendingIngredient.id,
        ingredient: pendingIngredient,
        quantity: qty,
      },
    ]);
    setPendingIngredient(null);
    setPendingQuantity('');
    setSearchQuery('');
  };

  const handleCancelPending = () => {
    setPendingIngredient(null);
    setPendingQuantity('');
  };

  const handleRemoveIngredient = (ingredientId: string) => {
    setIngredients(ingredients.filter((i) => i.ingredientId !== ingredientId));
  };

  const handleEditIngredient = (ingredientId: string) => {
    const existing = ingredients.find((i) => i.ingredientId === ingredientId);
    if (existing) {
      setEditingIngredientId(ingredientId);
      setEditingQuantity(String(existing.quantity));
    }
  };

  const handleConfirmEditQuantity = () => {
    if (!editingIngredientId) return;

    const qty = parseFloat(editingQuantity);
    if (isNaN(qty) || qty <= 0) {
      AlertCompat.alert(t('recipes.invalidQuantityTitle'), t('recipes.invalidQuantityMessage'));
      return;
    }

    setIngredients(
      ingredients.map((i) =>
        i.ingredientId === editingIngredientId ? { ...i, quantity: qty } : i
      )
    );
    setEditingIngredientId(null);
    setEditingQuantity('');
  };

  const handleCancelEdit = () => {
    setEditingIngredientId(null);
    setEditingQuantity('');
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      const results = await searchIngredients(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const formatPurchaseInfo = (ingredient: Ingredient): string => {
    const { purchaseFormat, unit } = ingredient;
    if (purchaseFormat.description && purchaseFormat.quantity) {
      return t('recipes.format', {
        desc: purchaseFormat.description,
        qty: purchaseFormat.quantity,
        unit: t(`units.${unit}` as any) || unit,
      });
    }
    return t('recipes.formatUnit', { unit: t(`units.${unit}` as any) || unit });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? t('recipes.editRecipe') : t('recipes.newRecipe')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Name field */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.name')}</Text>
          <TextInput
            style={[styles.textInput, errors.name ? styles.inputError : undefined]}
            value={name}
            onChangeText={setName}
            placeholder={t('recipes.namePlaceholder')}
            placeholderTextColor="#999"
            accessibilityLabel={t('recipes.name')}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* Meal type selector */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.mealType')}</Text>
          <View style={styles.optionRow}>
            {mealTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  mealType === option.value && styles.optionButtonActive,
                ]}
                onPress={() => setMealType(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: mealType === option.value }}
                accessibilityLabel={option.label}
              >
                <Text
                  style={[
                    styles.optionText,
                    mealType === option.value && styles.optionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Prep time selector */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.prepTime')}</Text>
          <View style={styles.optionRow}>
            {prepTimeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionButton,
                  prepTime === option.value && styles.optionButtonActive,
                ]}
                onPress={() => setPrepTime(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: prepTime === option.value }}
                accessibilityLabel={option.label}
              >
                <Text
                  style={[
                    styles.optionText,
                    prepTime === option.value && styles.optionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Servings field */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.servings')}</Text>
          <Stepper
            value={servings}
            onChange={setServings}
            min={1}
            max={20}
            label={t('recipes.servings')}
          />
          <Text style={styles.hintText}>{t('recipes.servingsHint')}</Text>
        </View>

        {/* Description field */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.description')}</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('recipes.descriptionPlaceholder')}
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            accessibilityLabel={t('recipes.description')}
          />
        </View>

        {/* Ingredients section */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('recipes.ingredients')}</Text>

          <SearchBar
            placeholder={t('recipes.searchIngredient')}
            onSearch={handleSearch}
          />

          {/* Search results */}
          {searchQuery.length > 0 && searchResults.length > 0 && !pendingIngredient && (
            <View style={styles.searchResults}>
              {searchResults.map((ingredient) => (
                <TouchableOpacity
                  key={ingredient.id}
                  style={styles.searchResultItem}
                  onPress={() => handleSelectIngredient(ingredient)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.add')} ${ingredient.name}`}
                >
                  <Text style={styles.searchResultText}>{ingredient.name}</Text>
                  <Text style={styles.searchResultUnit}>{t(`units.${ingredient.unit}` as any) || ingredient.unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Pending ingredient - quantity input card */}
          {pendingIngredient && (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingName}>{pendingIngredient.name}</Text>
              <Text style={styles.pendingFormat}>
                {formatPurchaseInfo(pendingIngredient)}
              </Text>
              <View style={styles.pendingInputRow}>
                <TextInput
                  style={[styles.textInput, styles.quantityInput]}
                  value={pendingQuantity}
                  onChangeText={setPendingQuantity}
                  placeholder={t('recipes.quantity')}
                  placeholderTextColor="#999"
                  keyboardType="decimal-pad"
                  autoFocus
                  accessibilityLabel={`${t('recipes.quantity')} (${t(`units.${pendingIngredient.unit}` as any) || pendingIngredient.unit})`}
                />
                <Text style={styles.unitLabel}>{t(`units.${pendingIngredient.unit}` as any) || pendingIngredient.unit}</Text>
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={styles.pendingCancelButton}
                  onPress={handleCancelPending}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.pendingCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pendingConfirmButton}
                  onPress={handleConfirmAddIngredient}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.add')}
                >
                  <Text style={styles.pendingConfirmText}>{t('common.add')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {searchQuery.length > 0 && searchResults.length === 0 && !pendingIngredient && (
            <View style={styles.noResultsContainer}>
              <Text style={styles.noResults}>
                {t('recipes.noResults')}
              </Text>
              <TouchableOpacity
                style={styles.createIngredientButton}
                onPress={() => setShowIngredientForm(true)}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.createIngredient')}
              >
                <Text style={styles.createIngredientText}>{t('recipes.createIngredient')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Current ingredient list */}
          {ingredients.length > 0 && (
            <View style={styles.ingredientList}>
              {ingredients.map((ingredient) => (
                <View key={ingredient.ingredientId}>
                  {editingIngredientId === ingredient.ingredientId ? (
                    <View style={styles.editQuantityCard}>
                      <Text style={styles.editQuantityName}>
                        {ingredient.ingredient?.name ?? ingredient.ingredientId}
                      </Text>
                      <View style={styles.pendingInputRow}>
                        <TextInput
                          style={[styles.textInput, styles.quantityInput]}
                          value={editingQuantity}
                          onChangeText={setEditingQuantity}
                          keyboardType="decimal-pad"
                          autoFocus
                          accessibilityLabel={t('recipes.newQuantityA11y', { unit: ingredient.ingredient?.unit ?? '' })}
                        />
                        <Text style={styles.unitLabel}>
                          {ingredient.ingredient?.unit ? (t(`units.${ingredient.ingredient.unit}` as any) || ingredient.ingredient.unit) : ''}
                        </Text>
                      </View>
                      <View style={styles.pendingActions}>
                        <TouchableOpacity
                          style={styles.pendingCancelButton}
                          onPress={handleCancelEdit}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.cancel')}
                        >
                          <Text style={styles.pendingCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.pendingConfirmButton}
                          onPress={handleConfirmEditQuantity}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.save')}
                        >
                          <Text style={styles.pendingConfirmText}>{t('common.save')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <IngredientRow
                      ingredient={ingredient}
                      onEdit={() => handleEditIngredient(ingredient.ingredientId)}
                      onDelete={() => handleRemoveIngredient(ingredient.ingredientId)}
                    />
                  )}
                </View>
              ))}
            </View>
          )}

          {ingredients.length === 0 && (
            <Text style={styles.noIngredients}>
              {t('recipes.addIngredient')}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Save button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? t('recipes.saveChanges') : t('recipes.createRecipeAction')}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? t('recipes.saveChanges') : t('recipes.createRecipeAction')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Ingredient creation modal */}
      <IngredientFormModal
        visible={showIngredientForm}
        onClose={() => setShowIngredientForm(false)}
        onCreated={(ingredient) => {
          // Show quantity input for the newly created ingredient
          setShowIngredientForm(false);
          handleSelectIngredient(ingredient);
        }}
        initialName={searchQuery}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    color: '#007AFF',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginLeft: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  multilineInput: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },
  inputError: {
    borderColor: '#c00',
  },
  errorText: {
    fontSize: 12,
    color: '#c00',
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  optionTextActive: {
    color: '#fff',
  },
  searchResults: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  searchResultUnit: {
    fontSize: 12,
    color: '#888',
  },
  noResults: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  createIngredientButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  createIngredientText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  ingredientList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  noIngredients: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  // Pending ingredient card styles
  pendingCard: {
    marginTop: 8,
    padding: 14,
    backgroundColor: '#f8f9ff',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
  },
  pendingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  pendingFormat: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  pendingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityInput: {
    flex: 1,
  },
  unitLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  pendingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  pendingCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  pendingCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  pendingConfirmButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  pendingConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Edit quantity card
  editQuantityCard: {
    padding: 14,
    backgroundColor: '#fffbf0',
    borderWidth: 1,
    borderColor: '#f0c040',
    borderRadius: 8,
    marginVertical: 4,
  },
  editQuantityName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  saveButton: {
    paddingVertical: 14,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
