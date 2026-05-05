// Payment intent state machine.
//
// Allowed transitions:
//   created    -> processing | failed
//   processing -> completed  | failed | disputed
//   completed  -> refunded   | disputed
//   failed     -> (terminal)
//   refunded   -> (terminal — partial refunds use transactions, not status)
//   disputed   -> completed | refunded

import type { PaymentIntentStatus } from "@ryse/shared/types";
import { ConflictError } from "../../utils/errors.js";

const transitions: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  created:    ["processing", "failed"],
  processing: ["completed", "failed", "disputed"],
  completed:  ["refunded", "disputed"],
  failed:     [],
  refunded:   [],
  disputed:   ["completed", "refunded"],
};

export function assertTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new ConflictError(`Invalid status transition: ${from} -> ${to}`);
  }
}

export function canTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): boolean {
  return from === to || transitions[from].includes(to);
}
