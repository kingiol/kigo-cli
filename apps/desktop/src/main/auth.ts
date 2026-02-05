import { GoogleProvider, TokenStorage } from '@kigo/auth';

const PROVIDERS: Record<string, { new (): { login: () => Promise<any> } }> = {
  google: GoogleProvider
};

export async function login(provider: string): Promise<{ ok: boolean; message?: string }> {
  const ProviderClass = PROVIDERS[provider];
  if (!ProviderClass) {
    return { ok: false, message: `Unknown provider: ${provider}` };
  }

  try {
    const instance = new ProviderClass();
    await instance.login();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function listProviders(): Promise<
  Array<{ provider: string; email?: string; expiresAt?: number; expired?: boolean }>
> {
  const providers = await TokenStorage.list();
  const results: Array<{ provider: string; email?: string; expiresAt?: number; expired?: boolean }> = [];

  for (const provider of providers) {
    const tokens = await TokenStorage.load(provider);
    if (!tokens) continue;
    results.push({
      provider,
      email: tokens.email,
      expiresAt: tokens.expiresAt,
      expired: TokenStorage.isExpired(tokens)
    });
  }

  return results;
}

export async function getStatus(provider: string): Promise<{
  provider: string;
  email?: string;
  expiresAt?: number;
  expired?: boolean;
  models?: string[];
}> {
  const tokens = await TokenStorage.load(provider);
  if (!tokens) {
    return { provider };
  }

  return {
    provider: tokens.provider,
    email: tokens.email,
    expiresAt: tokens.expiresAt,
    expired: TokenStorage.isExpired(tokens),
    models: tokens.models
  };
}

export async function revoke(provider: string): Promise<{ ok: boolean }> {
  await TokenStorage.delete(provider);
  return { ok: true };
}
