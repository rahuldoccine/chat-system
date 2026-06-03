import React, { useState } from 'react';
import styles from './LoginPage.module.css';
import AuthLayout from '../layouts/AuthLayout';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/userFriendlyErrors';

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/login', {
        email: data.email,
        password: data.password,
      });

      const { user, accessToken } = response.data;

      await login(user, accessToken, data.password);

      toast.success('Welcome back!');
      navigate('/', { replace: true });
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Email or password is incorrect. Please try again.');
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
          Welcome Back
        </motion.h1>
        <motion.p
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Login to your Chat System account
        </motion.p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={styles.inputGroup}
        >
          <label htmlFor="login-email">Email Address</label>
          <div className={styles.inputWrapper}>
            <Mail size={18} strokeWidth={2.5} className={styles.icon} />
            <input
              id="login-email"
              {...register('email')}
              type="email"
              placeholder="name@example.com"
              className={errors.email ? styles.inputError : ''}
            />
          </div>
          {errors.email && <span className={styles.errorText}>{errors.email.message}</span>}
        </motion.div>

        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={styles.inputGroup}
        >
          <div className={styles.labelRow}>
            <label htmlFor="login-password">Password</label>
            <Link to="/forgot-password" className={styles.forgotLink}>Forgot?</Link>
          </div>
          <div className={styles.inputWrapper}>
            <Lock size={18} strokeWidth={2.5} className={styles.icon} />
            <input
              id="login-password"
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className={errors.password ? styles.inputError : ''}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={styles.visibilityToggle}
            >
              {showPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}
            </button>
          </div>
          {errors.password && <span className={styles.errorText}>{errors.password.message}</span>}
        </motion.div>

        <motion.button
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          type="submit"
          disabled={isSubmitting}
          className={styles.submitBtn}
        >
          {isSubmitting ? (
            <Loader2 className={styles.spinner} size={20} />
          ) : (
            <>
              Sign In <ArrowRight size={20} />
            </>
          )}
        </motion.button>
      </form>

      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className={styles.footerText}
      >
        Don't have an account? <Link to="/register">Create one</Link>
      </motion.p>
    </AuthLayout>
  );
};

export default LoginPage;
