export const AsyncQueueName = {
  Notifications: 'notifications',
  MalwareScans: 'malware-scans',
  ChainReconciliation: 'chain-reconciliation',
  Aggregation: 'aggregation',
  RetryableDelivery: 'retryable-delivery',
  DeadLetter: 'dead-letter',
} as const;

export type AsyncQueueName =
  (typeof AsyncQueueName)[keyof typeof AsyncQueueName];

export const ASYNC_WORK_QUEUE_NAMES = [
  AsyncQueueName.Notifications,
  AsyncQueueName.MalwareScans,
  AsyncQueueName.ChainReconciliation,
  AsyncQueueName.Aggregation,
  AsyncQueueName.RetryableDelivery,
] as const;
