import { z } from 'zod'
import { HttpError } from '../../../lib/httpError.js'
import { getShopSettings, updateShopSettings } from '../../shop.service.js'
// Q20: chỉ lưu và hoàn tác tên; dữ liệu ngân hàng chưa được hỗ trợ.
export const updateShop = {
  name:'update_shop_settings', tier:'sensitive', description:'Đề xuất đổi tên cửa hàng; cần duyệt. Chưa hỗ trợ thay đổi thông tin ngân hàng.',
  schema:z.object({ name:z.string().trim().min(1).max(120) }).strict(),
  async propose(input,ctx) { const shop = await getShopSettings(ctx.shopId); return { tool:this.name,input,expected:{ name:shop.name } } },
  async apply(client,input,ctx,expected) {
    const current = await getShopSettings(ctx.shopId,{client}); if (current.name !== expected.name) throw new HttpError(409,'STEP_CONFLICT','Tên cửa hàng đã thay đổi.')
    const result = await updateShopSettings(ctx.shopId,input,{client}); if (result.before.name !== expected.name) throw new HttpError(409,'STEP_CONFLICT','Tên cửa hàng đã thay đổi.')
    return { before:{name:result.before.name},after:{name:result.after.name} }
  },
  async revert(client,log,ctx) { const result = await updateShopSettings(ctx.shopId,{name:log.before.name},{client}); if (result.before.name !== log.after.name) throw new HttpError(409,'STEP_CONFLICT','Tên cửa hàng đã thay đổi.') },
}
