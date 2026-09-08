/**
 * PlatoPlan - IngredientFormModal
 *
 * Modal overlay for creating a new ingredient inline.
 * Can be triggered from PantryScreen header, AddIngredientModal (zero results),
 * or RecipeFormScreen (zero results).
 *
 * Requirements: 1.2, 1.3, 1.5, 1.6
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import type { Ingredient } from '../models/types';
import type { CreateIngredientInput } from '../models/inputs';
import type { MeasureUnit } from '../models/enums';
import { useDatabase } from '../context/DatabaseContext';
import { IngredientService } from '../services/ingredient.service';
import { useI18n } from '../i18n';
import { DEFAULT_INGREDIENT_CATEGORIES } from '../constants/ingredient-categories';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface IngredientFormModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (ingredient: Ingredient) => void;
  initialName?: string;
  ingredient?: Ingredient;
  categorySuggestions?: string[];
}

interface FormErrors {
  name?: string;
  unit?: string;
  purchaseFormatDescription?: string;
  purchaseFormatQuantity?: string;
  category?: string;
}

export function IngredientFormModal({
  visible,
  onClose,
  onCreated,
  initialName,
  ingredient,
  categorySuggestions = [],
}: IngredientFormModalProps) {
  const { t } = useI18n();
  const db = useDatabase();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const unitOptions: { label: string; value: MeasureUnit }[] = [
    { label: t('units.gramos'), value: 'gramos' },
    { label: t('units.mililitros'), value: 'mililitros' },
    { label: t('units.unidades'), value: 'unidades' },
  ];

  // Form state
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<MeasureUnit | null>(null);
  const [purchaseFormatDescription, setPurchaseFormatDescription] = useState('');
  const [purchaseFormatQuantity, setPurchaseFormatQuantity] = useState('');
  const [category, setCategory] = useState('');

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill name from search query when modal opens
  useEffect(() => {
    if (visible) {
      setName(ingredient?.name ?? initialName ?? '');
      setUnit(ingredient?.unit ?? null);
      setPurchaseFormatDescription(ingredient?.purchaseFormat.description ?? '');
      setPurchaseFormatQuantity(ingredient ? String(ingredient.purchaseFormat.quantity) : '');
      setCategory((ingredient?.categories?.length ? ingredient.categories : ingredient?.category ? [ingredient.category] : []).join(', '));
      setErrors({});
      setIsSubmitting(false);
    }
  }, [visible, initialName, ingredient]);

  /**
   * Validates all form fields and returns true if valid.
   * Sets inline error messages for each invalid field.
   */
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = t('ingredientModal.nameRequired');
    } else if (trimmedName.length > 100) {
      newErrors.name = t('ingredientModal.nameMaxLength');
    }

    // Unit validation
    if (!unit) {
      newErrors.unit = t('ingredientModal.unitRequired');
    }

    // Purchase format description validation
    // Purchase format quantity validation
    const qty = parseFloat(purchaseFormatQuantity);
    if (!purchaseFormatQuantity.trim()) {
      newErrors.purchaseFormatQuantity = t('ingredientModal.quantityRequired');
    } else if (isNaN(qty) || qty <= 0) {
      newErrors.purchaseFormatQuantity = t('ingredientModal.quantityPositive');
    }

    // Category validation
    if (!category.trim()) {
      newErrors.category = t('ingredientModal.categoryRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, unit, purchaseFormatDescription, purchaseFormatQuantity, category, t]);

  /**
   * Checks for duplicate ingredient name (case-insensitive).
   * Returns true if a duplicate exists.
   */
  const checkDuplicate = useCallback(async (): Promise<boolean> => {
    const service = new IngredientService(db);
    const trimmedName = name.trim();

    try {
      const results = await service.search(trimmedName);
      const duplicate = results.find(
        (ing) => ing.name.trim().toLowerCase() === trimmedName.toLowerCase() && ing.id !== ingredient?.id
      );

      if (duplicate) {
        setErrors((prev) => ({
          ...prev,
          name: t('ingredientModal.duplicateName'),
        }));
        return true;
      }
    } catch {
      // If search fails, let creation attempt handle it
    }

    return false;
  }, [db, name, t, ingredient?.id]);

  /**
   * Handles form submission: validates fields, checks duplicates, creates ingredient.
   */
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    // Validate fields
    if (!validate()) return;

    // Check for duplicates
    setIsSubmitting(true);
    const isDuplicate = await checkDuplicate();
    if (isDuplicate) {
      setIsSubmitting(false);
      return;
    }

    // Create ingredient
    try {
      const service = new IngredientService(db);
      const input: CreateIngredientInput = {
        name: name.trim(),
        unit: unit!,
        purchaseFormat: {
          description: purchaseFormatDescription.trim(),
          quantity: parseFloat(purchaseFormatQuantity),
        },
        category: category.trim(),
      };

      const categories = [...new Set(category.split(',').map((value) => value.trim()).filter(Boolean))];
      input.category = categories[0];
      input.categories = categories;
      const savedIngredient = ingredient ? await service.update(ingredient.id, input) : await service.create(input);
      onCreated(savedIngredient);
      onClose();
    } catch (e: unknown) {
      const err = e as { type?: string; message?: string; fields?: { field: string; message: string }[] };
      if (err.type === 'conflict') {
        setErrors((prev) => ({
          ...prev,
          name: t('ingredientModal.duplicateName'),
        }));
      } else if (err.type === 'validation' && err.fields) {
        const fieldErrors: FormErrors = {};
        for (const f of err.fields) {
          if (f.field === 'name') fieldErrors.name = f.message;
          if (f.field === 'unit') fieldErrors.unit = f.message;
          if (f.field === 'purchaseFormat.description') fieldErrors.purchaseFormatDescription = f.message;
          if (f.field === 'purchaseFormat.quantity') fieldErrors.purchaseFormatQuantity = f.message;
          if (f.field === 'category') fieldErrors.category = f.message;
        }
        setErrors(fieldErrors);
      } else {
        setErrors((prev) => ({
          ...prev,
          name: t('recipes.saveErrorRetry'),
        }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    validate,
    checkDuplicate,
    db,
    name,
    unit,
    purchaseFormatDescription,
    purchaseFormatQuantity,
    category,
    onCreated,
    onClose,
    t,
    ingredient,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{ingredient ? t('common.edit') : t('ingredientModal.title')}</Text>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={t('common.save')}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.saveText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Name field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('ingredientModal.name')}</Text>
                <TextInput
                  style={[styles.input, errors.name && styles.inputError]}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder={t('ingredientModal.namePlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  maxLength={100}
                  autoFocus={!initialName}
                  accessibilityLabel={t('ingredientModal.name')}
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              {/* Unit picker */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('ingredientModal.unit')}</Text>
                <View style={styles.unitPicker}>
                  {unitOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.unitOption,
                        unit === option.value && styles.unitOptionSelected,
                      ]}
                      onPress={() => {
                        setUnit(option.value);
                        if (errors.unit) setErrors((prev) => ({ ...prev, unit: undefined }));
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: unit === option.value }}
                      accessibilityLabel={option.label}
                    >
                      <Text
                        style={[
                          styles.unitOptionText,
                          unit === option.value && styles.unitOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.unit && <Text style={styles.errorText}>{errors.unit}</Text>}
              </View>

              {/* Purchase format description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('ingredientModal.purchaseFormatDesc')} ({t('ingredientModal.optional')})</Text>
                <TextInput
                  style={[styles.input, errors.purchaseFormatDescription && styles.inputError]}
                  value={purchaseFormatDescription}
                  onChangeText={(text) => {
                    setPurchaseFormatDescription(text);
                    if (errors.purchaseFormatDescription)
                      setErrors((prev) => ({ ...prev, purchaseFormatDescription: undefined }));
                  }}
                  placeholder={t('ingredientModal.purchaseFormatDescPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel={t('ingredientModal.purchaseFormatDesc')}
                />
                {errors.purchaseFormatDescription && (
                  <Text style={styles.errorText}>{errors.purchaseFormatDescription}</Text>
                )}
              </View>

              {/* Purchase format quantity */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('ingredientModal.purchaseFormatQty')}</Text>
                <TextInput
                  style={[styles.input, errors.purchaseFormatQuantity && styles.inputError]}
                  value={purchaseFormatQuantity}
                  onChangeText={(text) => {
                    setPurchaseFormatQuantity(text);
                    if (errors.purchaseFormatQuantity)
                      setErrors((prev) => ({ ...prev, purchaseFormatQuantity: undefined }));
                  }}
                  placeholder={t('ingredientModal.purchaseFormatQtyPlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('ingredientModal.purchaseFormatQty')}
                />
                {errors.purchaseFormatQuantity && (
                  <Text style={styles.errorText}>{errors.purchaseFormatQuantity}</Text>
                )}
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('ingredientModal.category')}</Text>
                <TextInput
                  style={[styles.input, errors.category && styles.inputError]}
                  value={category}
                  onChangeText={(text) => {
                    setCategory(text);
                    if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
                  }}
                  placeholder={`${t('ingredientModal.categoryPlaceholder')} (separa varias con comas)`}
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel={t('ingredientModal.category')}
                />
                {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
                <View style={styles.suggestions}>
                  {DEFAULT_INGREDIENT_CATEGORIES.map((option) => (
                    <TouchableOpacity key={option.name} style={[styles.suggestion, { backgroundColor: option.backgroundColor }]} onPress={() => {
                      const selected = category.split(',').map((value) => value.trim()).filter(Boolean);
                      if (!selected.some((value) => value.toLowerCase() === option.name.toLowerCase())) setCategory([...selected, option.name].join(', '));
                    }}>
                      <Text style={[styles.suggestionText, { color: option.color }]}>{option.emoji} {option.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {categorySuggestions.length > 0 && (
                  <View style={styles.suggestions}>
                    {categorySuggestions.map((suggestion) => (
                      <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => {
                        const selected = category.split(',').map((value) => value.trim()).filter(Boolean);
                        if (!selected.some((value) => value.toLowerCase() === suggestion.toLowerCase())) setCategory([...selected, suggestion].join(', '));
                      }}>
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  keyboardAvoidingView: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  cancelText: {
    fontSize: 15,
    color: colors.accent,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  body: {
    maxHeight: 480,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    height: 44,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  suggestion: { backgroundColor: colors.accentSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  suggestionText: { color: colors.accent, fontSize: 12 },
  unitPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  unitOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  unitOptionTextSelected: {
    color: colors.textInverse,
  },
});
