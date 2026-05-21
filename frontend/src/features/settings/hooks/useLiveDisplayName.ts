import { useAuth } from '../../../context/AuthContext';

/** Prefer live AuthContext name for the signed-in user (instant after settings save). */
export function useLiveDisplayName(
  userId: string | undefined,
  displayName: string | null | undefined,
  email?: string,
): string {
  const { user } = useAuth();

  if (userId && user?.id === userId) {
    return user.name || email || 'User';
  }

  return displayName || email || 'User';
}
