import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { ModalDialog } from '../../../components/ModalDialog';
import styles from './CreatePollModal.module.css';
import { handlerSubmit } from '../../../utils/asyncHandler';
import { useViewerModalLock } from '../hooks/useViewerModalLock';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;

type PollOptionRow = { id: string; value: string };

function createEmptyOption(): PollOptionRow {
  return { id: crypto.randomUUID(), value: '' };
}

function createDefaultOptions(): PollOptionRow[] {
  return [createEmptyOption(), createEmptyOption()];
}

type CreatePollModalProps = Readonly<{
  open: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onSubmit: (data: { question: string; closesAt: string | null; options: string[] }) => Promise<void>;
}>;

const CreatePollModal: React.FC<CreatePollModalProps> = ({ open, onClose, isSubmitting, onSubmit }) => {
  const fieldId = useId();
  const questionId = `${fieldId}-question`;
  const closesAtId = `${fieldId}-closes-at`;
  const optionId = (index: number) => `${fieldId}-option-${index}`;

  const [question, setQuestion] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [options, setOptions] = useState<PollOptionRow[]>(createDefaultOptions);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setClosesAt('');
      setOptions(createDefaultOptions());
    }
  }, [open]);

  useViewerModalLock(open, onClose);

  if (!open) return null;

  const trimmedOptions = options.map((o) => o.value.trim()).filter(Boolean);
  const canSubmit =
    question.trim().length > 0 && trimmedOptions.length >= MIN_OPTIONS && trimmedOptions.length <= MAX_OPTIONS;

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, createEmptyOption()]);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, value } : o)));
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    const closesIso =
      closesAt.trim().length > 0 ? new Date(closesAt).toISOString() : null;
    await onSubmit({
      question: question.trim(),
      closesAt: closesIso,
      options: trimmedOptions,
    });
  };

  return createPortal(
    <ModalDialog aria-labelledby="poll-modal-title" onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="poll-modal-title" className={styles.title}>
            Create poll
          </h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form className={styles.form} onSubmit={handlerSubmit(handleSubmit)}>
          <label className={styles.label} htmlFor={questionId}>
            <span className={styles.labelText}>Question</span>
            <input
              id={questionId}
              className={styles.input}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask something…"
              maxLength={500}
              autoFocus
            />
          </label>
          <label className={styles.label} htmlFor={closesAtId}>
            <span className={styles.labelText}>Closes at (optional)</span>
            <input
              id={closesAtId}
              type="datetime-local"
              className={`${styles.input} ${styles.inputDatetime}`}
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </label>
          <div className={styles.optionsBlock}>
            <span className={styles.labelText}>Options ({MIN_OPTIONS}–{MAX_OPTIONS})</span>
            {options.map((opt, i) => (
              <div key={opt.id} className={styles.optionRow}>
                <label className={styles.srOnly} htmlFor={optionId(i)}>
                  Option {i + 1}
                </label>
                <input
                  id={optionId(i)}
                  className={styles.input}
                  value={opt.value}
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
    </ModalDialog>,
    document.body,
  );
};

export default CreatePollModal;
