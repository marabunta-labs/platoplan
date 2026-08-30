import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView, 
  FlatList 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ShoppingStackParamList } from '../../navigation/types';
import { usePlanning } from '../../hooks';
import type { MenuPlan } from '../../models/types';
import { useI18n } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<ShoppingStackParamList, 'ShoppingHub'>;

export function ShoppingHubScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const { history, activePlan } = usePlanning();

  // Consolidamos los planes disponibles (historial completo o el activo si no hay historial cargado)
  const availablePlans = history && history.length > 0 
    ? history 
    : (activePlan ? [activePlan] : []);

  const formatDate = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  const getPlanLabel = (plan: MenuPlan) => {
    const name = plan.name ? `${plan.name} ` : '';
    const dateStr = formatDate(plan.startDate);
    const meals = plan.assignments?.length || 0;
    return `${name}(${dateStr}) - ${meals} comidas`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Centro de Compras</Text>
        <Text style={styles.subtitle}>¿Cómo quieres organizar tu compra hoy?</Text>
      </View>

      <View style={styles.content}>
        {/* Opción 1: Lista a medida */}
        <TouchableOpacity 
          style={styles.mainCard} 
          onPress={() => navigation.navigate('CustomListBuilder')}
          accessibilityRole="button"
        >
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>+</Text>
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Crear lista a medida</Text>
            <Text style={styles.cardDescription}>
              Añade recetas sueltas y genera una lista rápida sin necesidad de crear un calendario.
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Opción 2: Planes guardados */}
        <Text style={styles.sectionTitle}>Comprar desde un Menú Planificado</Text>
        
        {availablePlans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tienes menús guardados actualmente.</Text>
          </View>
        ) : (
          <FlatList
            data={availablePlans}
            keyExtractor={(item) => item.id}
            renderItem={({ item: plan }) => (
              <TouchableOpacity 
                style={styles.planCard}
                onPress={() => navigation.navigate('ShoppingList', { planId: plan.id })}
                accessibilityRole="button"
              >
                <View>
                  <Text style={styles.planCardTitle}>
                    {plan.name ? plan.name : 'Plan sin nombre'}
                  </Text>
                  <Text style={styles.planCardSubtitle}>
                    {formatDate(plan.startDate)} · {plan.assignments?.length || 0} comidas
                  </Text>
                </View>
                <Text style={styles.planCardAction}>Ver lista ➔</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mainCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F8FF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4E6F1',
    marginBottom: 24,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardIconText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -4,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  listContent: {
    paddingBottom: 24,
  },
  planCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  planCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  planCardSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  planCardAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});