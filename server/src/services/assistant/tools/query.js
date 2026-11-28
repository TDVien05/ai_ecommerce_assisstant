import { queryData, querySchema } from '../query-data.service.js'
export const queryTool = {
  name: 'query_data', tier: 'read',
  description: 'Đọc dữ liệu theo cửa hàng, không viết SQL. Trường: ledger(id,type,kind,channel,category,amount,note,occurredAt); orders(id,code,status,total,shippingName,phone,address,createdAt); order_items(id,orderId,name,quantity,unitPrice,unitCost,orderedAt); products(id,name,sku,price,cost,stock,active,createdAt); customers(id,name,phone,address,createdAt); payments(id,gateway,type,amount,status,occurredAt,description), chỉ dòng có shop_id; files(id,name,mime,size,createdAt); imports(id,title,status,createdAt,updatedAt); alerts(id,title,level,status,detectedAt), status OPEN=đang mở, HELD=đã giữ, DISMISSED=đã bỏ qua; conversations(id,customerId,aiPaused,createdAt); messages(id,conversationId,role,content,createdAt); todos(id,title,detail,status,dueAt,createdAt). Chọn fields, filters, groupBy, metrics, sort, limit.',
  schema: querySchema,
  run: queryData,
}
