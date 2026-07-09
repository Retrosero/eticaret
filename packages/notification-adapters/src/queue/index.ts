/** @eticart/notification-adapters/queue */
export {
  InMemoryQueue,
  createEmailQueueHandler,
  DEFAULT_ADAPTER_BY_EVENT,
  DEFAULT_TEMPLATE_BY_EVENT,
  type EmailQueue,
  type EmailQueueJob,
  type EmailQueueHandler,
  type EmailQueueHandlerOptions,
} from './email-queue.js';