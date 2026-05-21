import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import styles from './CreatePollModal.module.css';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

type CreatePollModalProps = {
  open: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onSubmit: (data: { question: string; closesAt: string | null; options: string[] }) => Promise<void>;
};

const CreatePollModal: React.FC<CreatePollModalProps> = ({ open, onClose, isSubmitting, onSubmit }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [question, setQuestion] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setClosesAt('');
      setOptions(['', '']);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit =
    question.trim().length > 0 && trimmedOptions.length >= MIN_OPTIONS && trimmedOptions.length <= MAX_OPTIONS;

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    const closesIso =
      closesAt.trim().length > 0 ? new Date(closesAt).toISOString() : null;
    await onSubmit({
      question: question.trim(),
      closesAt: closesIso,
      options: trimmedOptions,
    });
  };

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCloseRef.current();
  };

  return createPortal(
    <div className={styles.overlay} role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="poll-modal-title" className={styles.title}>
            Create poll
          </h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <label className={styles.label}>
            Question
            <input
              className={styles.input}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask something…"
              maxLength={500}
              autoFocus
            />
          </label>
          <label className={styles.label}>
            Closes at (optional)
            <input
              type="datetime-local"
              className={`${styles.input} ${styles.inputDatetime}`}
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </label>
          <div className={styles.optionsBlock}>
            <span className={styles.labelText}>Options ({MIN_OPTIONS}–{MAX_OPTIONS})</span>
            {options.map((opt, i) => (
              <div key={i} className={styles.optionRow}>
                <input
                  className={styles.input}
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={200}
                />
                {options.length > MIN_OPTIONS && (
                  <button type="button" className={styles.removeOpt} onClick={() => removeOption(i)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button type="button" className={styles.addOpt} onClick={addOption}>
                Add option
              </button>
            )}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? <Loader2 className={styles.spinner} size={18} /> : 'Create poll'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CreatePollModal;
