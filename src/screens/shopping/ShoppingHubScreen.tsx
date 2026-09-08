import React, { useMemo } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';

type NavigationProp = NativeStackNavigationProp<ShoppingStackParamList, 'ShoppingHub'>;

export function ShoppingHubScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { history, activePlan } = usePlanning();

  // Consolidamos los planes disponibles (historial completo o el activo si no hay historial cargado)
  const availablePlans = history && history.length > 0 
    ? history 
    : (activePlan ? [activePlan] : []);

  const formatDate = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('shopping.hubTitle')}</Text>
        <Text style={styles.subtitle}>{t('shopping.hubSubtitle')}</Text>
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
            <Text style={styles.cardTitle}>{t('shopping.createCustomList')}</Text>
            <Text style={styles.cardDescription}>
              {t('shopping.createCustomListDesc')}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Opción 2: Planes guardados */}
        <Text style={styles.sectionTitle}>{t('shopping.fromPlanTitle')}</Text>
        
        {availablePlans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('shopping.noSavedMenus')}</Text>
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
                    {plan.name ? plan.name : t('shopping.unnamedPlan')}
                  </Text>
                  <Text style={styles.planCardSubtitle}>
                    {formatDate(plan.startDate)} · {t('shopping.planMealsShort', { count: plan.assignments?.length || 0 })}
                  </Text>
                </View>
                <Text style={styles.planCardAction}>{t('shopping.viewList')}</Text>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mainCard: {
    flexDirection: 'row',
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardIconText: {
    color: colors.textInverse,
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
    color: colors.accent,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  emptyText: {
    color: colors.textFaint,
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
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  planCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  planCardSubtitle: {
    fontSize: 13,
    color: colors.textFaint,
  },
  planCardAction: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
});