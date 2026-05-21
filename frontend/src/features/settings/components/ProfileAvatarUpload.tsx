import React, { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useUpload } from '../../chat/hooks/useUpload';
import { useProfileSync } from '../hooks/useProfileSync';
import {
  useUpdateProfile,
  getApiErrorMessage,
  type Profile,
} from '../hooks/useUserSettings';
import {
  getAvatarImageSrc,
  toStoredAvatarUrl,
  validateAvatarFile,
} from '../utils/avatarUrl';
import styles from './ProfileAvatarUpload.module.css';

type ProfileAvatarUploadProps = {
  profile: Profile | undefined;
  onUpdated: (user: Profile) => void;
  disabled?: boolean;
};

const ProfileAvatarUpload: React.FC<ProfileAvatarUploadProps> = ({
  profile,
  onUpdated,
  disabled = false,
}) => {
  const { token, user } = useAuth();
  const { syncProfileEverywhere } = useProfileSync();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { uploadFile, progress, status: uploadStatus, reset: resetUpload } = useUpload();
  const { mutateAsync: updateProfile, isPending: savingAvatar } = useUpdateProfile();

  const isBusy = disabled || uploadStatus === 'uploading' || savingAvatar;
  const displayName = profile?.displayName || profile?.email || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const liveAvatarUrl =
    user?.id === profile?.id ? (user?.avatar ?? profile?.avatarUrl) : profile?.avatarUrl;
  const previewSrc = getAvatarImageSrc(liveAvatarUrl, token);

  const handlePickFile = () => {
    if (isBusy) return;
    setLocalError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !profile) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    try {
      const result = await uploadFile(file);
      if (!result.ok) {
        setLocalError(result.message);
        toast.error(result.message);
        return;
      }
      const uploaded = result.data;

      const avatarUrl = toStoredAvatarUrl(uploaded.url);
      const optimistic = { ...profile, avatarUrl };
      syncProfileEverywhere(optimistic);
      const updated = await updateProfile({ avatarUrl });
      onUpdated(updated);
      toast.success('Profile photo updated');
    } catch (err) {
      const message = getApiErrorMessage(err, "We couldn't update your profile photo. Please try again.");
      setLocalError(message);
      toast.error(message);
    } finally {
      resetUpload();
    }
  };

  const handleRemove = async () => {
    if (isBusy || !profile?.avatarUrl) return;
    setLocalError(null);
    try {
      syncProfileEverywhere({ ...profile, avatarUrl: null });
      const updated = await updateProfile({ avatarUrl: null });
      onUpdated(updated);
      toast.success('Profile photo removed');
    } catch (err) {
      const message = getApiErrorMessage(err, "We couldn't remove your profile photo. Please try again.");
      setLocalError(message);
      toast.error(message);
    }
  };

  return (
    <div className={styles.section}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
        className={styles.fileInput}
        onChange={(e) => void handleFileChange(e)}
        disabled={isBusy}
      />

      <div className={styles.previewWrap}>
        {previewSrc ? (
          <img src={previewSrc} alt="" className={styles.preview} />
        ) : (
          <div className={styles.previewFallback} aria-hidden>
            {initial}
          </div>
        )}
        {uploadStatus === 'uploading' && (
          <div className={styles.uploadingOverlay} aria-hidden>
            <Loader2 size={28} className={styles.spinner} />
          </div>
        )}
      </div>

      <div className={styles.meta}>
        <p className={styles.label}>Profile photo</p>
        <p className={styles.hint}>JPG, PNG, WebP, or GIF. Max 5 MB. Shown in the sidebar and your account.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={handlePickFile} disabled={isBusy}>
            {savingAvatar ? <Loader2 size={16} className={styles.spinner} /> : <Camera size={16} />}
            {profile?.avatarUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {profile?.avatarUrl && (
            <button type="button" className={styles.btnSecondary} onClick={() => void handleRemove()} disabled={isBusy}>
              <Trash2 size={16} />
              Remove
            </button>
          )}
        </div>
        {uploadStatus === 'uploading' && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}
        {localError && <p className={styles.error}>{localError}</p>}
      </div>
    </div>
  );
};

export default ProfileAvatarUpload;
