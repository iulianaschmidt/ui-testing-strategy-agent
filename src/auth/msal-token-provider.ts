import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
} from "@azure/msal-node";

import type { RuntimeConfig } from "../config/runtime.js";
import type { AccessToken, TokenProvider } from "./token-provider.js";

const GRAPH_SCOPES = ["Files.Read.All", "Sites.ReadWrite.All", "User.Read"] as const;

export class MsalDeviceCodeTokenProvider implements TokenProvider {
  readonly #client: PublicClientApplication;
  #account: AccountInfo | undefined;

  constructor(config: Pick<RuntimeConfig, "clientId" | "tenantId">) {
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}`,
      },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          loggerCallback: (_level, message, containsPii) => {
            if (!containsPii) console.error(`[msal] ${message}`);
          },
        },
      },
    };
    this.#client = new PublicClientApplication(msalConfig);
  }

  async getAccessToken(): Promise<AccessToken> {
    let result: AuthenticationResult | null = null;
    if (this.#account) {
      try {
        result = await this.#client.acquireTokenSilent({
          account: this.#account,
          scopes: [...GRAPH_SCOPES],
        });
      } catch {
        result = null;
      }
    }

    result ??= await this.#client.acquireTokenByDeviceCode({
      scopes: [...GRAPH_SCOPES],
      deviceCodeCallback: (response) => {
        console.error(response.message);
      },
    });

    if (!result?.accessToken || !result.account) {
      throw new Error(
        "Microsoft Entra authentication completed without an access token or account",
      );
    }
    this.#account = result.account;
    return {
      token: result.accessToken,
      accountId: result.account.homeAccountId,
      ...(result.account.username ? { username: result.account.username } : {}),
      ...(result.expiresOn ? { expiresOn: result.expiresOn } : {}),
    };
  }
}

export const delegatedGraphScopes = [...GRAPH_SCOPES];
