export type MessageReceiptStatus = "sent" | "delivered" | "read";

const STATUS_RANK: Record<MessageReceiptStatus, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

export function deriveMessageReceiptStatus(counts: {
  deliveryTotal: number;
  delivered: number;
  readableTotal: number;
  read: number;
}): MessageReceiptStatus {
  if (counts.deliveryTotal === 0 || counts.delivered < counts.deliveryTotal) {
    return "sent";
  }
  if (counts.readableTotal > 0 && counts.read >= counts.readableTotal) {
    return "read";
  }
  return "delivered";
}

export function maxReceiptStatus(
  a: MessageReceiptStatus | undefined,
  b: MessageReceiptStatus,
): MessageReceiptStatus {
  if (!a) return b;
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}
