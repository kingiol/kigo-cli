/**
 * Base OAuth provider
 */

import type { OAuthTokens } from './TokenStorage.js';

export abstract class OAuthProvider {
  abstract login(): Promise<OAuthTokens>;
  abstract refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
  abstract listModels(accessToken: string): Promise<string[]>;

  protected async startCallbackServer(state: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const express = require('express');
      const app = express();

      const server = app.listen(8085, () => {
        console.log('Callback server listening on port 8085');
      });

      app.get('/oauth2callback', (req: any, res: any) => {
        const { code, state: returnedState } = req.query;

        if (returnedState !== state) {
          res.status(400).send('Invalid state parameter');
          reject(new Error('Invalid state parameter'));
          return;
        }

        if (!code) {
          res.status(400).send('No code parameter');
          reject(new Error('No code parameter'));
          return;
        }

        res.send('<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>');
        server.close();
        resolve(code as string);
      });

      server.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}