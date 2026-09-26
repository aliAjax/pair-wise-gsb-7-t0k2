// 判断层：全部是纯函数，只根据传入的台账做判断并返回新台账，不碰保存、不碰界面。
import {
  VOUCHER_STATUS as VS,
  OCCUPYING_STATUSES,
  EXHIBIT_PUBLISHED,
  makeSlot,
  makeVoucher,
  makeVerification,
  slotLabel,
  nextVoucherCode,
} from './model.js';

export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 某时段已被占用的名额
export function occupiedOf(vouchers, slotId) {
  return vouchers
    .filter(v => v.slotId === slotId && OCCUPYING_STATUSES.includes(v.status))
    .reduce((sum, v) => sum + v.partySize, 0);
}

export function remainingOf(slots, vouchers, slotId) {
  const slot = slots.find(s => s.id === slotId);
  return slot ? slot.capacity - occupiedOf(vouchers, slotId) : 0;
}

// 已发布展项才能开放时段
export function openSlot(state, exhibit, draft) {
  if (!exhibit) return { ok: false, reason: '请选择展项' };
  if (exhibit.status !== EXHIBIT_PUBLISHED) {
    return { ok: false, reason: `「${exhibit.title}」尚未发布，不能开放时段` };
  }
  const slot = makeSlot(draft);
  return { ok: true, slot, state: { ...state, slots: [...state.slots, slot] } };
}

// 登记凭证：容量够则已预约；不够则停在待安排并记录缺额，不占名额
export function bookVoucher(state, exhibit, slotId, partySize, now = new Date()) {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot) return { ok: false, reason: '时段不存在' };
  if (!exhibit || exhibit.status !== EXHIBIT_PUBLISHED) return { ok: false, reason: '展项未发布，不能登记' };
  const size = Number(partySize);
  if (!Number.isFinite(size) || size < 1) return { ok: false, reason: '人数至少为 1' };
  const remaining = remainingOf(state.slots, state.vouchers, slotId);
  const fits = remaining >= size;
  const voucher = makeVoucher({
    id: `vc-${state.seq}`,
    code: nextVoucherCode(state.seq),
    exhibitId: exhibit.id,
    exhibitTitle: exhibit.title,
    slotId,
    hall: slot.hall,
    date: slot.date,
    slotLabel: slotLabel(slot),
    partySize: size,
    status: fits ? VS.BOOKED : VS.PENDING,
    shortfall: fits ? 0 : size - remaining,
    createdAt: now.toISOString(),
  });
  return { ok: true, voucher, state: { ...state, seq: state.seq + 1, vouchers: [...state.vouchers, voucher] } };
}

// 改期：先把凭证从原时段摘下（归还旧名额），再在释放后的台账上判断新时段容量；
// 新时段容量不足则停在待安排并列出缺额，旧名额不恢复占用
export function rescheduleVoucher(state, voucherId, newSlotId) {
  const voucher = state.vouchers.find(v => v.id === voucherId);
  const slot = state.slots.find(s => s.id === newSlotId);
  if (!voucher) return { ok: false, reason: '凭证不存在' };
  if (!slot) return { ok: false, reason: '请选择新时段' };
  if (![VS.BOOKED, VS.PENDING].includes(voucher.status)) {
    return { ok: false, reason: `凭证已${voucher.status}，不能改期` };
  }
  // 第一步：归还旧名额
  const released = state.vouchers.map(v =>
    v.id === voucherId ? { ...v, slotId: null, status: VS.PENDING, shortfall: 0 } : v
  );
  // 第二步：在释放后的台账上判断新时段
  const remaining = remainingOf(state.slots, released, newSlotId);
  const fits = remaining >= voucher.partySize;
  const shortfall = fits ? 0 : voucher.partySize - remaining;
  const vouchers = released.map(v =>
    v.id === voucherId
      ? { ...v, slotId: newSlotId, hall: slot.hall, date: slot.date, slotLabel: slotLabel(slot), status: fits ? VS.BOOKED : VS.PENDING, shortfall }
      : v
  );
  return { ok: true, fits, shortfall, state: { ...state, vouchers } };
}

// 取消：名额立即释放（占用只统计 已预约/已核销，状态一变即释放）
export function cancelVoucher(state, voucherId) {
  return {
    ...state,
    vouchers: state.vouchers.map(v =>
      v.id === voucherId && [VS.BOOKED, VS.PENDING].includes(v.status)
        ? { ...v, status: VS.CANCELLED, shortfall: 0 }
        : v
    ),
  };
}

// 过期清扫：参观日已过的预约/待安排凭证转为已过期，名额立即释放
export function sweepExpired(state, today = todayStr()) {
  return {
    ...state,
    vouchers: state.vouchers.map(v =>
      [VS.BOOKED, VS.PENDING].includes(v.status) && v.date < today
        ? { ...v, status: VS.EXPIRED, shortfall: 0 }
        : v
    ),
  };
}

// 入场核销：只认当天有效（已预约）凭证；无论成败都留档
export function verifyVoucher(state, code, today = todayStr(), now = new Date()) {
  const voucher = findVoucherByCode(state, code);
  let ok = false;
  let reason = '';
  if (!voucher) reason = '凭证不存在';
  else if (voucher.status !== VS.BOOKED) reason = `凭证状态为「${voucher.status}」，不可核销`;
  else if (voucher.date !== today) reason = `非当天凭证（参观日 ${voucher.date}）`;
  else { ok = true; reason = '核销成功'; }
  const record = makeVerification({
    id: `ck-${state.verifications.length + 1}`,
    voucherCode: voucher ? voucher.code : String(code).trim().toUpperCase(),
    voucherId: voucher ? voucher.id : null,
    hall: voucher ? voucher.hall : '',
    partySize: voucher ? voucher.partySize : 0,
    ok,
    reason,
    verifiedAt: now.toISOString(),
  });
  const vouchers = ok
    ? state.vouchers.map(v => (v.id === voucher.id ? { ...v, status: VS.VERIFIED } : v))
    : state.vouchers;
  return { ok, reason, record, state: { ...state, vouchers, verifications: [record, ...state.verifications] } };
}

// 按凭证号查询：重开后凭此查出展厅和人数
export function findVoucherByCode(state, code) {
  const c = String(code).trim().toLowerCase();
  if (!c) return null;
  return state.vouchers.find(v => v.code.toLowerCase() === c) || null;
}
