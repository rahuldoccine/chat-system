import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/axios';

export type ReportStatus = 'OPEN' | 'REVIEWED' | 'DISMISSED' | 'ACTIONED';

/** Default page size for admin report listing (matches backend default). */
export const REPORTS_PAGE_SIZE = 5;

export type AdminReportUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type AdminReport = {
  id: string;
  status: ReportStatus;
  reason: string;
  details: string | null;
  createdAt: string;
  reviewedAt: string | null;
  chatId: string | null;
  targetMessageId: string | null;
  reporter: AdminReportUser;
  targetUser: AdminReportUser | null;
};

export type AdminReportsFilter = 'all' | ReportStatus;

export type AdminReportsPage = {
  data: AdminReport[];
  nextCursor: string | null;
};

export const adminReportsQueryKey = (
  filter: AdminReportsFilter,
  cursor?: string,
) => ['adminReports', filter, cursor ?? 'first', REPORTS_PAGE_SIZE] as const;

export function useAdminReports(filter: AdminReportsFilter, cursor?: string) {
  return useQuery({
    queryKey: adminReportsQueryKey(filter, cursor),
    queryFn: async (): Promise<AdminReportsPage> => {
      const params: Record<string, string> = {
        limit: String(REPORTS_PAGE_SIZE),
      };
      if (filter !== 'all') {
        params.status = filter;
      }
      if (cursor) {
        params.cursor = cursor;
      }
      const res = await api.get<AdminReportsPage>('/moderation/admin/reports', {
        params,
      });
      return res.data;
    },
  });
}

export function useUpdateReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reportId,
      status,
    }: {
      reportId: string;
      status: ReportStatus;
    }) => {
      const res = await api.patch<{ data: AdminReport }>(
        `/moderation/admin/reports/${reportId}`,
        { status },
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminReports'] });
    },
  });
}
