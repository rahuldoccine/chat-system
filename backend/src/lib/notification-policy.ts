export function shouldSendPush(input: {
  notifyPush: boolean;
  mutedUntil: Date | null;
  /** True only when the recipient's tab is visible and that chat is open in the app. */
  isActivelyViewingChat: boolean;
}): boolean {
  if (!input.notifyPush) {
    return false;
  }
  if (input.mutedUntil && input.mutedUntil > new Date()) {
    return false;
  }
  if (input.isActivelyViewingChat) {
    return false;
  }
  return true;
}
