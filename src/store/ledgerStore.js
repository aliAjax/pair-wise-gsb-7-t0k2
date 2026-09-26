// 保存层：唯一接触 localStorage 的地方；读入时先做过期清扫，保证重开后名额已释放。
import { VOUCHER_STATUS as VS, makeSlot, makeVoucher, slotLabel } from '../domain/model.js';
import { sweepExpired, todayStr } from '../domain/rules.js';

const KEY = 'exhibit-ledger-v1';

function seed() {
  const today = todayStr();
  const tomorrow = todayStr(new Date(Date.now() + 86400000));
  const s1 = makeSlot({ id: 's-1', exhibitId: 1, hall: 'A01 · 主展厅', date: today, start: '10:00', end: '11:30', capacity: 6 });
  const s2 = makeSlot({ id: 's-2', exhibitId: 1, hall: 'A01 · 主展厅', date: today, start: '14:00', end: '15:30', capacity: 4 });
  const s3 = makeSlot({ id: 's-3', exhibitId: 3, hall: 'C01 · 新媒介', date: tomorrow, start: '10:00', end: '11:30', capacity: 8 });
  const v1 = makeVoucher({
    id: 'vc-1', code: 'V-0001', exhibitId: 1, exhibitTitle: '潮汐之后',
    slotId: s1.id, hall: s1.hall, date: s1.date, slotLabel: slotLabel(s1),
    partySize: 4, status: VS.BOOKED, createdAt: new Date().toISOString(),
  });
  // 容量 6 已占 4，再登记 3 人 → 停在待安排并列出缺额 1
  const v2 = makeVoucher({
    id: 'vc-2', code: 'V-0002', exhibitId: 1, exhibitTitle: '潮汐之后',
    slotId: s1.id, hall: s1.hall, date: s1.date, slotLabel: slotLabel(s1),
    partySize: 3, status: VS.PENDING, shortfall: 1, createdAt: new Date().toISOString(),
  });
  return { seq: 3, slots: [s1, s2, s3], vouchers: [v1, v2], verifications: [] };
}

export function loadLedger() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state && Array.isArray(state.slots) && Array.isArray(state.vouchers)) {
        return sweepExpired(state); // 重开即释放过期名额
      }
    }
  } catch {
    // 数据损坏则回退到初始台账
  }
  return seed();
}

export function saveLedger(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
