/**
 * CodexStudy product UI toggles (not user settings).
 * Set `SHOW_ACCOUNT_LOGIN_UI` to `true` to bring back ChatGPT / managed-login surfaces.
 */
export const SHOW_ACCOUNT_LOGIN_UI = false;

export function isAccountLoginUiEnabled(): boolean {
  return SHOW_ACCOUNT_LOGIN_UI;
}
