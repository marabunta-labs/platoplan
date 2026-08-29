import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuPlan } from '../../models/types';
import type { PlanningStackParamList } from '../../navigation/types';
import { usePlanning } from '../../hooks';
import { EmptyState } from '../../components';
import { AlertCompat } from '../../utils/alert';

type NavigationProp = NativeStackNavigationProp<PlanningStackParamList, 'PlanHistory'>;

function formatDate(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PlanHistoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { loadPlans, deletePlan } = usePlanning();
  const [plans, setPlans] = useState<MenuPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await loadPlans());
    } finally {
      setLoading(false);
    }
  }, [loadPlans]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Planes guardados</Text>
        <Text style={styles.subtitle}>Abre un plan para revisarlo o editar sus comidas.</Text>
        <TouchableOpacity style={styles.newPlanButton} onPress={() => navigation.navigate('PlanConfig')} accessibilityRole="button"><Text style={styles.newPlanText}>+ Nuevo plan</Text></TouchableOpacity>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View> : plans.length === 0 ? (
        <EmptyState message="Todavía no hay planes guardados." />
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(plan) => plan.id}
          contentContainerStyle={styles.list}
          onRefresh={() => void refresh()}
          refreshing={loading}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => navigation.navigate('PlanCalendar', { planId: item.id })} accessibilityRole="button">
              <View>
                <Text style={styles.cardTitle}>{formatDate(item.startDate)} · {item.periodDays} días</Text>
                <Text style={styles.cardDetails}>{item.servings} personas · {item.assignments.length} comidas asignadas</Text>
              </View>
              <Text style={styles.edit}>Abrir y editar ›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => AlertCompat.alert('Eliminar plan', 'Esta acción eliminará el plan y su lista de compra.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await deletePlan(item.id); await refresh(); } }])} accessibilityRole="button">
                <Text style={styles.deleteText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { color: '#1a1a1a', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#667085', marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  newPlanButton: { alignSelf: 'flex-start', backgroundColor: '#007AFF', borderRadius: 8, marginTop: 14, paddingHorizontal: 13, paddingVertical: 9 },
  newPlanText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 15 },
  cardTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: '700' },
  cardDetails: { color: '#667085', marginTop: 4 },
  edit: { color: '#007AFF', fontWeight: '600', marginTop: 12 },
  deleteButton: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 4 },
  deleteText: { color: '#C0392B', fontWeight: '600' },
});
