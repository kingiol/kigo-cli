/**
 * PKCE (Proof Key for Code Exchange) utilities
 */

import * as crypto from 'node:crypto';

export interface PKCEPair {
  verifier: string;
  challenge: string;
}

export function generatePKCE(): PKCEPair {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const digest = crypto.createHash('sha256').update(verifier).digest();
  const challenge = digest.toString('base64url');
  return { verifier, challenge };
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  const digest = crypto.createHash('sha256').update(verifier).digest();
  return digest.toString('base64url');
}