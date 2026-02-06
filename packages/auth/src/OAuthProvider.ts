/**
 * Base OAuth provider
 */

import express, { type Request, type Response } from 'express';
import type { OAuthTokens } from './TokenStorage.js';

const DEFAULT_CALLBACK_TIMEOUT_MS = 2 * 60 * 1000;

export abstract class OAuthProvider {
  protected readonly callbackPort = 8085;
  protected readonly callbackTimeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS;

  abstract login(): Promise<OAuthTokens>;
  abstract refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
  abstract listModels(accessToken: string): Promise<string[]>;

  protected async startCallbackServer(state: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const app = express();
      let settled = false;

      const finish = (error?: Error, code?: string): void => {
        if (settled) {
          return;
        }
        settled = true;

        clearTimeout(timeoutHandle);
        server.close(() => {
          if (error) {
            reject(error);
            return;
          }
          resolve(code!);
        });
      };

      const server = app.listen(this.callbackPort, () => {
        console.log(`Callback server listening on port ${this.callbackPort}`);
      });

      const timeoutHandle = setTimeout(() => {
        finish(new Error('OAuth callback timed out'));
      }, this.callbackTimeoutMs);

      app.get('/oauth2callback', (req: Request, res: Response) => {
        const code = this.getQueryParam(req.query.code);
        const returnedState = this.getQueryParam(req.query.state);

        if (returnedState !== state) {
          res.status(400).send('Invalid state parameter');
          finish(new Error('Invalid state parameter'));
          return;
        }

        if (!code) {
          res.status(400).send('No code parameter');
          finish(new Error('No code parameter'));
          return;
        }

        res.send('<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>');
        finish(undefined, code);
      });

      server.on('error', (err: Error) => {
        finish(err);
      });
    });
  }

  private getQueryParam(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      const first = value[0];
      return typeof first === 'string' ? first : undefined;
    }

    return undefined;
  }
}
