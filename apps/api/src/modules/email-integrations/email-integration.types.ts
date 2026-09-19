export interface EmailConnectionSettings {
  /** Whether new inbound messages should auto-create tickets (Feature 6). Defaults true once sync exists. */
  autoCreateTickets: boolean;
  /** Kill switch an owner can flip without fully disconnecting/re-authing Gmail. */
  syncEnabled: boolean;
}

export const DEFAULT_EMAIL_CONNECTION_SETTINGS: EmailConnectionSettings = {
  autoCreateTickets: true,
  syncEnabled: true,
};
