/**
 * PlatoPlan - Pantry Screen
 * Displays user's pantry inventory with add/update capabilities
 * and a "preparable recipes" classification section.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PantryRow } from '../../components/PantryRow';
import { EmptyState } from '../../components/EmptyState';
import { SearchBar } from '../../components/SearchBar';
import { IngredientFormModal } from '../../components/IngredientFormModal';
import { ResponsiveLayout } from '../../components/ResponsiveLayout';
import type { PantryEntry, Ingredient, Recipe } from '../../models/types';
import type { PantryStackParamList } from '../../navigation/types';
import { usePantry, useIngredients } from '../../hooks';
import { useI18n } from '../../i18n';
import { categoryPresentation } from '../../constants/ingredient-categories';

// --- Main component ---

export function PantryScreen() {
  const { t } = useI18n();
  const {
    pantryEntries,
    loading,
    error,
    addOrUpdateEntry,
    removeEntry,
    getPreparableRecipes,
  } = usePantry();
  const { ingredients: availableIngredients, refresh: refreshIngredients } = useIngredients();
  const navigation = useNavigation<NativeStackNavigationProp<PantryStackParamList>>();

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isIngredientFormVisible, setIsIngredientFormVisible] = useState(false);
  const [ingredientFormInitialName, setIngredientFormInitialName] = useState<string | undefined>(undefined);
  const [isPreparableExpanded, setIsPreparableExpanded] = useState(false);
  const [sortAscending, setSortAscending] = useState(true);
  const [sortByCategory, setSortByCategory] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | undefined>(undefined);
  const [preparableRecipes, setPreparableRecipes] = useState<{
    full: Recipe[];
    partial: Recipe[];
  }>({ full: [], partial: [] });

  // Load preparable recipes when pantry entries change
  useEffect(() => {
    async function loadPreparable() {
      const result = await getPreparableRecipes();
      setPreparableRecipes(result);
    }
    loadPreparable();
  }, [pantryEntries, getPreparableRecipes]);

  // Every catalogue ingredient gets a row; ones without a pantry entry show quantity 0.
  const catalogueRows = useMemo(() => {
    const entryByIngredient = new Map(pantryEntries.map((e) => [e.ingredientId, e]));

    const rows = availableIngredients.map((ingredient) => {
      const entry = entryByIngredient.get(ingredient.id);
      return {
        key: ingredient.id,
        ingredient,
        quantity: entry?.quantity ?? 0,
        entry:
          entry ??
          ({
            id: `virtual-${ingredient.id}`,
            ingredientId: ingredient.id,
            ingredient,
            quantity: 0,
            updatedAt: new Date(),
          } satisfies PantryEntry),
      };
    });

    const query = listQuery.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) => r.ingredient.name.toLowerCase().includes(query))
      : rows;

    const direction = sortAscending ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aStocked = a.quantity > 0;
      const bStocked = b.quantity > 0;
      // Stocked ingredients always come first; out-of-stock sink to the bottom.
      if (aStocked !== bStocked) return aStocked ? -1 : 1;
      if (sortByCategory) {
        const categoryCompare = (a.ingredient.categories?.join(', ') ?? a.ingredient.category).localeCompare(b.ingredient.categories?.join(', ') ?? b.ingredient.category, 'es') * direction;
        if (categoryCompare !== 0) return categoryCompare;
      }
      return a.ingredient.name.localeCompare(b.ingredient.name, 'es') * direction;
    });
  }, [availableIngredients, pantryEntries, listQuery, sortAscending, sortByCategory]);

  const categorySuggestions = useMemo(() => [...new Set(availableIngredients.flatMap((ingredient) => ingredient.categories?.length ? ingredient.categories : ingredient.category ? [ingredient.category] : []))].sort((a, b) => a.localeCompare(b, 'es')), [availableIngredients]);

  const stockedCount = useMemo(
    () => catalogueRows.filter((r) => r.quantity > 0).length,
    [catalogueRows]
  );

  const pantrySections = useMemo(() => {
    const groups = new Map<string, typeof catalogueRows>();
    for (const row of catalogueRows) {
      const category = (row.ingredient.categories?.[0] ?? row.ingredient.category) || 'Otros';
      groups.set(category, [...(groups.get(category) ?? []), row]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [catalogueRows]);

  // Handle quantity change from PantryRow (Req 3.4)
  const handleQuantityChange = useCallback(
    async (ingredientId: string, newQty: number) => {
      if (newQty <= 0) {
        // Remove entry when quantity reaches 0 (Req 3.5)
        await removeEntry(ingredientId);
      } else {
        await addOrUpdateEntry(ingredientId, newQty);
      }
    },
    [removeEntry, addOrUpdateEntry]
  );

  // Handle adding a new ingredient (upsert behavior — Req 3.3)
  const handleAddIngredient = useCallback(
    async (ingredientId: string, quantity: number) => {
      await addOrUpdateEntry(ingredientId, quantity);
      setIsAddModalVisible(false);
    },
    [addOrUpdateEntry]
  );

  // Handle new ingredient creation from IngredientFormModal (Req 2.1, 2.2, 2.3)
  const handleIngredientCreated = useCallback(
    async (newIngredient: Ingredient) => {
      await refreshIngredients();
      setIsIngredientFormVisible(false);
      if (!editingIngredient) {
        // Offer to add a newly-created ingredient to the pantry immediately.
        setIsAddModalVisible(true);
      }
      setEditingIngredient(undefined);
    },
    [refreshIngredients, editingIngredient]
  );

  // Open IngredientFormModal from AddIngredientModal "Crear ingrediente" action
  const handleCreateFromSearch = useCallback(
    (searchQuery: string) => {
      setIsAddModalVisible(false);
      setEditingIngredient(undefined);
      setIngredientFormInitialName(searchQuery);
      setIsIngredientFormVisible(true);
    },
    []
  );

  const renderPantryItem = useCallback(
    ({ item }: { item: (typeof catalogueRows)[number] }) => (
      <PantryRow
        entry={item.entry}
        dimmed={item.quantity === 0}
        onQuantityChange={(qty) => handleQuantityChange(item.ingredient.id, qty)}
        onEdit={() => { setEditingIngredient(item.ingredient); setIsIngredientFormVisible(true); }}
      />
    ),
    [handleQuantityChange]
  );

  const keyExtractor = useCallback((item: (typeof catalogueRows)[number]) => item.key, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('pantry.title')}</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.suggestButton}
              onPress={() => navigation.navigate('SuggestedRecipes')}
              accessibilityRole="button"
              accessibilityLabel={t('pantry.suggestedTitle')}
            >
              <Text style={styles.suggestButtonText}>{t('pantry.whatCanICook')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortByCategory((value) => !value)} accessibilityRole="button" accessibilityLabel="Ordenar por categoría">
              <Text style={styles.sortButtonText}>{sortByCategory ? 'Categoría' : 'Nombre'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newIngredientButton}
              onPress={() => {
                setIngredientFormInitialName(undefined);
                setEditingIngredient(undefined);
                setIsIngredientFormVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('pantry.newIngredient')}
            >
              <Text style={styles.newIngredientButtonText}>{t('pantry.newIngredient')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter + sort toolbar */}
        {availableIngredients.length > 0 && (
          <View style={styles.toolbar}>
            <View style={styles.toolbarSearch}>
              <SearchBar
                placeholder={t('recipes.searchIngredient')}
                onSearch={setListQuery}
              />
            </View>
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setSortAscending((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={sortAscending ? t('pantry.sortDescending') : t('pantry.sortAscending')}
            >
              <Text style={styles.sortButtonText}>
                {sortAscending ? 'A→Z' : 'Z→A'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pantry list or empty state (Req 3.6, 3.7) */}
        {catalogueRows.length === 0 ? (
          <EmptyState
            message={t('pantry.empty')}
            actionLabel={t('pantry.addIngredientAction')}
            onAction={() => setIsAddModalVisible(true)}
          />
        ) : (
          sortByCategory ? (
            <SectionList
              sections={pantrySections}
              renderItem={renderPantryItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={<Text style={styles.listSummary}>{t('pantry.stockedSummary', { stocked: stockedCount, total: catalogueRows.length })}</Text>}
              ListFooterComponent={<PreparableRecipesSection isExpanded={isPreparableExpanded} onToggle={() => setIsPreparableExpanded((v) => !v)} full={preparableRecipes.full} partial={preparableRecipes.partial} />}
              renderSectionHeader={({ section }) => {
                const presentation = categoryPresentation(section.title);
                return <View style={[styles.pantryCategoryHeader, { backgroundColor: presentation.backgroundColor }]}><Text style={[styles.pantryCategoryTitle, { color: presentation.color }]}>{presentation.emoji} {section.title}</Text><Text style={[styles.pantryCategoryCount, { color: presentation.color }]}>{section.data.length}</Text></View>;
              }}
              stickySectionHeadersEnabled
            />
          ) : (
            <FlatList
              data={catalogueRows}
              renderItem={renderPantryItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={<Text style={styles.listSummary}>{t('pantry.stockedSummary', { stocked: stockedCount, total: catalogueRows.length })}</Text>}
              ListFooterComponent={<PreparableRecipesSection isExpanded={isPreparableExpanded} onToggle={() => setIsPreparableExpanded((v) => !v)} full={preparableRecipes.full} partial={preparableRecipes.partial} />}
            />
          )
        )}

        {/* Add ingredient modal */}
        <AddIngredientModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onAdd={handleAddIngredient}
          availableIngredients={availableIngredients}
          existingEntries={pantryEntries}
          onCreateIngredient={handleCreateFromSearch}
        />

        {/* Create new ingredient modal */}
        <IngredientFormModal
          visible={isIngredientFormVisible}
          onClose={() => setIsIngredientFormVisible(false)}
          onCreated={handleIngredientCreated}
          initialName={ingredientFormInitialName}
          ingredient={editingIngredient}
          categorySuggestions={categorySuggestions}
        />
      </View>
    </SafeAreaView>
  );
}

// --- Preparable Recipes Section (Req 3.8) ---

interface PreparableRecipesSectionProps {
  isExpanded: boolean;
  onToggle: () => void;
  full: Recipe[];
  partial: Recipe[];
}

function PreparableRecipesSection({
  isExpanded,
  onToggle,
  full,
  partial,
}: PreparableRecipesSectionProps) {
  const { t } = useI18n();
  const totalCount = full.length + partial.length;

  return (
    <View style={styles.preparableSection}>
      <TouchableOpacity
        style={styles.preparableHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${t('pantry.preparableSectionTitle', { count: totalCount })}. ${isExpanded ? 'Contraer' : 'Expandir'}`}
      >
        <Text style={styles.preparableTitle}>
          {t('pantry.preparableSectionTitle', { count: totalCount })}
        </Text>
        <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.preparableContent}>
          {totalCount === 0 ? (
            <Text style={styles.noRecipesText}>
              {t('pantry.noPreparableRecipes')}
            </Text>
          ) : (
            <>
              {full.length > 0 && (
                <View style={styles.recipeCategory}>
                  <Text style={styles.categoryLabel}>
                    {t('pantry.preparableFullTitle', { count: full.length })}
                  </Text>
                  {full.map((recipe) => (
                    <Text key={recipe.id} style={styles.recipeName}>
                      • {recipe.name}
                    </Text>
                  ))}
                </View>
              )}
              {partial.length > 0 && (
                <View style={styles.recipeCategory}>
                  <Text style={styles.categoryLabel}>
                    {t('pantry.preparablePartialTitle', { count: partial.length })}
                  </Text>
                  {partial.map((recipe) => (
                    <Text key={recipe.id} style={styles.recipeName}>
                      • {recipe.name}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// --- Add Ingredient Modal ---

interface AddIngredientModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (ingredientId: string, quantity: number) => void;
  availableIngredients: Ingredient[];
  existingEntries: PantryEntry[];
  onCreateIngredient?: (searchQuery: string) => void;
}

function AddIngredientModal({
  visible,
  onClose,
  onAdd,
  availableIngredients,
  existingEntries,
  onCreateIngredient,
}: AddIngredientModalProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [quantityText, setQuantityText] = useState('');

  const filteredIngredients = useMemo(() => {
    if (!searchQuery.trim()) return availableIngredients;
    const query = searchQuery.toLowerCase();
    return availableIngredients.filter((i) =>
      i.name.toLowerCase().includes(query)
    );
  }, [searchQuery, availableIngredients]);

  const handleClose = () => {
    setSearchQuery('');
    setSelectedIngredient(null);
    setQuantityText('');
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedIngredient) return;
    const qty = parseFloat(quantityText);
    if (isNaN(qty) || qty <= 0) return;
    onAdd(selectedIngredient.id, qty);
    handleClose();
  };

  const existingQty = useMemo(() => {
    if (!selectedIngredient) return null;
    const entry = existingEntries.find(
      (e) => e.ingredientId === selectedIngredient.id
    );
    return entry ? entry.quantity : null;
  }, [selectedIngredient, existingEntries]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('pantry.addToPantry')}</Text>
            <TouchableOpacity
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              disabled={!selectedIngredient || !quantityText || parseFloat(quantityText) <= 0}
            >
              <Text
                style={[
                  styles.confirmText,
                  (!selectedIngredient || !quantityText || parseFloat(quantityText) <= 0) &&
                    styles.confirmTextDisabled,
                ]}
              >
                {t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search for ingredient */}
          {!selectedIngredient ? (
            <View style={styles.modalBody}>
              <SearchBar
                placeholder={t('recipes.searchIngredient')}
                onSearch={setSearchQuery}
              />
              <FlatList
                data={filteredIngredients}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.ingredientOption}
                    onPress={() => setSelectedIngredient(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common.add')} ${item.name}`}
                  >
                    <Text style={styles.ingredientOptionName}>{item.name}</Text>
                    <Text style={styles.ingredientOptionUnit}>{t(`units.${item.unit}` as any) || item.unit}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.noResultsContainer}>
                    <Text style={styles.noResultsText}>
                      {t('pantry.noIngredientsFound')}
                    </Text>
                    {onCreateIngredient && searchQuery.trim().length > 0 && (
                      <TouchableOpacity
                        style={styles.createIngredientAction}
                        onPress={() => onCreateIngredient(searchQuery.trim())}
                        accessibilityRole="button"
                        accessibilityLabel={t('pantry.createIngredientNamed', { name: searchQuery.trim() })}
                      >
                        <Text style={styles.createIngredientActionText}>
                          {t('pantry.createIngredientNamed', { name: searchQuery.trim() })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            </View>
          ) : (
            <View style={styles.modalBody}>
              {/* Selected ingredient + quantity input */}
              <View style={styles.selectedSection}>
                <Text style={styles.selectedLabel}>{t('pantry.selectedIngredientLabel')}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedIngredient(null)}
                  style={styles.selectedIngredient}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.change')}
                >
                  <Text style={styles.selectedName}>
                    {selectedIngredient.name}
                  </Text>
                  <Text style={styles.changeText}>{t('common.change')}</Text>
                </TouchableOpacity>

                {existingQty !== null && (
                  <Text style={styles.existingQtyText}>
                    {t('pantry.currentQuantityInPantry', { qty: existingQty, unit: t(`units.${selectedIngredient.unit}` as any) || selectedIngredient.unit })}
                  </Text>
                )}

                <Text style={styles.quantityLabel}>
                  {t('pantry.quantityUnitLabel', { unit: t(`units.${selectedIngredient.unit}` as any) || selectedIngredient.unit })}
                </Text>
                <TextInput
                  style={styles.quantityInput}
                  value={quantityText}
                  onChangeText={setQuantityText}
                  keyboardType="decimal-pad"
                  placeholder={t('pantry.quantityPlaceholder')}
                  placeholderTextColor="#999"
                  accessibilityLabel={t('pantry.quantityUnitLabel', { unit: t(`units.${selectedIngredient.unit}` as any) || selectedIngredient.unit })}
                  autoFocus
                />
              </View>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  suggestButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FF9500',
    borderRadius: 8,
  },
  suggestButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  newIngredientButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#34C759',
    borderRadius: 8,
  },
  newIngredientButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    paddingBottom: 24,
  },
  pantryCategoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, marginTop: 10 },
  pantryCategoryTitle: { fontSize: 14, fontWeight: '700' },
  pantryCategoryCount: { fontSize: 12, fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  toolbarSearch: {
    flex: 1,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#f5f5f5',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  listSummary: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Preparable recipes section
  preparableSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  preparableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f9f9f9',
  },
  preparableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  expandIcon: {
    fontSize: 12,
    color: '#666',
  },
  preparableContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  noRecipesText: {
    fontSize: 14,
    color: '#888',
    paddingVertical: 8,
  },
  recipeCategory: {
    marginTop: 12,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  recipeName: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 2,
    paddingLeft: 8,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  cancelText: {
    fontSize: 15,
    color: '#007AFF',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  confirmTextDisabled: {
    color: '#ccc',
  },
  modalBody: {
    flex: 1,
  },
  ingredientOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  ingredientOptionName: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  ingredientOptionUnit: {
    fontSize: 13,
    color: '#888',
  },
  noResultsText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    padding: 24,
  },
  noResultsContainer: {
    alignItems: 'center',
    padding: 24,
  },
  createIngredientAction: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#34C759',
    borderRadius: 8,
  },
  createIngredientActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  selectedSection: {
    padding: 16,
  },
  selectedLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  selectedIngredient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  changeText: {
    fontSize: 14,
    color: '#007AFF',
  },
  existingQtyText: {
    fontSize: 13,
    color: '#E67E22',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  quantityLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  quantityInput: {
    height: 48,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
});
