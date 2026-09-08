import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuPlan } from '../../models/types';
import type { PlanningStackParamList } from '../../navigation/types';
import { usePlanning } from '../../hooks';
import { EmptyState } from '../../components';
import { AlertCompat } from '../../utils/alert';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';

type NavigationProp = NativeStackNavigationProp<PlanningStackParamList, 'PlanHistory'>;

function formatDate(date: Date | string, locale: string): string {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PlanHistoryScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        <Text style={styles.title}>{t('planning.savedPlans')}</Text>
        <Text style={styles.subtitle}>{t('planning.savedPlansSubtitle')}</Text>
        <TouchableOpacity style={styles.newPlanButton} onPress={() => navigation.navigate('PlanConfig')} accessibilityRole="button">
          <Text style={styles.newPlanText}>{t('planning.newPlan')}</Text>
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : plans.length === 0 ? (
        <EmptyState message={t('planning.noSavedPlans')} />
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(plan) => plan.id}
          contentContainerStyle={styles.list}
          onRefresh={() => void refresh()}
          refreshing={loading}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* CAMBIO: Ahora enviamos a PlanConfig con el ID del plan como parámetro */}
              <TouchableOpacity 
                onPress={() => {
                  // Usamos 'as any' temporalmente por si no has actualizado types.ts para PlanConfig
                  navigation.navigate('PlanConfig' as any, { planId: item.id, isEditing: true });
                }} 
                accessibilityRole="button"
              >
                <View>
                  {/* CAMBIO: Mostramos el nombre del plan si existe */}
                  <Text style={styles.cardTitle}>
                    {item.name ? `${item.name} - ` : ''}{formatDate(item.startDate, locale)} · {t('planning.periodInfo', { days: item.periodDays })}
                  </Text>
                  <Text style={styles.cardDetails}>
                    {t('planning.planMeta', { servings: item.servings, count: item.assignments.length })}
                  </Text>
                </View>
                <Text style={styles.edit}>{t('planning.openAndEdit')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.deleteButton} 
                onPress={() => AlertCompat.alert(t('planning.deletePlanTitle'), t('planning.deletePlanMessage'), [
                  { text: t('common.cancel'), style: 'cancel' }, 
                  { text: t('common.delete'), style: 'destructive', onPress: async () => { await deletePlan(item.id); await refresh(); } }
                ])} 
                accessibilityRole="button"
              >
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  newPlanButton: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: 8, marginTop: 14, paddingHorizontal: 13, paddingVertical: 9 },
  newPlanText: { color: colors.textInverse, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 15 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardDetails: { color: colors.textMuted, marginTop: 4 },
  edit: { color: colors.accent, fontWeight: '600', marginTop: 12 },
  deleteButton: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 4 },
  deleteText: { color: colors.dangerText, fontWeight: '600' },
});