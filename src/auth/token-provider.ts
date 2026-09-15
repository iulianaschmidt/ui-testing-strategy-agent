export interface AccessToken {
  token: string;
  accountId: string;
  username?: string;
  expiresOn?: Date;
}

export interface TokenProvider {
  getAccessToken(): Promise<AccessToken>;
}
