/**
 * PlatoPlan - TermsModal
 *
 * Scrollable modal showing the Terms & Conditions and a short privacy note.
 * Content comes from i18n (terms.*). Reused from the auth screens.
 *
 * NOTE: The T&C text is a sensible generic template for a meal-planning app.
 * Review it with your own legal wording before publishing.
 */

import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';

export interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TermsModal({ visible, onClose }: TermsModalProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const sections: { heading: string; body: string }[] = [
    { heading: t('terms.section1Title'), body: t('terms.section1Body') },
    { heading: t('terms.section2Title'), body: t('terms.section2Body') },
    { heading: t('terms.section3Title'), body: t('terms.section3Body') },
    { heading: t('terms.section4Title'), body: t('terms.section4Body') },
    { heading: t('terms.section5Title'), body: t('terms.section5Body') },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('terms.title')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.updated}>{t('terms.lastUpdated')}</Text>
            {sections.map((section, index) => (
              <View key={index} style={styles.section}>
                <Text style={styles.sectionHeading}>{section.heading}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.acceptButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.acceptButtonText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  container: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%', paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  close: { fontSize: 20, color: colors.textFaint, paddingLeft: 12 },
  body: { paddingHorizontal: 16 },
  bodyContent: { paddingVertical: 16 },
  updated: { fontSize: 12, color: colors.textFaint, fontStyle: 'italic', marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionHeading: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 6 },
  sectionBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  acceptButton: { marginHorizontal: 16, marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  acceptButtonText: { color: colors.textInverse, fontSize: 16, fontWeight: '600' },
});
