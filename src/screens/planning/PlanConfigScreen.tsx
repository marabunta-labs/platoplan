/**
 * PlatoPlan - PlanConfigScreen
 * Allows user to configure a new menu plan or edit an existing one:
 * - Plan Name (Optional)
 * - Date range (start + end)
 * - Elaborate days & Free days
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { AlertCompat } from '../../utils/alert';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { PlanningStackParamList } from '../../navigation/types';
import type { FreeDayType } from '../../models/enums';
import { usePlanning } from '../../hooks';
import { CalendarPicker, Stepper } from '../../components';
import { useI18n } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<PlanningStackParamList, 'PlanConfig'>;
type ScreenRouteProp = RouteProp<PlanningStackParamList, 'PlanConfig'>;

const SHORT_DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface FreeDayConfig {
  dayIndex: number;
  type: FreeDayType;
}

// --- Date utilities ---
function parseDateString(text: string): Date | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const year = parseInt(match[3], 10);
  const date = new Date(year, month, day);
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) return null;
  return date;
}

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatShortDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

function getDayLabel(startDate: Date, dayIndex: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + dayIndex);
  const dayName = SHORT_DAY_NAMES[date.getDay()];
  return `${dayName} ${formatShortDate(date)}`;
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86400000;
  const startNorm = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endNorm.getTime() - startNorm.getTime()) / msPerDay) + 1;
}

// --- Main component ---
export function PlanConfigScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  
  // AÑADIDO: Sacamos 'history' para cargar el plan de forma instantánea
  const { createPlan, updatePlan, loadPlan, activePlan, history } = usePlanning();

  const planId = route.params?.planId;
  const isEditing = route.params?.isEditing;

  const freeDayOptions: { value: FreeDayType; label: string }[] = [
    { value: 'comida', label: t('mealTypes.comida') },
    { value: 'cena', label: t('mealTypes.cena') },
    { value: 'ambas', label: t('mealTypes.ambas') },
  ];

  const today = new Date();
  const defaultEnd = new Date(today);
  defaultEnd.setDate(today.getDate() + 6);

  // States
  const [name, setName] = useState('');
  const [startDateText, setStartDateText] = useState(formatDate(today));
  const [endDateText, setEndDateText] = useState(formatDate(defaultEnd));
  const [servings, setServings] = useState(2);
  const [elaborateDays, setElaborateDays] = useState<number[]>([]);
  const [freeDays, setFreeDays] = useState<FreeDayConfig[]>([]);
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const [endDateError, setEndDateError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [isInitializing, setIsInitializing] = useState(isEditing);

  // Buscamos el plan en la memoria (historial) para que sea instantáneo
  const currentPlan = useMemo(() => {
    if (!isEditing || !planId) return null;
    return (history || []).find(p => p.id === planId) || (activePlan?.id === planId ? activePlan : null);
  }, [history, activePlan, planId, isEditing]);

  // Cargar datos previos
  useEffect(() => {
    if (isEditing) {
      if (currentPlan) {
        setName(currentPlan.name || '');
        setStartDateText(formatDate(new Date(currentPlan.startDate)));
        
        const end = new Date(currentPlan.startDate);
        end.setDate(end.getDate() + currentPlan.periodDays - 1);
        setEndDateText(formatDate(end));
        
        setServings(currentPlan.servings || 2);
        setElaborateDays(currentPlan.elaborateDays || []);
        
        // Mapeamos los días libres
        if (currentPlan.freeDays) {
          setFreeDays(currentPlan.freeDays.map(fd => ({ dayIndex: fd.dayIndex, type: fd.type })));
        } else {
          setFreeDays([]);
        }
        
        setIsInitializing(false);
      } else {
        // Fallback por si la memoria falla, forzamos la carga
        loadPlan(planId!);
      }
    } else {
      setIsInitializing(false);
    }
  }, [isEditing, currentPlan, planId, loadPlan]);

  const startDate = useMemo(() => parseDateString(startDateText), [startDateText]);
  const endDate = useMemo(() => parseDateString(endDateText), [endDateText]);

  const periodDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return daysBetween(startDate, endDate);
  }, [startDate, endDate]);

  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) return null;
    if (periodDays < 1) return t('planning.invalidRangeError');
    if (periodDays > 30) return t('planning.maxPeriodError');
    return null;
  }, [startDate, endDate, periodDays, t]);

  const toggleElaborateDay = useCallback((dayIndex: number) => {
    setElaborateDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  }, []);

  const toggleFreeDay = useCallback((dayIndex: number, type: FreeDayType) => {
    setFreeDays((prev) => {
      const existing = prev.find((fd) => fd.dayIndex === dayIndex);
      const hasLunch = existing?.type === 'comida' || existing?.type === 'ambas';
      const hasDinner = existing?.type === 'cena' || existing?.type === 'ambas';
      const nextLunch = type === 'ambas' ? !hasLunch : type === 'comida' ? !hasLunch : hasLunch;
      const nextDinner = type === 'ambas' ? !hasDinner : type === 'cena' ? !hasDinner : hasDinner;
      const nextType: FreeDayType | null = nextLunch && nextDinner ? 'ambas' : nextLunch ? 'comida' : nextDinner ? 'cena' : null;
      if (!nextType) return prev.filter((fd) => fd.dayIndex !== dayIndex);
      return existing
        ? prev.map((fd) => fd.dayIndex === dayIndex ? { ...fd, type: nextType } : fd)
        : [...prev, { dayIndex, type: nextType }];
    });
  }, []);

  const getFreeDayType = (dayIndex: number): FreeDayType | null => {
    const fd = freeDays.find((f) => f.dayIndex === dayIndex);
    return fd?.type ?? null;
  };

  const isFormValid = !startDateError && !endDateError && !dateRangeError && startDate !== null && endDate !== null && periodDays >= 1 && periodDays <= 30;

  const handleNext = useCallback(async () => {
    if (!startDate || !endDate || !isFormValid) return;

    const validFreeDays = freeDays.filter((fd) => fd.dayIndex < periodDays);
    const lunchFreeDays = validFreeDays.filter((fd) => fd.type === 'comida' || fd.type === 'ambas').length;
    const dinnerFreeDays = validFreeDays.filter((fd) => fd.type === 'cena' || fd.type === 'ambas').length;

    const requiredLunches = periodDays - lunchFreeDays;
    const requiredDinners = periodDays - dinnerFreeDays;

    if (requiredLunches <= 0 && requiredDinners <= 0) {
      AlertCompat.alert(t('common.error'), 'Todos los días están marcados como libres. Reduce los días libres para planificar.');
      return;
    }

    if (isEditing && planId) {
      // Editar plan existente
      const result = await updatePlan(planId, {
        name,
        periodDays,
        startDate,
        servings,
        elaborateDays,
        freeDays: validFreeDays,
      } as any);
      
      if (result.success) {
        navigation.navigate('RecipeSelection', { planId });
      } else {
        AlertCompat.alert(t('common.error'), t('common.retry'));
      }
    } else {
      // Crear plan nuevo
      const result = await createPlan({
        name,
        periodDays,
        startDate,
        servings,
        elaborateDays,
        freeDays: validFreeDays,
        selectedLunchRecipes: [],
        selectedDinnerRecipes: [],
      } as any); 

      if (result.success) {
        // --- CAMBIO CLAVE AQUI ---
        // Actualizamos los parámetros de ESTA pantalla para que, si el usuario vuelve atrás,
        // sepa que ahora está editando el plan que acabamos de crear y no haga uno nuevo.
        navigation.setParams({ planId: result.data.id, isEditing: true });
        // -------------------------

        navigation.navigate('RecipeSelection', { planId: result.data.id });
      } else {
        AlertCompat.alert(t('common.error'), t('common.retry'));
      }
    }
  }, [startDate, endDate, periodDays, servings, freeDays, elaborateDays, name, isEditing, planId, navigation, createPlan, updatePlan, isFormValid, t]);

  const STEPS = [
    t('planning.stepDates'),
    t('planning.stepServings'),
    t('planning.stepFreeDays'),
    t('planning.stepElaborateDays'),
    t('planning.stepSummary'),
  ];

  const dayIndices = useMemo(() => startDate && periodDays >= 1 && periodDays <= 30 ? Array.from({ length: periodDays }, (_, i) => i) : [], [startDate, periodDays]);
  
  const requiredLunches = periodDays - freeDays.filter((fd) => fd.dayIndex < periodDays && (fd.type === 'comida' || fd.type === 'ambas')).length;
  const requiredDinners = periodDays - freeDays.filter((fd) => fd.dayIndex < periodDays && (fd.type === 'cena' || fd.type === 'ambas')).length;

  const isLastStep = step === STEPS.length - 1;
  const canAdvance = step === 0 ? isFormValid : true;

  const handleBack = () => {
    if (step === 0) {
      navigation.goBack();
      return;
    }
    setStep((s) => s - 1);
  };

  if (isInitializing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 16, color: '#666' }}>Cargando datos del menú...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} accessibilityRole="button">
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Editar Menú' : t('planning.configTitle')}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => navigation.navigate('PlanHistory' as any)} accessibilityRole="button">
          <Text style={{ fontSize: 15, color: '#C0392B', fontWeight: '600' }}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stepper}>
        {STEPS.map((label, index) => (
          <View key={label} style={styles.stepperItem}>
            <View style={[styles.stepperDot, index === step && styles.stepperDotActive, index < step && styles.stepperDotDone]}>
              <Text style={[styles.stepperDotText, (index === step || index < step) && styles.stepperDotTextActive]}>{index + 1}</Text>
            </View>
            {index < STEPS.length - 1 && <View style={styles.stepperLine} />}
          </View>
        ))}
      </View>
      <Text style={styles.stepTitle}>{t('planning.stepCounter', { current: step + 1, total: STEPS.length })} · {STEPS[step]}</Text>

      {/* Step 1: name and date range */}
      {step === 0 && (
        <View style={styles.section}>
          
          <Text style={styles.sectionTitle}>Nombre del Menú (Opcional)</Text>
          <Text style={styles.hint}>Dale un nombre para encontrarlo fácilmente después.</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Menú de Verano, Semana Santa..."
            placeholderTextColor="#999"
          />

          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionTitle}>Fechas del Menú</Text>
            <CalendarPicker
              startDate={startDate}
              endDate={endDate}
              onStartDateSelect={(date) => { setStartDateText(formatDate(date)); setStartDateError(null); }}
              onEndDateSelect={(date) => { setEndDateText(formatDate(date)); setEndDateError(null); }}
              maxRangeDays={30}
            />
            {dateRangeError && <Text style={styles.errorText}>{dateRangeError}</Text>}
            {isFormValid && <Text style={styles.periodInfo}>📅 {t('planning.periodInfo', { days: periodDays })}</Text>}
          </View>
        </View>
      )}

      {/* Step 2: diners */}
      {step === 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('planning.servings')}</Text>
          <Text style={styles.hint}>{t('planning.servingsHint')}</Text>
          <Stepper value={servings} onChange={setServings} min={1} max={20} label={t('planning.servings')} />
        </View>
      )}

      {/* Step 3: days that need no cooking */}
      {step === 2 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('planning.freeDays')}</Text>
          <Text style={styles.hint}>{t('planning.freeDaysHint')}</Text>
          <View style={styles.freeDaysContainer}>
            {dayIndices.map((dayIndex) => {
              const currentType = getFreeDayType(dayIndex);
              const lunchFree = currentType === 'comida' || currentType === 'ambas';
              const dinnerFree = currentType === 'cena' || currentType === 'ambas';
              return (
                <View key={dayIndex} style={[styles.freeDayRow, currentType && styles.freeDayRowActive]}>
                  <Text style={[styles.freeDayLabel, currentType && styles.freeDayLabelActive]}>{getDayLabel(startDate!, dayIndex)}</Text>
                  <View style={styles.freeDayOptions}>
                    {freeDayOptions.slice(0, 2).map((option) => {
                      const selected = option.value === 'comida' ? lunchFree : dinnerFree;
                      return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.freeDayChip, selected && styles.freeDayChipSelected]}
                        onPress={() => toggleFreeDay(dayIndex, option.value)}
                        accessibilityRole="radio"
                      >
                        <Text style={[styles.freeDayChipText, selected && styles.freeDayChipTextSelected, selected && styles.freeDayChipTextStruck]}>
                          {selected ? `✓ ${option.label}` : option.label}
                        </Text>
                      </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Step 4: elaborate days */}
      {step === 3 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('planning.elaborateDays')}</Text>
          <Text style={styles.hint}>{t('planning.elaborateDaysHint')}</Text>
          <View style={styles.daysGrid}>
            {dayIndices.map((dayIndex) => (
              <TouchableOpacity
                key={dayIndex}
                style={[styles.dayChip, elaborateDays.includes(dayIndex) && styles.dayChipSelected]}
                onPress={() => toggleElaborateDay(dayIndex)}
              >
                <Text style={[styles.dayChipText, elaborateDays.includes(dayIndex) && styles.dayChipTextSelected]}>
                  {getDayLabel(startDate!, dayIndex)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Step 5: summary */}
      {step === 4 && startDate && endDate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('planning.summary')}</Text>
          {name ? <Text style={[styles.summaryText, {fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8}]}>🏷️ {name}</Text> : null}
          <Text style={styles.summaryText}>📅 {formatDate(startDate)} — {formatDate(endDate)} ({t('planning.periodInfo', { days: periodDays })})</Text>
          <Text style={styles.summaryText}>👥 {t('planning.servingsSummary', { count: servings })}</Text>
          <Text style={styles.summaryText}>🍽️ {t('planning.requiredLunches', { count: requiredLunches })}</Text>
          <Text style={styles.summaryText}>🌙 {t('planning.requiredDinners', { count: requiredDinners })}</Text>
        </View>
      )}

      {/* Navigation */}
      {/* Navigation */}
      <View style={styles.wizardNav}>
        {step > 0 && (
          <TouchableOpacity style={styles.prevButton} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.prevButtonText}>{t('planning.previousStep')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, !canAdvance && styles.nextButtonDisabled]}
          onPress={() => (isLastStep ? handleNext() : setStep((s) => s + 1))}
          disabled={!canAdvance}
        >
          <Text style={[styles.nextButtonText, !canAdvance && styles.nextButtonTextDisabled]}>
            Siguiente
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { fontSize: 15, color: '#007AFF', fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginLeft: 12 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  nameInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1a1a1a', marginTop: 8 },
  periodInfo: { fontSize: 14, color: '#007AFF', fontWeight: '500', marginTop: 8 },
  hint: { fontSize: 13, color: '#888', marginTop: 4 },
  errorText: { fontSize: 13, color: '#c00', marginTop: 4 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  dayChipSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  dayChipText: { fontSize: 12, fontWeight: '500', color: '#555' },
  dayChipTextSelected: { color: '#fff' },
  freeDaysContainer: { marginTop: 8 },
  freeDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  freeDayRowActive: { backgroundColor: '#FDECEA', borderBottomColor: '#F5B7B1' },
  freeDayLabel: { fontSize: 13, fontWeight: '500', color: '#333', width: 120 },
  freeDayLabelActive: { color: '#C0392B', fontWeight: '700' },
  freeDayOptions: { flexDirection: 'row', gap: 6 },
  freeDayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' },
  freeDayChipSelected: { backgroundColor: '#E74C3C', borderColor: '#E74C3C' },
  freeDayChipText: { fontSize: 12, color: '#666' },
  freeDayChipTextSelected: { color: '#fff', fontWeight: '500' },
  freeDayChipTextStruck: { textDecorationLine: 'line-through' },
  summaryText: { fontSize: 14, color: '#555', marginBottom: 4 },
  nextButton: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8, flex: 1 },
  nextButtonDisabled: { backgroundColor: '#ccc' },
  nextButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  nextButtonTextDisabled: { color: '#888' },
  wizardNav: { flexDirection: 'row', gap: 12, marginTop: 8 },
  prevButton: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', marginTop: 8, backgroundColor: '#f0f0f0' },
  prevButtonText: { fontSize: 16, fontWeight: '600', color: '#333' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepperItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  stepperDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  stepperDotActive: { backgroundColor: '#007AFF' },
  stepperDotDone: { backgroundColor: '#34C759' },
  stepperDotText: { fontSize: 12, fontWeight: '700', color: '#888' },
  stepperDotTextActive: { color: '#fff' },
  stepperLine: { width: 24, height: 2, backgroundColor: '#eee', marginHorizontal: 4 },
  stepTitle: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 16, textTransform: 'uppercase' },
});