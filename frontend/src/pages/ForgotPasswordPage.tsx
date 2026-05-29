import React, { useState } from 'react';
import styles from './LoginPage.module.css';
import AuthLayout from '../layouts/AuthLayout';
import api from '../api/axios';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/userFriendlyErrors';

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

const ForgotPasswordPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormValues) => {
    setIsSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email: data.email });
      setIsSent(true);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Could not send reset link. Please try again.');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className={styles.header}>
        <motion.h1
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {isSent ? 'Check Email' : 'Reset Password'}
        </motion.h1>
        <motion.p
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {isSent
            ? "If an account exists for that email, we've sent password reset instructions."
            : "Enter your email and we'll send you a reset link."}
        </motion.p>
      </div>

      {!isSent ? (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={styles.inputGroup}
          >
            <label>Email Address</label>
            <div className={styles.inputWrapper}>
              <Mail size={18} className={styles.icon} />
              <input
                {...register('email')}
                type="email"
                placeholder="name@example.com"
                className={errors.email ? styles.inputError : ''}
              />
            </div>
            {errors.email && <span className={styles.errorText}>{errors.email.message}</span>}
          </motion.div>

          <motion.button
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            type="submit"
            disabled={isSubmitting}
            className={styles.submitBtn}
          >
            {isSubmitting ? (
              <Loader2 className={styles.spinner} size={20} />
            ) : (
              <>
                Send Reset Link <Send size={18} />
              </>
            )}
          </motion.button>
        </form>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={styles.successState}
        >
          <button type="button" onClick={() => setIsSent(false)} className={styles.secondaryBtn}>
            Try another email
          </button>
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className={styles.footerText}
      >
        <Link to="/login" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Sign In
        </Link>
      </motion.p>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
