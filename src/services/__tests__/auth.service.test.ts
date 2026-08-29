/**
 * PlatoPlan - Auth Service Unit Tests
 *
 * Tests authentication flows (sign up, sign in, sign out, Google OAuth)
 * and error handling for invalid credentials and network failures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Supabase ──────────────────────────────────────────────────────────

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

// ─── Import after mock ──────────────────────────────────────────────────────

import { AuthService } from '../auth.service';
import type { AuthResult } from '../auth.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockSession() {
  return {
    access_token: 'test-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1', email: 'test@example.com' },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
  });

  // ── SIGN UP ─────────────────────────────────────────────────────────────

  describe('signUp', () => {
    it('should return success with session on successful sign up', async () => {
      const session = mockSession();
      mockSignUp.mockResolvedValue({ data: { session, user: session.user }, error: null });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.session).toEqual(session);
      expect(result.error).toBeUndefined();
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password123' });
    });

    it('should return success without session when email confirmation is required', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'user-1' } }, error: null });

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.session).toBeUndefined();
    });

    it('should return user-friendly error for already registered email', async () => {
      mockSignUp.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'User already registered', status: 400 },
      });

      const result = await service.signUp('existing@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Este correo ya está registrado');
    });

    it('should return user-friendly error for weak password', async () => {
      mockSignUp.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Password should be at least 6 characters', status: 422 },
      });

      const result = await service.signUp('test@example.com', '123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('La contraseña es demasiado débil. Usa al menos 6 caracteres.');
    });

    it('should return network error message for fetch failures', async () => {
      mockSignUp.mockRejectedValue(new Error('Failed to fetch'));

      const result = await service.signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sin conexión. Intenta de nuevo.');
    });
  });

  // ── SIGN IN ─────────────────────────────────────────────────────────────

  describe('signIn', () => {
    it('should return success with session on valid credentials', async () => {
      const session = mockSession();
      mockSignInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.session).toEqual(session);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password123' });
    });

    it('should return "Credenciales incorrectas" for invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials', status: 400 },
      });

      const result = await service.signIn('test@example.com', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credenciales incorrectas');
    });

    it('should return "Credenciales incorrectas" for unconfirmed email', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed', status: 400 },
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credenciales incorrectas');
    });

    it('should return network error for connection failures', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Unable to connect to the network', status: 0 },
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sin conexión. Intenta de nuevo.');
    });

    it('should return rate limit message for too many attempts', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Rate limit exceeded: too many requests', status: 429 },
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Demasiados intentos. Espera un momento antes de volver a intentarlo.');
    });

    it('should return generic error for unknown errors', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Some unknown internal error', status: 500 },
      });

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Ocurrió un error. Intenta de nuevo.');
    });

    it('should handle thrown exceptions gracefully', async () => {
      mockSignInWithPassword.mockRejectedValue(new Error('Network timeout'));

      const result = await service.signIn('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sin conexión. Intenta de nuevo.');
    });
  });

  // ── SIGN IN WITH GOOGLE ─────────────────────────────────────────────────

  describe('signInWithGoogle', () => {
    it('should call signInWithOAuth with google provider', async () => {
      mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/...' }, error: null });

      const result = await service.signInWithGoogle();

      expect(result.success).toBe(true);
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({ provider: 'google' });
    });

    it('should return error if OAuth initiation fails', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: null,
        error: { message: 'Failed to fetch', status: 0 },
      });

      const result = await service.signInWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sin conexión. Intenta de nuevo.');
    });

    it('should handle thrown exceptions during OAuth', async () => {
      mockSignInWithOAuth.mockRejectedValue(new Error('Network error'));

      const result = await service.signInWithGoogle();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sin conexión. Intenta de nuevo.');
    });
  });

  // ── SIGN OUT ────────────────────────────────────────────────────────────

  describe('signOut', () => {
    it('should call supabase signOut', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      await service.signOut();

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  // ── GET SESSION ─────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('should return session when one exists', async () => {
      const session = mockSession();
      mockGetSession.mockResolvedValue({ data: { session }, error: null });

      const result = await service.getSession();

      expect(result).toEqual(session);
    });

    it('should return null when no session exists', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      const result = await service.getSession();

      expect(result).toBeNull();
    });
  });

  // ── ON AUTH STATE CHANGE ────────────────────────────────────────────────

  describe('onAuthStateChange', () => {
    it('should subscribe to auth changes and return unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      });

      const callback = vi.fn();
      const unsubscribe = service.onAuthStateChange(callback);

      expect(mockOnAuthStateChange).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');

      // Calling unsubscribe should call subscription.unsubscribe
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should forward auth events to the callback', () => {
      let capturedCallback: Function;
      mockOnAuthStateChange.mockImplementation((cb: Function) => {
        capturedCallback = cb;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      });

      const callback = vi.fn();
      service.onAuthStateChange(callback);

      // Simulate auth event
      const session = mockSession();
      capturedCallback!('SIGNED_IN', session);

      expect(callback).toHaveBeenCalledWith('SIGNED_IN', session);
    });
  });

  // ── ERROR MAPPING ───────────────────────────────────────────────────────

  describe('error mapping (never exposes internal details)', () => {
    it('should never return raw Supabase error messages to users', async () => {
      const internalErrors = [
        'Invalid login credentials',
        'User already registered',
        'Password should be at least 6 characters',
        'Rate limit exceeded: too many requests',
        'Failed to fetch',
        'database connection error: timeout',
      ];

      for (const errorMsg of internalErrors) {
        mockSignInWithPassword.mockResolvedValue({
          data: { session: null, user: null },
          error: { message: errorMsg, status: 400 },
        });

        const result = await service.signIn('test@example.com', 'pass');

        // The returned error should NOT contain the raw internal message
        expect(result.error).not.toBe(errorMsg);
        expect(result.error).toBeDefined();
        expect(result.success).toBe(false);
      }
    });
  });
});
