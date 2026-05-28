import React from 'react';
import { Phone, Video, X, Users } from 'lucide-react';
import styles from './GroupCallIncomingPrompt.module.css';

type GroupCallIncomingPromptProps = {
  kind: 'AUDIO' | 'VIDEO';
  participants: string[];
  onJoinVoice: () => void;
  onJoinVideo: () => void;
  onDismiss: () => void;
};

const GroupCallIncomingPrompt: React.FC<GroupCallIncomingPromptProps> = ({
  kind,
  participants,
  onJoinVoice,
  onJoinVideo,
  onDismiss,
}) => {
  const participantCount = Math.max(participants.length, 1);
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Users size={28} />
          <div>
            <h3>Incoming group {kind === 'VIDEO' ? 'video' : 'voice'} call</h3>
            <p>
              {participantCount} participant{participantCount > 1 ? 's' : ''} currently in call
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          {kind === 'VIDEO' ? (
            <button type="button" className={styles.joinVideoBtn} onClick={onJoinVideo}>
              <Video size={16} />
              Join video call
            </button>
          ) : (
            <button type="button" className={styles.joinVoiceBtn} onClick={onJoinVoice}>
              <Phone size={16} />
              Join audio call
            </button>
          )}
          <button type="button" className={styles.dismissBtn} onClick={onDismiss}>
            <X size={16} />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupCallIncomingPrompt;
