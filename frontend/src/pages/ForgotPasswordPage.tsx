import React, { useState } from 'react';
import styles from './LoginPage.module.css';
import AuthLayout from '../layouts/AuthLayout';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast, Toaster } from 'sonner';

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

  const onSubmit = async (_data: ForgotFormValues) => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSent(true);
    toast.success('Reset link sent to your email');
  };

  return (
    <AuthLayout>
      <Toaster position="top-center" richColors />
      <div className={styles.header}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={styles.iconCircle}
        >
          <Lock size={32} color="var(--primary)" />
        </motion.div>
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
            ? "We've sent a password reset link to your email." 
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
          <button onClick={() => setIsSent(false)} className={styles.secondaryBtn}>
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

// Internal components/styles for the forgot password page
import { Lock } from 'lucide-react';

export default ForgotPasswordPage;
