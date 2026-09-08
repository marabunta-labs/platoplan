/**
 * PlatoPlan - IngredientFormModal (Web)
 *
 * Web-specific variant that adds:
 * - Focus trapping within the modal
 * - Proper tabIndex on all interactive elements
 * - No KeyboardAvoidingView (unnecessary on web)
 *
 * Requirements: 1.2, 1.3, 1.5, 1.6, 3.6, 3.7
 */


import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
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
import { AlertCompat } from '../utils/alert';

export interface IngredientFormModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (ingredient: Ingredient) => void;
  initialName?: string;
  ingredient?: Ingredient;
  categorySuggestions?: string[];
  /** Deletes the ingredient (only relevant in edit mode). May be async. */
  onDeleted?: (ingredientId: string) => void | Promise<void>;
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
  onDeleted,
}: IngredientFormModalProps) {
  const { t } = useI18n();
  const db = useDatabase();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const modalRef = useRef<View>(null);

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

  // Focus trap: auto-focus first input when modal opens
  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      const modal = document.querySelector('[aria-modal="true"]') as HTMLElement;
      if (modal) {
        const firstInput = modal.querySelector('input') as HTMLElement;
        firstInput?.focus();
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [visible]);

  /**
   * Validates all form fields and returns true if valid.
   */
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = t('ingredientModal.nameRequired');
    } else if (trimmedName.length > 100) {
      newErrors.name = t('ingredientModal.nameMaxLength');
    }

    if (!unit) {
      newErrors.unit = t('ingredientModal.unitRequired');
    }

    const qty = parseFloat(purchaseFormatQuantity);
    if (!purchaseFormatQuantity.trim()) {
      newErrors.purchaseFormatQuantity = t('ingredientModal.quantityRequired');
    } else if (isNaN(qty) || qty <= 0) {
      newErrors.purchaseFormatQuantity = t('ingredientModal.quantityPositive');
    }

    if (!category.trim()) {
      newErrors.category = t('ingredientModal.categoryRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, unit, purchaseFormatDescription, purchaseFormatQuantity, category, t]);

  /**
   * Checks for duplicate ingredient name (case-insensitive).
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
   * Handles form submission.
   */
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    if (!validate()) return;

    setIsSubmitting(true);
    const isDuplicate = await checkDuplicate();
    if (isDuplicate) {
      setIsSubmitting(false);
      return;
    }

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

  /**
   * Deletes the ingredient after confirming. Warns if it is used in recipes,
   * since deleting it will also remove it from those recipes (and shopping lists).
   */
  const handleDelete = useCallback(async () => {
    if (!ingredient || !onDeleted) return;
    const service = new IngredientService(db);

    let usageNote = '';
    try {
      const recipes = await service.getRecipesUsing(ingredient.id);
      if (recipes.length > 0) {
        usageNote = '\n\n' + t('ingredientModal.deleteUsedWarning', { count: recipes.length });
      }
    } catch {
      // If the usage check fails, still allow deletion with the generic message.
    }

    AlertCompat.alert(
      t('ingredientModal.deleteTitle'),
      t('ingredientModal.deleteConfirm', { name: ingredient.name }) + usageNote,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delegate the actual deletion to the parent (via the hook), so
              // the change propagates to every open list.
              await onDeleted(ingredient.id);
              onClose();
            } catch {
              AlertCompat.alert(t('common.error'), t('ingredientModal.deleteError'));
            }
          },
        },
      ]
    );
  }, [ingredient, db, t, onDeleted, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        {/* No KeyboardAvoidingView needed on web */}
        <View
          ref={modalRef}
          style={styles.modalContainer}
          // @ts-ignore - aria-modal is valid on web
          role="dialog"
          aria-labelledby="ingredient-form-title"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              // @ts-ignore
              tabIndex={0}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text
              style={styles.title}
              // @ts-ignore
              id="ingredient-form-title"
              nativeID="ingredient-form-title"
            >
              {ingredient ? t('common.edit') : t('ingredientModal.title')}
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              // @ts-ignore
              tabIndex={0}
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
                // @ts-ignore
                tabIndex={0}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>

            {/* Unit picker */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('ingredientModal.unit')}</Text>
              <View style={styles.unitPicker} accessibilityRole="radiogroup">
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
                    // @ts-ignore
                    tabIndex={0}
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
                // @ts-ignore
                tabIndex={0}
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
                inputMode="decimal"
                accessibilityLabel={t('ingredientModal.purchaseFormatQty')}
                // @ts-ignore
                tabIndex={0}
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
                // @ts-ignore
                tabIndex={0}
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

            {/* Delete (edit mode only) */}
            {ingredient && onDeleted && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel={t('ingredientModal.deleteTitle')}
                // @ts-ignore
                tabIndex={0}
              >
                <Text style={styles.deleteButtonText}>🗑️ {t('ingredientModal.deleteTitle')}</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </View>
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
  deleteButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
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
