// 档案层：只定义数据长什么样，不做判断、不碰保存。

export const VOUCHER_STATUS = {
  PENDING: '待安排',     // 容量不足，未占名额，记录了缺额
  BOOKED: '已预约',      // 占名额
  VERIFIED: '已核销',    // 已入场，仍占名额（人在厅内）
  CANCELLED: '已取消',   // 名额立即释放
  EXPIRED: '已过期',     // 名额立即释放
};

// 只有这两种状态占用时段名额，其余状态一律不占
export const OCCUPYING_STATUSES = [VOUCHER_STATUS.BOOKED, VOUCHER_STATUS.VERIFIED];

export const EXHIBIT_PUBLISHED = '已发布';

export function makeSlot({ id, exhibitId, hall, date, start, end, capacity }) {
  return { id, exhibitId, hall, date, start, end, capacity: Number(capacity) };
}

export function makeVoucher({ id, code, exhibitId, exhibitTitle, slotId, hall, date, slotLabel, partySize, status, shortfall = 0, createdAt }) {
  // 展厅/时段/人数冗余在凭证上：改期、核销、重开查询都以凭证自身档案为准
  return { id, code, exhibitId, exhibitTitle, slotId, hall, date, slotLabel, partySize: Number(partySize), status, shortfall, createdAt };
}

export function makeVerification({ id, voucherCode, voucherId = null, hall = '', partySize = 0, ok, reason, verifiedAt }) {
  return { id, voucherCode, voucherId, hall, partySize, ok, reason, verifiedAt };
}

export function slotLabel(slot) {
  return `${slot.date} ${slot.start}–${slot.end}`;
}

export function nextVoucherCode(seq) {
  return `V-${String(seq).padStart(4, '0')}`;
}
