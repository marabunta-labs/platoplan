/**
 * PlatoPlan - Stepper
 * Numeric input with −/+ buttons and a free-text field, clamped to [min, max].
 */

import React, { useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  testID?: string;
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 20,
  step = 1,
  label,
  testID,
}: StepperProps) {
  const clamp = useCallback(
    (n: number) => Math.max(min, Math.min(max, n)),
    [min, max]
  );

  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleText = useCallback(
    (text: string) => {
      const digits = text.replace(/[^0-9]/g, '');
      // Keep the field usable while the user clears it before typing a new number.
      if (digits === '') return;
      onChange(clamp(parseInt(digits, 10)));
    },
    [clamp, onChange]
  );

  return (
    <View style={styles.container} testID={testID}>
      <TouchableOpacity
        style={[styles.button, !canDecrement && styles.buttonDisabled]}
        onPress={() => onChange(clamp(value - step))}
        disabled={!canDecrement}
        accessibilityRole="button"
        accessibilityLabel={label ? `Reducir ${label}` : 'Reducir'}
      >
        <Text style={[styles.buttonText, !canDecrement && styles.buttonTextDisabled]}>−</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={handleText}
        onBlur={() => onChange(clamp(value))}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
      />

      <TouchableOpacity
        style={[styles.button, !canIncrement && styles.buttonDisabled]}
        onPress={() => onChange(clamp(value + step))}
        disabled={!canIncrement}
        accessibilityRole="button"
        accessibilityLabel={label ? `Aumentar ${label}` : 'Aumentar'}
      >
        <Text style={[styles.buttonText, !canIncrement && styles.buttonTextDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
  },
  button: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
    color: '#007AFF',
  },
  buttonTextDisabled: {
    color: '#999',
  },
  input: {
    minWidth: 56,
    height: 48,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 8,
  },
});
