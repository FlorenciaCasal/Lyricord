export type OcrQuotaReservation = {
  allowed: boolean;
  alreadyReserved: boolean;
  usedTotal: number;
  totalLimit: number | null;
  remainingTotal: number | null;
};

export type OcrQuotaTransaction = {
  hasOperation(operationKey: string): Promise<boolean>;
  countUsage(): Promise<number>;
  recordOperation(operationKey: string): Promise<void>;
};

export async function reserveOcrQuota(input: {
  totalLimit: number | null;
  operationKey: string;
  transaction: <T>(task: (store: OcrQuotaTransaction) => Promise<T>) => Promise<T>;
}): Promise<OcrQuotaReservation> {
  if (input.totalLimit === null) {
    return {
      allowed: true,
      alreadyReserved: false,
      usedTotal: 0,
      totalLimit: null,
      remainingTotal: null,
    };
  }

  return input.transaction(async (store) => {
    const [alreadyReserved, usedTotal] = await Promise.all([
      store.hasOperation(input.operationKey),
      store.countUsage(),
    ]);
    if (alreadyReserved) {
      return {
        allowed: true,
        alreadyReserved: true,
        usedTotal,
        totalLimit: input.totalLimit,
        remainingTotal: Math.max(0, input.totalLimit! - usedTotal),
      };
    }
    if (usedTotal >= input.totalLimit!) {
      return {
        allowed: false,
        alreadyReserved: false,
        usedTotal,
        totalLimit: input.totalLimit,
        remainingTotal: 0,
      };
    }

    await store.recordOperation(input.operationKey);
    return {
      allowed: true,
      alreadyReserved: false,
      usedTotal: usedTotal + 1,
      totalLimit: input.totalLimit,
      remainingTotal: Math.max(0, input.totalLimit! - usedTotal - 1),
    };
  });
}
