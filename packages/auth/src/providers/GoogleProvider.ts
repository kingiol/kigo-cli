/**
 * Google OAuth provider
 */

import { OAuthProvider } from '../OAuthProvider.js';
import { generatePKCE, generateState } from '../PKCE.js';
import { TokenStorage, type OAuthTokens } from '../TokenStorage.js';
import axios from 'axios';

export class GoogleProvider extends OAuthProvider {
  private readonly clientId = '77185425430.apps.googleusercontent.com';
  private readonly authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly redirectUri = 'http://localhost:8085/oauth2callback';

  async login(): Promise<OAuthTokens> {
    const { verifier, challenge } = generatePKCE();
    const state = generateState();

    const authUrl = new URL(this.authUrl);
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', this.redirectUri);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'cloud-platform userinfo.email userinfo.profile');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    // Start callback server
    const code = await this.startCallbackServer(state);

    // Exchange code for tokens
    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        client_id: this.clientId,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code_verifier: verifier,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const tokens: OAuthTokens = {
      provider: 'google',
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    await TokenStorage.save(tokens);
    return tokens;
  }

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        client_id: this.clientId,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return {
      ...tokens,
      accessToken: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };
  }

  async listModels(accessToken: string): Promise<string[]> {
    try {
      const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => `google/${m.name}`);
    } catch {
      // Fallback to hardcoded list
      return [
        'google/gemini-2.5-pro-preview-03-25',
        'google/gemini-2.5-flash-preview-04-17',
        'google/gemini-2.0-flash-exp',
        'google/gemini-1.5-pro',
        'google/gemini-1.5-flash',
      ];
    }
  }
}