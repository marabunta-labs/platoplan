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

type NavigationProp = NativeStackNavigationProp<ShoppingStackParamList, 'CustomListBuilder'>;

export function CustomListBuilderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t, locale } = useI18n();
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
          <ActivityIndicator size="large" color="#007AFF" />
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
          <Text style={styles.backButtonText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Lista a medida</Text>
        <Text style={styles.subtitle}>Añade las recetas que quieras comprar</Text>
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
                  {item.prepTime === 'elaborado' ? '👨‍🍳 Elaborado' : '⚡ Rápido'} · {item.mealType}
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
            <Text style={styles.emptyText}>No tienes recetas guardadas.</Text>
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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>
                Generar Lista ({totalSelectedCount} recetas)
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    borderBottomColor: '#eee',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
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
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  recipeCardSelected: {
    backgroundColor: '#F0F8FF',
    borderColor: '#B3D4FF',
  },
  recipeInfo: {
    flex: 1,
    paddingRight: 12,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  recipeMeta: {
    fontSize: 13,
    color: '#888',
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleButtonAdd: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  circleButtonText: {
    fontSize: 18,
    color: '#555',
    lineHeight: 20,
  },
  circleButtonTextAdd: {
    color: '#fff',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    minWidth: 20,
    textAlign: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  generateButton: {
    backgroundColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  generateButtonDisabled: {
    backgroundColor: '#98DFAC',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});