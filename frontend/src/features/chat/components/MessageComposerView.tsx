import { createPortal } from 'react-dom';
import styles from './MessageComposer.module.css';
import {
  Send,
  Plus,
  Paperclip,
  Smile,
  Loader2,
  X,
  File,
  Image as ImageIcon,
  Film,
  Mic,
  BarChart2,
  Music,
} from 'lucide-react';
import GifPickerPanel from './GifPickerPanel';
import CreatePollModal from './CreatePollModal';
import EmojiPicker from 'emoji-picker-react';
import { truncateFilenameMiddle } from '../utils/formatFilename';
import { handler, handlerArg } from '../../../utils/asyncHandler';
import { env, allowedFileAcceptAttribute } from '../../../config/env';
import {
  formatAttachmentSize,
  isComposerAudioFile,
  isComposerVideoFile,
} from '../utils/fileMeta';
import AlertModal from './AlertModal';
import LinkPreviewBlock from './LinkPreviewBlock';
import type { LinkDisplayMode, LinkPreviewMeta } from '../types';
import MessageComposerReplyBars from './MessageComposerReplyBars';
import {
  isSendButtonActive,
  isSendDisabled,
  shouldShowComposerLinkPreview,
} from './messageComposer.helpers';
import type { MessageComposerModel } from './useMessageComposerModel';

function formatComposerPlaceholder(
  editingMessage: { id: string; text: string } | null,
  voiceBusy: boolean,
  isRecording: boolean,
  isThread: boolean,
): string {
  if (editingMessage) return 'Edit message…';
  if (voiceBusy) return isRecording ? 'Recording…' : 'Uploading…';
  return isThread ? 'Reply...' : 'Type a message...';
}

function attachmentIcon(file: File) {
  if (file.type.startsWith('image/')) return ImageIcon;
  if (isComposerVideoFile(file)) return Film;
  if (isComposerAudioFile(file)) return Music;
  return File;
}

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type ComposerRecordingBarProps = Readonly<{
  elapsedMs: number;
  onCancel: () => void;
}>;

function ComposerRecordingBar({ elapsedMs, onCancel }: ComposerRecordingBarProps) {
  return (
    <output className={styles.recordingBar} aria-live="polite">
      <span className={styles.recordingPulse} aria-hidden />
      <Mic size={18} className={styles.recordingMicIcon} aria-hidden />
      <div className={styles.recordingText}>
        <span className={styles.recordingTitle}>Recording…</span>
        <span className={styles.recordingHint}>Release to send</span>
      </div>
      <span className={styles.recordingTimer}>{formatRecordingTime(elapsedMs)}</span>
      <button type="button" className={styles.recordingCancel} onClick={onCancel}>
        Cancel
      </button>
    </output>
  );
}

type ComposerLinkPreviewSectionProps = Readonly<{
  preview: LinkPreviewMeta;
  linkDisplayAs: LinkDisplayMode;
  isLinkPreviewFetching: boolean;
  onDisplayAsChange: (mode: LinkDisplayMode) => void;
  onRemove: () => void;
}>;

function ComposerLinkPreviewSection({
  preview,
  linkDisplayAs,
  isLinkPreviewFetching,
  onDisplayAsChange,
  onRemove,
}: ComposerLinkPreviewSectionProps) {
  return (
    <div className={styles.composerPreview}>
      <LinkPreviewBlock
        preview={preview}
        displayAs={linkDisplayAs}
        variant="composer"
        isEnriching={isLinkPreviewFetching}
        onDisplayAsChange={onDisplayAsChange}
        onRemove={onRemove}
      />
    </div>
  );
}

type ComposerAttachmentsPanelProps = Readonly<{
  attachments: File[];
  isUploading: boolean;
  uploadProgress: { current: number; total: number } | null;
  progress: number;
  onClearAll: () => void;
  onRemoveAt: (index: number) => void;
}>;

function ComposerAttachmentsPanel({
  attachments,
  isUploading,
  uploadProgress,
  progress,
  onClearAll,
  onRemoveAt,
}: ComposerAttachmentsPanelProps) {
  return (
    <div className={styles.attachmentList}>
      <div className={styles.attachmentListHeader}>
        <span>
          {attachments.length} file{attachments.length === 1 ? '' : 's'} selected
          {attachments.length >= env.maxAttachments ? ` (max ${env.maxAttachments})` : ''}
          {' · '}
          max {env.maxUploadMb} MB each
        </span>
        {isUploading ? null : (
          <button type="button" className={styles.clearAttachments} onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>
      {attachments.map((file, index) => {
        const Icon = attachmentIcon(file);
        return (
          <div key={`${file.name}-${file.size}-${index}`} className={styles.attachmentBar}>
            <div className={styles.attachmentInfo}>
              <Icon size={18} />
              <div className={styles.attachmentMeta}>
                <span className={styles.fileName} title={file.name}>
                  {truncateFilenameMiddle(file.name, 52)}
                </span>
                <span className={styles.fileSize}>{formatAttachmentSize(file.size)}</span>
              </div>
            </div>
            {isUploading && uploadProgress?.current === index + 1 ? (
              <div className={styles.progressWrapper}>
                <div className={styles.progressBar} style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <button
              type="button"
              className={styles.removeAttachment}
              onClick={() => onRemoveAt(index)}
              disabled={isUploading}
              aria-label={`Remove ${file.name}`}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
      {isUploading && uploadProgress ? (
        <p className={styles.uploadStatus}>
          Uploading file {uploadProgress.current} of {uploadProgress.total}…
        </p>
      ) : null}
    </div>
  );
}

export function MessageComposerView(model: Readonly<MessageComposerModel>) {
  const {
    activeId,
    isThread,
    keyboardInset,
    showPollModal,
    setShowPollModal,
    isCreatingPoll,
    handlePollSubmit,
    alert,
    setAlert,
    isMobile,
    showPlusMenu,
    showGifPicker,
    showEmojiPicker,
    closeComposerMenus,
    editingMessage,
    setEditingMessage,
    replyTarget,
    replyPreviewText,
    setReplyingTo,
    threadReplyTarget,
    threadReplyPreviewText,
    setThreadReplyingTo,
    voice,
    cancelRecording,
    composerPreview,
    linkDisplayAs,
    isLinkPreviewFetching,
    setLinkDisplayAs,
    setPreviewDismissed,
    attachments,
    isUploading,
    uploadProgress,
    progress,
    removeAttachmentAt,
    setAttachments,
    alsoSendCheckboxId,
    alsoSendToMain,
    setAlsoSendToMain,
    fileInputRef,
    handleFileChange,
    plusMenuRef,
    showPlusMenuToggle,
    editingMessageBlocksPlus,
    openFilePicker,
    openGifPicker,
    openPollModal,
    isThreadBlocksPoll,
    handleGifSelect,
    setShowGifPicker,
    inputRef,
    text,
    handleChange,
    handlePaste,
    handleKeyDown,
    voiceBusy,
    mentionOpen,
    mentionCandidates,
    mentionMenuRef,
    mentionIndex,
    setMentionIndex,
    applyMention,
    micBtnRef,
    handleMicPointerDown,
    handleMicPointerUp,
    handleMicPointerLeave,
    emojiPickerRef,
    closeMenusForEmoji,
    setShowEmojiPicker,
    handleEmojiClick,
    handleSend,
    isSending,
    isSavingEdit,
  } = model;

  return (
    <div
      className={`${styles.container} ${isThread ? styles.containerThread : ''}`}
      style={keyboardInset > 0 ? { paddingBottom: `calc(1rem + ${keyboardInset}px)` } : undefined}
    >
      <CreatePollModal
        open={showPollModal}
        onClose={() => setShowPollModal(false)}
        isSubmitting={isCreatingPoll}
        onSubmit={handlePollSubmit}
      />
      <AlertModal
        open={alert !== null}
        title={alert?.title ?? ''}
        description={alert?.description ?? ''}
        onClose={() => setAlert(null)}
      />
      {isMobile &&
        (showPlusMenu || showGifPicker || showEmojiPicker) &&
        createPortal(
          <button
            type="button"
            className={styles.composerMenuBackdrop}
            aria-label="Close menu"
            onClick={closeComposerMenus}
          />,
          document.body,
        )}
      <MessageComposerReplyBars
        editingMessage={editingMessage}
        setEditingMessage={setEditingMessage}
        isThread={isThread}
        replyTarget={replyTarget}
        replyPreviewText={replyPreviewText}
        setReplyingTo={setReplyingTo}
        threadReplyTarget={threadReplyTarget}
        threadReplyPreviewText={threadReplyPreviewText}
        setThreadReplyingTo={setThreadReplyingTo}
      />

      {voice.isRecording ? (
        <ComposerRecordingBar elapsedMs={voice.elapsedMs} onCancel={cancelRecording} />
      ) : null}

      {shouldShowComposerLinkPreview(composerPreview, editingMessage, attachments.length) &&
      composerPreview ? (
        <ComposerLinkPreviewSection
          preview={composerPreview}
          linkDisplayAs={linkDisplayAs}
          isLinkPreviewFetching={isLinkPreviewFetching}
          onDisplayAsChange={setLinkDisplayAs}
          onRemove={() => setPreviewDismissed(true)}
        />
      ) : null}

      {attachments.length > 0 ? (
        <ComposerAttachmentsPanel
          attachments={attachments}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          progress={progress}
          onClearAll={() => setAttachments([])}
          onRemoveAt={removeAttachmentAt}
        />
      ) : null}

      {isThread && (
        <label className={styles.alsoSendRow} htmlFor={alsoSendCheckboxId}>
          <input
            id={alsoSendCheckboxId}
            type="checkbox"
            checked={alsoSendToMain}
            onChange={(e) => setAlsoSendToMain(e.target.checked)}
          />
          <span>Also send to direct message</span>
        </label>
      )}

      <div className={styles.wrapper}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={allowedFileAcceptAttribute()}
          multiple
          style={{ display: 'none' }}
        />

        <div className={styles.plusMenuWrap} ref={plusMenuRef}>
          <button
            type="button"
            className={`${styles.actionBtn} ${showPlusMenu || showGifPicker ? styles.actionBtnActive : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={showPlusMenuToggle}
            disabled={editingMessageBlocksPlus}
            title="Add"
            aria-expanded={showPlusMenu || showGifPicker}
            aria-haspopup="menu"
          >
            <Plus size={20} />
          </button>

          {showPlusMenu && !showGifPicker && (
            <div className={styles.plusMenu} role="menu" tabIndex={-1}>
              <button
                type="button"
                role="menuitem"
                className={styles.plusMenuItem}
                disabled={attachments.length >= env.maxAttachments}
                onClick={openFilePicker}
              >
                <Paperclip size={18} />
                <span>Photos, videos &amp; files</span>
              </button>
              <button type="button" role="menuitem" className={styles.plusMenuItem} onClick={openGifPicker}>
                <Film size={18} />
                <span>GIF</span>
              </button>
              {!isThreadBlocksPoll && (
                <button type="button" role="menuitem" className={styles.plusMenuItem} onClick={openPollModal}>
                  <BarChart2 size={18} />
                  <span>Poll</span>
                </button>
              )}
            </div>
          )}

          {showGifPicker && (
            <GifPickerPanel
              onClose={() => setShowGifPicker(false)}
              onSelect={handlerArg(handleGifSelect)}
              disabled={isUploading}
            />
          )}
        </div>

        <input
          type="text"
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={formatComposerPlaceholder(
            editingMessage,
            voiceBusy,
            voice.isRecording,
            isThread,
          )}
          className={styles.input}
          disabled={voiceBusy}
        />
        {mentionOpen && mentionCandidates.length > 0 && (
          <div className={styles.mentionMenu} ref={mentionMenuRef}>
            {mentionCandidates.map((c, idx) => (
              <button
                key={c.key}
                type="button"
                className={`${styles.mentionItem} ${idx === mentionIndex ? styles.mentionItemActive : ''}`}
                onMouseEnter={() => setMentionIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(c.handle);
                }}
              >
                <span className={styles.mentionHandle}>@{c.handle}</span>
                <span className={styles.mentionLabel}>{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {!editingMessage && (
          <button
            ref={micBtnRef}
            type="button"
            className={`${styles.actionBtn} ${styles.micBtn} ${
              voice.isRecording ? styles.micBtnRecording : ''
            }`}
            disabled={!activeId || (voiceBusy && !voice.isRecording)}
            title="Hold to record voice message"
            aria-label="Hold to record voice message"
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerCancel={handleMicPointerLeave}
            onPointerLeave={handleMicPointerLeave}
          >
            <Mic size={20} />
          </button>
        )}

        <div className={styles.emojiContainer} ref={emojiPickerRef}>
          <button
            type="button"
            className={styles.actionBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              closeMenusForEmoji();
              setShowEmojiPicker((open) => !open);
            }}
            disabled={voiceBusy}
          >
            <Smile size={20} />
          </button>

          {showEmojiPicker && (
            <div className={styles.emojiPickerWrapper}>
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handler(handleSend)}
          disabled={isSendDisabled(
            editingMessage,
            text,
            attachments.length,
            isSending,
            isSavingEdit,
            voiceBusy,
          )}
          className={`${styles.sendBtn} ${
            isSendButtonActive(
              editingMessage,
              text,
              attachments.length,
              isSending,
              isSavingEdit,
              voiceBusy,
            )
              ? styles.active
              : ''
          }`}
        >
          {isSending || isSavingEdit || voiceBusy ? (
            <Loader2 className={styles.spinner} size={18} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
