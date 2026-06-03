export type MessageReceiptStatus = "sent" | "delivered" | "read";

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
