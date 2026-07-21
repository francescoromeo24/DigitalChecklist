import type { Role, User } from '../types';
import { newId } from '../types';
import { storageService } from './storageService';

const SESSION_KEY = 'digital-checklist-session';
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Derive a PBKDF2-SHA256 hash of the password with the given (or a fresh) salt. */
async function derive(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const cryptoObj = globalThis.crypto;
  const salt = saltHex ? hexToBytes(saltHex) : cryptoObj.getRandomValues(new Uint8Array(16));
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await cryptoObj.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

/** Constant-ish time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const authService = {
  /** True once at least one account exists (i.e. setup is done). */
  async hasAccounts(): Promise<boolean> {
    const users = await storageService.getUsers();
    return users.length > 0;
  },

  /** A strong random password an admin can hand to a new member. */
  generatePassword(length = 14): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%*?';
    const bytes = globalThis.crypto.getRandomValues(new Uint32Array(length));
    return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
  },

  /** Human-friendly recovery code, e.g. "K7QP-2M4X-9RTB". */
  generateRecoveryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
    return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
  },

  /**
   * Create the very first account (an admin) during first-run setup, returning
   * the user plus a one-time recovery code the caller must show them once.
   */
  async registerAdmin(
    name: string,
    email: string,
    password: string
  ): Promise<{ user: User; recoveryCode: string }> {
    if (await this.hasAccounts()) {
      throw new Error('An account already exists. Please sign in instead.');
    }
    const { hash, salt } = await derive(password);
    const recoveryCode = this.generateRecoveryCode();
    const recovery = await derive(recoveryCode);
    const user: User = {
      id: newId(),
      name: name.trim(),
      email: email.trim(),
      role: 'admin',
      passwordHash: hash,
      passwordSalt: salt,
      recoveryHash: recovery.hash,
      recoverySalt: recovery.salt
    };
    await storageService.saveUser(user);
    localStorage.setItem(SESSION_KEY, user.id);
    return { user, recoveryCode };
  },

  /** Issue a fresh recovery code for a user, returning the code to show once. */
  async regenerateRecovery(user: User): Promise<{ user: User; code: string }> {
    const code = this.generateRecoveryCode();
    const { hash, salt } = await derive(code);
    return { user: { ...user, recoveryHash: hash, recoverySalt: salt }, code };
  },

  /** Reset a forgotten password using the account's recovery code. */
  async recoverWithCode(email: string, code: string, newPassword: string): Promise<User> {
    const users = await storageService.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !user.recoveryHash || !user.recoverySalt) {
      throw new Error('No recovery code is set for that email.');
    }
    const { hash } = await derive(code.trim().toUpperCase(), user.recoverySalt);
    if (!safeEqual(hash, user.recoveryHash)) {
      throw new Error('That recovery code is not correct.');
    }
    const pw = await derive(newPassword);
    const updated: User = { ...user, passwordHash: pw.hash, passwordSalt: pw.salt };
    await storageService.saveUser(updated);
    localStorage.setItem(SESSION_KEY, updated.id);
    return updated;
  },

  /** Create the credential fields for a new team member (used by MembersManager). */
  async buildUser(name: string, email: string, role: Role, password: string): Promise<User> {
    const { hash, salt } = await derive(password);
    return {
      id: newId(),
      name: name.trim(),
      email: email.trim(),
      role,
      passwordHash: hash,
      passwordSalt: salt
    };
  },

  /** Reset (or set) a user's password, returning the updated record. */
  async setPassword(user: User, password: string): Promise<User> {
    const { hash, salt } = await derive(password);
    return { ...user, passwordHash: hash, passwordSalt: salt };
  },

  /** Verify a password against a user's stored hash without starting a session. */
  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash || !user.passwordSalt) return false;
    const { hash } = await derive(password, user.passwordSalt);
    return safeEqual(hash, user.passwordHash);
  },

  /** Change a user's own password after checking their current one. */
  async changePassword(user: User, current: string, next: string): Promise<User> {
    if (!(await this.verifyPassword(user, current))) {
      throw new Error('Your current password is not correct.');
    }
    return this.setPassword(user, next);
  },

  async login(email: string, password: string): Promise<User> {
    const users = await storageService.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || !user.passwordHash || !user.passwordSalt) {
      throw new Error('No account found for that email.');
    }
    if (user.active === false) {
      throw new Error('This account has been deactivated. Contact an administrator.');
    }
    const { hash } = await derive(password, user.passwordSalt);
    if (!safeEqual(hash, user.passwordHash)) {
      throw new Error('Incorrect password.');
    }
    localStorage.setItem(SESSION_KEY, user.id);
    return user;
  },

  async currentUser(): Promise<User | null> {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const users = await storageService.getUsers();
    return users.find((u) => u.id === id) ?? null;
  },

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  }
};
