// Every TypeORM entity schema, grouped by feature folder. Register new models here.
import { AgentRun } from './agent/AgentRun.js'
import { AgentRunEvent } from './agent/AgentRunEvent.js'
import { Change } from './agent/Change.js'
import { AiUsage } from './ai/AiUsage.js'
import { AssistantAlert } from './alerts/AssistantAlert.js'
import { AssistantThread } from './assistant/AssistantThread.js'
import { AssistantMessage } from './assistant/AssistantMessage.js'
import { AssistantProactiveState } from './assistant/AssistantProactiveState.js'
import { AssistantStep } from './assistant/AssistantStep.js'
import { AssistantActionLog } from './assistant/AssistantActionLog.js'
import { AssistantFile } from './assistant/AssistantFile.js'
import { User } from './auth/User.js'
import { LedgerEntry } from './finance/LedgerEntry.js'
import { Label } from './finance/Label.js'
import { Customer } from './messenger/Customer.js'
import { Conversation } from './messenger/Conversation.js'
import { Message } from './messenger/Message.js'
import { Order } from './orders/Order.js'
import { OrderItem } from './orders/OrderItem.js'
import { PaymentTransaction } from './payments/PaymentTransaction.js'
import { FraudCheck } from './payments/FraudCheck.js'
import { Blocklist } from './payments/Blocklist.js'
import { Product } from './products/Product.js'
import { Shop } from './shop/Shop.js'
import { Pin } from './shop/Pin.js'
import { Todo } from './shop/Todo.js'
import { WebhookEvent } from './webhook/WebhookEvent.js'

export {
  AgentRun,
  AgentRunEvent,
  AiUsage,
  AssistantActionLog,
  AssistantAlert,
  AssistantFile,
  AssistantMessage,
  AssistantProactiveState,
  AssistantStep,
  AssistantThread,
  Blocklist,
  Change,
  Conversation,
  Customer,
  FraudCheck,
  Label,
  LedgerEntry,
  Message,
  Order,
  OrderItem,
  PaymentTransaction,
  Pin,
  Product,
  Shop,
  Todo,
  User,
  WebhookEvent,
}

export const entities = [
  AgentRun,
  AgentRunEvent,
  AiUsage,
  AssistantActionLog,
  AssistantAlert,
  AssistantFile,
  AssistantMessage,
  AssistantProactiveState,
  AssistantStep,
  AssistantThread,
  Blocklist,
  Change,
  Conversation,
  Customer,
  FraudCheck,
  Label,
  LedgerEntry,
  Message,
  Order,
  OrderItem,
  PaymentTransaction,
  Pin,
  Product,
  Shop,
  Todo,
  User,
  WebhookEvent,
]
