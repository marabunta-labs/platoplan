/**
 * PlatoPlan - Login Screen
 *
 * Email/password login with Google OAuth option.
 * Displays inline error messages from auth failures.
 * Links to RegisterScreen for new users.
 * Includes guest access option.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.7
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../context/AuthContext';
import { useGuestAccess } from '../../context/AuthContext';
import { authService } from '../../services/auth.service';
import { useI18n } from '../../i18n';

type LoginNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const navigation = useNavigation<LoginNavigationProp>();
  const { t } = useI18n();
  const { continueAsGuest } = useGuestAccess();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('auth.fillAllFields'));
      return;
    }

    setError(null);
    setIsLoading(true);

    const result = await authService.signIn(email.trim(), password);

    setIsLoading(false);

    if (!result.success && result.error) {
      setError(result.error);
    }
    // On success, the AuthProvider's onAuthStateChange will pick up the session
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);

    const result = await authService.signInWithGoogle();

    setIsLoading(false);

    if (!result.success && result.error) {
      setError(result.error);
    }
    // On success, OAuth redirect will trigger onAuthStateChange
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>PlatoPlan</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          {/* Error message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              accessibilityLabel={t('auth.email')}
            />
          </View>

          {/* Password input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.password')}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor="#999"
              secureTextEntry
              editable={!isLoading}
              accessibilityLabel={t('auth.password')}
            />
          </View>

          {/* Sign in button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={t('auth.login')}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('auth.login')}</Text>
            )}
          </TouchableOpacity>

          {/* Separator */}
          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>{t('auth.or')}</Text>
            <View style={styles.separatorLine} />
          </View>

          {/* Google sign in button */}
          <TouchableOpacity
            style={[styles.googleButton, isLoading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={t('auth.googleSignIn')}
          >
            <Text style={styles.googleButtonText}>{t('auth.googleSignIn')}</Text>
          </TouchableOpacity>

          {/* Register link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              disabled={isLoading}
              accessibilityRole="link"
              accessibilityLabel={t('auth.register')}
            >
              <Text style={styles.linkText}>{t('auth.register')}</Text>
            </TouchableOpacity>
          </View>

          {/* Guest access */}
          <TouchableOpacity
            style={styles.guestButton}
            onPress={continueAsGuest}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={t('auth.guestAccess')}
          >
            <Text style={styles.guestButtonText}>{t('auth.guestAccess')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  primaryButton: {
    height: 48,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  separatorText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#888',
  },
  googleButton: {
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  guestButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  guestButtonText: {
    fontSize: 14,
    color: '#888',
    textDecorationLine: 'underline',
  },
});
