/**
 * PlatoPlan - Auth Context
 *
 * Provides authentication state to the entire app.
 * When no session exists and not in guest mode → renders auth screens (Login/Register).
 * When authenticated or in guest mode → renders children (main app).
 * Allows cached session to persist when offline.
 * Guest mode persists in AsyncStorage.
 *
 * Requirements: 4.1, 4.5, 4.8
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { authService } from '../services/auth.service';
import type { AuthEvent } from '../services/auth.service';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';

// ─── Constants ──────────────────────────────────────────────────────────────

const GUEST_MODE_KEY = '@platoplan/guest_mode';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  signOut: () => Promise<void>;
  exitGuestMode: () => void;
}

interface GuestAccessContextValue {
  continueAsGuest: () => void;
}

// ─── Contexts ───────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);
const GuestAccessContext = createContext<GuestAccessContextValue | null>(null);

// ─── Auth Stack Navigator ───────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <NavigationContainer>
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    </NavigationContainer>
  );
}

// ─── Provider ───────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider wraps the app and manages authentication state.
 * - On mount: checks for existing session and guest mode preference
 * - Subscribes to auth state changes for real-time updates
 * - When no session AND not guest → renders Login/Register auth screens
 * - When session exists OR guest mode → renders children (main app)
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        // Check guest mode preference
        const guestStored = await AsyncStorage.getItem(GUEST_MODE_KEY);
        if (!cancelled && guestStored === 'true') {
          setIsGuest(true);
        }

        // Check for existing session (works offline with cached session)
        const existingSession = await authService.getSession();
        if (!cancelled) {
          setSession(existingSession);
          // If we got a session, exit guest mode
          if (existingSession) {
            setIsGuest(false);
            AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
          }
        }
      } catch {
        // If session check fails (e.g., network issue), keep null session
        // but allow cached session from storage to persist via onAuthStateChange
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initialize();

    // Subscribe to auth state changes (sign-in, sign-out, token refresh)
    const unsubscribe = authService.onAuthStateChange(
      (_event: AuthEvent, newSession: Session | null) => {
        if (!cancelled) {
          setSession(newSession);
          // If user signs in, exit guest mode
          if (newSession) {
            setIsGuest(false);
            AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
          }
          setIsLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const continueAsGuest = () => {
    setIsGuest(true);
    AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
  };

  const exitGuestMode = () => {
    setIsGuest(false);
    AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
  };

  const signOut = async () => {
    await authService.signOut();
    setSession(null);
    setIsGuest(false);
    AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
  };

  // Show loading spinner while checking initial session
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // No session AND not guest → show auth screens (wrapped with GuestAccessContext)
  if (!session && !isGuest) {
    return (
      <GuestAccessContext.Provider value={{ continueAsGuest }}>
        <AuthNavigator />
      </GuestAccessContext.Provider>
    );
  }

  // Authenticated OR guest mode → render main app
  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        isGuest,
        signOut,
        exitGuestMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Hook to access auth state from any component within AuthProvider.
 * Returns { session, user, isLoading, isGuest, signOut, exitGuestMode }.
 * Throws if used outside of AuthProvider when authenticated.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an authenticated AuthProvider');
  }
  return context;
}

/**
 * Hook to access guest access function from auth screens.
 * Only available within the AuthNavigator (unauthenticated state).
 */
export function useGuestAccess(): GuestAccessContextValue {
  const context = useContext(GuestAccessContext);
  if (!context) {
    throw new Error('useGuestAccess must be used within AuthProvider auth screens');
  }
  return context;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
