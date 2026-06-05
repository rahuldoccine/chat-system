import React, { useMemo, useState } from 'react';
import { handler } from '../../../utils/asyncHandler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import api from '../../../api/axios';
import type { PollDetail, PollVoter } from '../types';
import { getApiErrorMessage } from '../../settings/hooks/useUserSettings';
import { toast } from 'sonner';
import UserAvatar from './UserAvatar';
import PollVotesModal from './PollVotesModal';
import styles from './PollMessage.module.css';

type PollMessageProps = Readonly<{
  pollId: string;
  isMe: boolean;
}>;

const AVATAR_PREVIEW_LIMIT = 2;

function VoterAvatarStack({ voters }: Readonly<{ voters: PollVoter[] }>) {
  const preview = voters.slice(0, AVATAR_PREVIEW_LIMIT);
  if (preview.length === 0) return null;

  return (
    <span className={styles.avatarStack} aria-hidden>
      {preview.map((voter, index) => (
        <UserAvatar
          key={voter.id}
          userId={voter.id}
          avatarUrl={voter.avatarUrl}
          displayName={voter.displayName}
          email={voter.email}
          className={styles.voterAvatar}
          style={{ zIndex: preview.length - index }}
          fallbackFontSize="0.55rem"
        />
      ))}
    </span>
  );
}

const PollMessage: React.FC<PollMessageProps> = ({ pollId, isMe }) => {
  const queryClient = useQueryClient();
  const [showVotesModal, setShowVotesModal] = useState(false);
  const [modalPollSnapshot, setModalPollSnapshot] = useState<PollDetail | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['poll', pollId],
    queryFn: async () => {
      const res = await api.get<{ poll: PollDetail }>(`/polls/${pollId}`);
      return res.data.poll;
    },
    staleTime: 15_000,
  });

  const closed = useMemo(() => {
    if (!data?.closesAt) return false;
    return new Date(data.closesAt) < new Date();
  }, [data?.closesAt]);

  const totalVotes = useMemo(() => {
    if (!data) return 0;
    return data.totalVotes ?? data.options.reduce((sum, opt) => sum + opt.votes, 0);
  }, [data]);

  const hasVoted = Boolean(data?.myVoteOptionId);
  const showResults = hasVoted || closed || totalVotes > 0;

  const openVotesModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!data) return;
    setModalPollSnapshot(data);
    setShowVotesModal(true);
  };

  const closeVotesModal = () => {
    setShowVotesModal(false);
    setModalPollSnapshot(null);
  };

  const voteMutation = useMutation({
    mutationFn: async (pollOptionId: string) => {
      const res = await api.post<{
        pollId: string;
        selectedOptionId: string;
        updatedAt: string;
        poll: PollDetail;
      }>(`/polls/${pollId}/vote`, { pollOptionId });
      return res.data;
    },
    onSuccess: (out) => {
      queryClient.setQueryData(['poll', pollId], out.poll);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Your vote couldn't be saved. Please try again."));
    },
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 className={styles.spinner} size={18} />
        <span>Loading poll…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.error}>
        <span>This poll couldn't be loaded.</span>
        <button type="button" className={styles.retry} onClick={handler(() => { void refetch(); })}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.wrap} ${isMe ? styles.wrapMe : ''}`}>
        <p className={styles.question}>{data.question}</p>

        {data.closesAt && (
          <p className={styles.closesHint}>
            {closed ? 'Poll closed' : `Closes ${new Date(data.closesAt).toLocaleString()}`}
          </p>
        )}

        <ul className={styles.options}>
          {data.options.map((opt) => {
            const selected = data.myVoteOptionId === opt.id;
            const busy = voteMutation.isPending;
            const pct = totalVotes > 0 ? (opt.votes / totalVotes) * 100 : 0;

            return (
              <li key={opt.id} className={styles.optionItem}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${selected ? styles.optionRowSelected : ''}`}
                  disabled={closed || busy}
                  onClick={() => voteMutation.mutate(opt.id)}
                >
                  <span
                    className={`${styles.radio} ${selected ? styles.radioSelected : ''}`}
                    aria-hidden
                  >
                    {selected && <Check size={12} strokeWidth={3} />}
                  </span>

                  <span className={styles.optionContent}>
                    <span className={styles.optionTop}>
                      <span className={styles.optionLabel}>{opt.label}</span>
                      {showResults && (
                        <span className={styles.optionMeta}>
                          <VoterAvatarStack voters={opt.voters ?? []} />
                          <span className={styles.voteCount}>{opt.votes}</span>
                        </span>
                      )}
                    </span>

                    {showResults && (
                      <span className={styles.progressTrack} aria-hidden>
                        <span
                          className={`${styles.progressFill} ${selected ? styles.progressFillSelected : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {showResults && totalVotes > 0 && (
          <>
            <div className={styles.footerDivider} />
            <button type="button" className={styles.viewVotesBtn} onClick={openVotesModal}>
              View votes
            </button>
          </>
        )}
      </div>

      <PollVotesModal
        open={showVotesModal}
        poll={modalPollSnapshot}
        onClose={closeVotesModal}
      />
    </>
  );
};

export default PollMessage;
