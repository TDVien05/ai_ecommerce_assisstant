import { query } from '../../config/database.js'

// The caller owns the transaction; all report figures share one database snapshot.
export async function beginReportSnapshot(client) {
  if(!client)throw new Error('A transaction is required')
  await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',[],client)
}
