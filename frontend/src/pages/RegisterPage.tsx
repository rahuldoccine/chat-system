import React, { useState } from 'react';
import styles from './LoginPage.module.css'; // Reusing styles for consistency
import AuthLayout from '../layouts/AuthLayout';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast, Toaster } from 'sonner';
import { getApiErrorMessage } from '../utils/userFriendlyErrors';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
      });

      const { user, accessToken } = response.data;
      
      // Auto-login after registration
      login(user, accessToken);

      toast.success('Account created successfully!');
      navigate('/');
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "We couldn't create your account. Please try again.");
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Toaster position="top-center" richColors />
      <div className={styles.header}>
        <motion.h1 
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Join Chat System
        </motion.h1>
        <motion.p
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Create your account to start chatting
        </motion.p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={styles.inputGroup}
        >
          <label>Full Name</label>
          <div className={styles.inputWrapper}>
            <User size={18} strokeWidth={2.5} className={styles.icon} />
            <input
              {...register('name')}
              type="text"
              placeholder="John Doe"
              className={errors.name ? styles.inputError : ''}
            />
          </div>
          {errors.name && <span className={styles.errorText}>{errors.name.message}</span>}
        </motion.div>

        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={styles.inputGroup}
        >
          <label>Email Address</label>
          <div className={styles.inputWrapper}>
            <Mail size={18} strokeWidth={2.5} className={styles.icon} />
            <input
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
          transition={{ delay: 0.6 }}
          className={styles.inputGroup}
        >
          <label>Password</label>
          <div className={styles.inputWrapper}>
            <Lock size={18} strokeWidth={2.5} className={styles.icon} />
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className={errors.password ? styles.inputError : ''}
            />
          </div>
          {errors.password && <span className={styles.errorText}>{errors.password.message}</span>}
        </motion.div>

        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className={styles.inputGroup}
        >
          <label>Confirm Password</label>
          <div className={styles.inputWrapper}>
            <ShieldCheck size={18} strokeWidth={2.5} className={styles.icon} />
            <input
              {...register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className={errors.confirmPassword ? styles.inputError : ''}
            />
          </div>
          {errors.confirmPassword && <span className={styles.errorText}>{errors.confirmPassword.message}</span>}
        </motion.div>

        <motion.button
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          type="submit"
          disabled={isSubmitting}
          className={styles.submitBtn}
        >
          {isSubmitting ? (
            <Loader2 className={styles.spinner} size={20} />
          ) : (
            <>
              Create Account <ArrowRight size={20} />
            </>
          )}
        </motion.button>
      </form>

      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className={styles.footerText}
      >
        Already have an account? <Link to="/login">Sign in</Link>
      </motion.p>
    </AuthLayout>
  );
};

export default RegisterPage;
