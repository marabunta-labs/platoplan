/**
 * PlatoPlan - Auth Service
 *
 * Wraps Supabase Auth methods with user-friendly error handling.
 * Maps internal Supabase errors to localized Spanish messages.
 * Supports email/password auth and Google OAuth.
 */

import type { Session, AuthChangeEvent, Subscription } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Auth event types exposed to consumers. */
export type AuthEvent = AuthChangeEvent;

/** Unsubscribe function returned by auth state listeners. */
export type Unsubscribe = () => void;

/** Result of an authentication operation. */
export interface AuthResult {
  success: boolean;
  error?: string;
  session?: Session;
}

/** Public interface for the authentication service. */
export interface IAuthService {
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void): Unsubscribe;
}

// ─── Error Mapping ──────────────────────────────────────────────────────────

/**
 * Maps Supabase error messages/codes to user-friendly Spanish messages.
 * Internal details are never exposed to the user.
 */
function mapAuthError(error: { message: string; status?: number }): string {
  const msg = error.message.toLowerCase();

  // Invalid credentials
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('invalid email or password') ||
    msg.includes('email not confirmed')
  ) {
    return 'Credenciales incorrectas';
  }

  // User already exists
  if (msg.includes('user already registered') || msg.includes('already registered')) {
    return 'Este correo ya está registrado';
  }

  // Weak password
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('short') || msg.includes('at least'))) {
    return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.';
  }

  // Rate limiting
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
  }

  // Network / fetch errors
  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('unable to connect') ||
    msg.includes('timeout')
  ) {
    return 'Sin conexión. Intenta de nuevo.';
  }

  // Generic fallback — never expose internal error details
  return 'Ocurrió un error. Intenta de nuevo.';
}

// ─── AuthService Implementation ─────────────────────────────────────────────

export class AuthService implements IAuthService {
  /**
   * Registers a new user with email and password.
   * On success, may require email confirmation depending on Supabase project settings.
   */
  async signUp(email: string, password: string): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        return { success: false, error: mapAuthError(error) };
      }

      return {
        success: true,
        session: data.session ?? undefined,
      };
    } catch (err: unknown) {
      return { success: false, error: mapAuthError(toError(err)) };
    }
  }

  /**
   * Signs in with email and password.
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { success: false, error: mapAuthError(error) };
      }

      return {
        success: true,
        session: data.session ?? undefined,
      };
    } catch (err: unknown) {
      return { success: false, error: mapAuthError(toError(err)) };
    }
  }

  /**
   * Initiates Google OAuth sign-in.
   * For React Native / Expo, this triggers a browser-based OAuth flow.
   */
  async signInWithGoogle(): Promise<AuthResult> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });

      if (error) {
        return { success: false, error: mapAuthError(error) };
      }

      // OAuth flows redirect externally; session will be captured via onAuthStateChange
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mapAuthError(toError(err)) };
    }
  }

  /**
   * Signs out the current user and clears the session.
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  /**
   * Retrieves the current session, or null if none exists.
   */
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  /**
   * Subscribes to auth state changes (sign-in, sign-out, token refresh).
   * Returns an unsubscribe function.
   */
  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void): Unsubscribe {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalizes unknown caught errors into an object with a message. */
function toError(err: unknown): { message: string } {
  if (err instanceof Error) {
    return { message: err.message };
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  return { message: 'Unknown error' };
}

// ─── Singleton Export ───────────────────────────────────────────────────────

/** Default AuthService instance for use throughout the app. */
export const authService = new AuthService();
