import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, Ban, Flag } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import ReportUserModal from './ReportUserModal';
import {
  useBlockUser,
  useUnblockUser,
  getApiErrorMessage,
} from '../../settings/hooks/useUserSettings';
import { useBlockStatus } from '../hooks/useBlockStatus';
import styles from './DmHeaderMenu.module.css';

type DmHeaderMenuProps = {
  peerId: string;
  peerName: string;
  chatId: string;
};

const DmHeaderMenu: React.FC<DmHeaderMenuProps> = ({ peerId, peerName, chatId }) => {
  const [open, setOpen] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: blockStatus } = useBlockStatus(peerId);
  const { mutateAsync: blockUser, isPending: blocking } = useBlockUser();
  const { mutateAsync: unblockUser, isPending: unblocking } = useUnblockUser();

  const isBlocked = Boolean(blockStatus?.blockedByMe);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleBlockConfirm = async () => {
    try {
      await blockUser(peerId);
      setShowBlockConfirm(false);
      setOpen(false);
      toast.success(`${peerName} blocked`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "We couldn't block this person. Please try again."));
    }
  };

  const handleUnblock = async () => {
    try {
      await unblockUser(peerId);
      setOpen(false);
      toast.success(`${peerName} unblocked`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "We couldn't unblock this person. Please try again."));
    }
  };

  return (
    <>
      <div className={styles.wrapper} ref={menuRef}>
        <button
          type="button"
          className={styles.trigger}
          aria-label="Chat options"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreVertical size={20} />
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            {isBlocked ? (
              <button
                type="button"
                className={styles.item}
                role="menuitem"
                disabled={unblocking}
                onClick={() => void handleUnblock()}
              >
                <Ban size={16} />
                <span>Unblock user</span>
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.item} ${styles.danger}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShowBlockConfirm(true);
                }}
              >
                <Ban size={16} />
                <span>Block user</span>
              </button>
            )}
            <button
              type="button"
              className={styles.item}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setShowReport(true);
              }}
            >
              <Flag size={16} />
              <span>Report user</span>
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={showBlockConfirm}
        title={`Block ${peerName}?`}
        description="They won't be able to message you."
        confirmLabel="Block"
        variant="danger"
        isLoading={blocking}
        onConfirm={() => void handleBlockConfirm()}
        onCancel={() => {
          if (!blocking) setShowBlockConfirm(false);
        }}
      />

      {showReport && (
        <ReportUserModal
          targetUserId={peerId}
          chatId={chatId}
          peerName={peerName}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
};

export default DmHeaderMenu;
