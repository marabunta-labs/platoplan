import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ShoppingStackParamList } from '../../navigation/types';
import { useRecipes, useShoppingList } from '../../hooks';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';

type NavigationProp = NativeStackNavigationProp<ShoppingStackParamList, 'CustomListBuilder'>;

export function CustomListBuilderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { recipes, loading: recipesLoading } = useRecipes();
  
  // NUEVO: Traemos la función y el estado de carga de la lista de la compra
  const { generateCustom, loading: generatingList } = useShoppingList();
  
  // Estado para guardar cuántas veces se ha añadido cada receta { recipeId: cantidad }
  const [selectedRecipes, setSelectedRecipes] = useState<Record<string, number>>({});

  // Ordenamos las recetas alfabéticamente
  const sortedRecipes = useMemo(() => {
    return [...recipes].sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [recipes, locale]);

  const totalSelectedCount = Object.values(selectedRecipes).reduce((sum, count) => sum + count, 0);

  const handleIncrement = (recipeId: string) => {
    setSelectedRecipes(prev => ({
      ...prev,
      [recipeId]: (prev[recipeId] || 0) + 1
    }));
  };

  const handleDecrement = (recipeId: string) => {
    setSelectedRecipes(prev => {
      const current = prev[recipeId] || 0;
      if (current <= 1) {
        const newState = { ...prev };
        delete newState[recipeId];
        return newState;
      }
      return {
        ...prev,
        [recipeId]: current - 1
      };
    });
  };

  // Función asíncrona que conecta con la base de datos
  const handleGenerateList = async () => {
    if (totalSelectedCount === 0 || generatingList) return;
    
    // Usamos un ID virtual único para la lista a medida
    const customListId = 'custom_list_current';
    
    // Llamamos a nuestro nuevo hook para generar la lista en la BD
    await generateCustom(customListId, selectedRecipes);
    
    // Navegamos a la pantalla pasándole el ID virtual como si fuera un plan
    navigation.navigate('ShoppingList', { planId: customListId });
  };

  if (recipesLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('shopping.customList')}</Text>
        <Text style={styles.subtitle}>{t('shopping.customListSubtitle')}</Text>
      </View>

      <FlatList
        data={sortedRecipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const count = selectedRecipes[item.id] || 0;
          return (
            <View style={[styles.recipeCard, count > 0 && styles.recipeCardSelected]}>
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName}>{item.name}</Text>
                <Text style={styles.recipeMeta}>
                  {item.prepTime === 'elaborado' ? `👨‍🍳 ${t('prepTimes.elaborado')}` : `⚡ ${t('prepTimes.rapido')}`} · {t(`mealTypes.${item.mealType}` as any)}
                </Text>
              </View>
              
              <View style={styles.quantityControl}>
                {count > 0 ? (
                  <>
                    <TouchableOpacity 
                      style={styles.circleButton} 
                      onPress={() => handleDecrement(item.id)}
                      disabled={generatingList}
                    >
                      <Text style={styles.circleButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.quantityText}>{count}</Text>
                  </>
                ) : null}
                <TouchableOpacity 
                  style={[styles.circleButton, count === 0 && styles.circleButtonAdd]} 
                  onPress={() => handleIncrement(item.id)}
                  disabled={generatingList}
                >
                  <Text style={[styles.circleButtonText, count === 0 && styles.circleButtonTextAdd]}>
                    {count === 0 ? '+' : '+'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t('shopping.noSavedRecipes')}</Text>
          </View>
        }
      />

      {totalSelectedCount > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.generateButton, generatingList && styles.generateButtonDisabled]}
            onPress={handleGenerateList}
            disabled={generatingList}
          >
            {generatingList ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.generateButtonText}>
                {t('shopping.generateList', { count: totalSelectedCount })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100, // Espacio para el botón flotante
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recipeCardSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  recipeInfo: {
    flex: 1,
    paddingRight: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  recipeMeta: {
    fontSize: 13,
    color: colors.textFaint,
    textTransform: 'capitalize',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  circleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleButtonAdd: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  circleButtonText: {
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 20,
  },
  circleButtonTextAdd: {
    color: colors.textInverse,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 15,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  generateButton: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  generateButtonDisabled: {
    backgroundColor: colors.success,
  },
  generateButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
});