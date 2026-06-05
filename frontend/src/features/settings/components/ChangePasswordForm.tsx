import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { getApiErrorMessage } from '../hooks/useUserSettings';
import styles from './ChangePasswordForm.module.css';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

const ChangePasswordForm: React.FC = () => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password updated');
      reset();
    } catch (err: unknown) {
      toast.error(
        getApiErrorMessage(err, 'Could not change password. Check your current password and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          {...register('currentPassword')}
        />
        {errors.currentPassword && (
          <p className={styles.error}>{errors.currentPassword.message}</p>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          className={styles.input}
          autoComplete="new-password"
          {...register('newPassword')}
        />
        {errors.newPassword && <p className={styles.error}>{errors.newPassword.message}</p>}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          className={styles.input}
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className={styles.error}>{errors.confirmPassword.message}</p>
        )}
      </div>
      <button type="submit" className={styles.submitBtn} disabled={busy}>
        {busy ? <Loader2 size={16} className={styles.spinner} /> : null}
        Update password
      </button>
    </form>
  );
};

export default ChangePasswordForm;
