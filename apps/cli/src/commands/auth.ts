/**
 * Auth commands
 */

import { Command } from "commander";
import { TokenStorage, GoogleProvider } from "@koder/auth";

export function authCommands(program: Command): void {
  const authCmd = program
    .command("auth")
    .description("Manage OAuth authentication");

  authCmd
    .command("login <provider>")
    .description("Login with OAuth provider (google)")
    .action(async (provider) => {
      const providers: Record<string, any> = {
        google: GoogleProvider,
      };

      const ProviderClass = providers[provider];
      if (!ProviderClass) {
        console.error(`Unknown provider: ${provider}`);
        console.error(
          "Available providers:",
          Object.keys(providers).join(", ")
        );
        process.exit(1);
      }

      const providerInstance = new ProviderClass();
      try {
        console.log(`Opening browser for ${provider} authentication...`);
        const tokens = await providerInstance.login();
        console.log(`Successfully logged in as ${tokens.email || provider}`);
      } catch (error) {
        console.error(
          "Login failed:",
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  authCmd
    .command("list")
    .description("List configured providers")
    .action(async () => {
      const providers = await TokenStorage.list();
      if (providers.length === 0) {
        console.log("No providers configured");
        return;
      }
      console.log("Configured providers:");
      for (const provider of providers) {
        const tokens = await TokenStorage.load(provider);
        const status = TokenStorage.isExpired(tokens!) ? " (expired)" : "";
        console.log(`  - ${provider}${status}`);
      }
    });

  authCmd
    .command("status [provider]")
    .description("Show authentication status")
    .action(async (provider) => {
      if (provider) {
        const tokens = await TokenStorage.load(provider);
        if (!tokens) {
          console.log(`Provider ${provider} not configured`);
          return;
        }
        console.log(`Provider: ${tokens.provider}`);
        console.log(`Email: ${tokens.email || "N/A"}`);
        console.log(`Expires: ${new Date(tokens.expiresAt).toISOString()}`);
        console.log(`Models: ${tokens.models?.join(", ") || "N/A"}`);
      } else {
        // Show all providers
        const providers = await TokenStorage.list();
        for (const p of providers) {
          const tokens = await TokenStorage.load(p);
          console.log(`${p}: ${tokens?.email || "N/A"}`);
        }
      }
    });

  authCmd
    .command("revoke <provider>")
    .description("Revoke authentication")
    .action(async (provider) => {
      await TokenStorage.delete(provider);
      console.log(`Revoked authentication for ${provider}`);
    });
}
