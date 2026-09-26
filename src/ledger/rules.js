// 判断层：纯函数，不碰 localStorage，也不依赖 React。
// 凭证状态机：已预约 →（核销）→ 已核销
//                  ├→（取消）→ 已取消（名额立即释放）
//                  ├→（日期过去）→ 已过期（名额立即释放）
//                  └→（改期容量不足）→ 待安排（旧名额已归还，记录缺额）

export const STATUS = {
  BOOKED: '已预约',
  PENDING: '待安排',
  CHECKED: '已核销',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
};

const ACTIVE = new Set([STATUS.BOOKED, STATUS.CHECKED]);

export function dateStr(offset = 0, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const todayStr = () => dateStr(0);

export function isPublished(exhibit) {
  return !!exhibit && exhibit.status === '已发布';
}

// 某时段的占用：已预约 + 已核销都在厅内占名额；取消/过期不占。
export function sessionUsage(sessionId, sessions, vouchers, ignoreVoucherId = null) {
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  let booked = 0;
  let checked = 0;
  for (const v of vouchers) {
    if (v.sessionId !== sessionId || v.id === ignoreVoucherId) continue;
    if (v.status === STATUS.BOOKED) booked += v.people;
    else if (v.status === STATUS.CHECKED) checked += v.people;
  }
  const used = booked + checked;
  return {
    capacity: s.capacity,
    used,
    booked,
    checked,
    remaining: Math.max(0, s.capacity - used),
  };
}

// 指向该时段的待安排凭证（缺额清单）
export function pendingFor(sessionId, vouchers) {
  return vouchers.filter(
    (v) => v.status === STATUS.PENDING && v.request?.sessionId === sessionId
  );
}

function nextCode(vouchers, date) {
  const base = 'V' + date.replaceAll('-', '');
  let n = vouchers.filter((v) => v.code.startsWith(base)).length + 1;
  let code;
  do {
    code = `${base}-${String(n).padStart(3, '0')}`;
    n += 1;
  } while (vouchers.some((v) => v.code === code));
  return code;
}

const note = (text) => ({ at: new Date().toISOString(), text });

function findTarget(sessionId, sessions, exhibits) {
  const session = sessions.find((x) => x.id === sessionId);
  if (!session) return { error: '时段不存在或已下线' };
  const exhibit = exhibits.find((x) => x.id === session.exhibitId);
  if (!isPublished(exhibit)) return { error: '该展项未发布，不能开放或安排名额' };
  return { session, exhibit };
}

// 凭证登记：容量够就已预约；不够就停在待安排并记录缺额（不占任何名额）。
export function registerVoucher({ exhibits, sessions, vouchers }, input, now = new Date())
{
  const people = Math.floor(Number(input.people));
  if (!Number.isFinite(people) || people < 1)
    return { vouchers, result: { ok: false, reason: '人数需为不小于 1 的整数' } };

  const target = findTarget(input.sessionId, sessions, exhibits);
  if (target.error) return { vouchers, result: { ok: false, reason: target.error } };
  const { session, exhibit } = target;
  if (session.date < dateStr(0, now))
    return { vouchers, result: { ok: false, reason: '该时段已经结束，不能登记' } };

  const usage = sessionUsage(session.id, sessions, vouchers);
  const stamp = now.toISOString();
  const base = {
    id: 'v-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    code: input.code || nextCode(vouchers, session.date),
    people,
    exhibitId: exhibit.id,
    title: exhibit.title,
    room: exhibit.room,
    date: session.date,
    period: session.period,
    createdAt: stamp,
    updatedAt: stamp,
  };

  if (usage.remaining >= people) {
    const voucher = {
      ...base,
      sessionId: session.id,
      status: STATUS.BOOKED,
      request: null,
      history: [note(`登记成功：${exhibit.room} ${session.date} ${session.period}，${people} 人`)],
    };
    return {
      vouchers: [...vouchers, voucher],
      result: { ok: true, voucher, text: `已预约，凭证号 ${voucher.code}` },
    };
  }

  const shortage = people - usage.remaining;
  const voucher = {
    ...base,
    sessionId: null,
    status: STATUS.PENDING,
    request: { sessionId: session.id, date: session.date, period: session.period, shortage },
    history: [
      note(
        `容量不足：${exhibit.room} ${session.date} ${session.period} 余 ${usage.remaining} 人，缺 ${shortage} 人，停在待安排`
      ),
    ],
  };
  return {
    vouchers: [...vouchers, voucher],
    result: {
      ok: true,
      voucher,
      shortage,
      text: `容量不足，缺额 ${shortage} 人，凭证 ${voucher.code} 停在待安排`,
    },
  };
}

// 安排进目标时段（改期 / 待安排重试共用）。调用前旧名额已归还。
function arrangeInto(voucher, targetSession, targetExhibit, sessions, vouchers, now, releasedText) {
  const usage = sessionUsage(targetSession.id, sessions, vouchers, voucher.id);
  const stamp = now.toISOString();
  const history = [...voucher.history];
  if (releasedText) history.push(note(releasedText));

  if (usage.remaining >= voucher.people) {
    return {
      ...voucher,
      sessionId: targetSession.id,
      exhibitId: targetExhibit.id,
      title: targetExhibit.title,
      room: targetExhibit.room,
      date: targetSession.date,
      period: targetSession.period,
      status: STATUS.BOOKED,
      request: null,
      updatedAt: stamp,
      history: [
        ...history,
        note(`安排成功：${targetExhibit.room} ${targetSession.date} ${targetSession.period}，${voucher.people} 人`),
      ],
    };
  }

  const shortage = voucher.people - usage.remaining;
  return {
    ...voucher,
    sessionId: null,
    exhibitId: targetExhibit.id,
    title: targetExhibit.title,
    room: targetExhibit.room,
    date: targetSession.date,
    period: targetSession.period,
    status: STATUS.PENDING,
    request: {
      sessionId: targetSession.id,
      date: targetSession.date,
      period: targetSession.period,
      shortage,
    },
    updatedAt: stamp,
    history: [
      ...history,
      note(
        `新时段容量不足：${targetExhibit.room} ${targetSession.date} ${targetSession.period} 余 ${usage.remaining} 人，缺 ${shortage} 人，停在待安排`
      ),
    ],
  };
}

// 改期：先归还旧名额，再试新时段；不足则停在待安排并列出缺额。
export function rescheduleVoucher({ exhibits, sessions, vouchers }, id, targetSessionId, now = new Date())
{
  const voucher = vouchers.find((v) => v.id === id);
  if (!voucher) return { vouchers, result: { ok: false, reason: '查无此凭证' } };
  if (voucher.status !== STATUS.BOOKED)
    return { vouchers, result: { ok: false, reason: '只有已预约凭证可以改期' } };

  const old = sessions.find((x) => x.id === voucher.sessionId);
  if (targetSessionId === voucher.sessionId)
    return { vouchers, result: { ok: false, reason: '新时段与原时段相同' } };

  const target = findTarget(targetSessionId, sessions, exhibits);
  if (target.error) return { vouchers, result: { ok: false, reason: target.error } };
  if (target.session.date < dateStr(0, now))
    return { vouchers, result: { ok: false, reason: '目标时段已经结束' } };

  // 第一步：归还旧名额（sessionId 置空、暂挂待安排），名额此刻立即释放。
  const released = {
    ...voucher,
    sessionId: null,
    status: STATUS.PENDING,
    updatedAt: now.toISOString(),
  };
  const releasedText = old
    ? `改期：归还原名额 ${voucher.room} ${old.date} ${old.period}，${voucher.people} 人已释放`
    : null;
  const interim = vouchers.map((v) => (v.id === id ? released : v));
  const arranged = arrangeInto(
    released, target.session, target.exhibit, sessions, interim, now, releasedText
  );
  const ok = arranged.status === STATUS.BOOKED;
  return {
    vouchers: interim.map((v) => (v.id === id ? arranged : v)),
    result: ok
      ? { ok: true, voucher: arranged, text: `旧名额已归还，已改期至 ${arranged.room} ${arranged.period}` }
      : {
          ok: true,
          voucher: arranged,
          shortage: arranged.request.shortage,
          text: `旧名额已归还；新时段缺额 ${arranged.request.shortage} 人，凭证停在待安排`,
        },
  };
}

// 待安排凭证重新尝试目标时段（例如有人取消腾出名额后）。
export function retryArrange({ exhibits, sessions, vouchers }, id, now = new Date()) {
  const voucher = vouchers.find((v) => v.id === id);
  if (!voucher) return { vouchers, result: { ok: false, reason: '查无此凭证' } };
  if (voucher.status !== STATUS.PENDING || !voucher.request)
    return { vouchers, result: { ok: false, reason: '该凭证不在待安排状态' } };
  const target = findTarget(voucher.request.sessionId, sessions, exhibits);
  if (target.error) return { vouchers, result: { ok: false, reason: target.error } };
  const arranged = arrangeInto(voucher, target.session, target.exhibit, sessions, vouchers, now, null);
  const ok = arranged.status === STATUS.BOOKED;
  return {
    vouchers: vouchers.map((v) => (v.id === id ? arranged : v)),
    result: ok
      ? { ok: true, voucher: arranged, text: `名额已补上：${arranged.room} ${arranged.period}` }
      : {
          ok: true,
          voucher: arranged,
          shortage: arranged.request.shortage,
          text: `仍缺额 ${arranged.request.shortage} 人，继续待安排`,
        },
  };
}

// 取消：名额立即释放，档案保留。
export function cancelVoucher({ vouchers }, id, now = new Date()) {
  const voucher = vouchers.find((v) => v.id === id);
  if (!voucher) return { vouchers, result: { ok: false, reason: '查无此凭证' } };
  if (![STATUS.BOOKED, STATUS.PENDING].includes(voucher.status))
    return { vouchers, result: { ok: false, reason: `当前为「${voucher.status}」，不能取消` } };
  const oldId = voucher.sessionId;
  const cancelled = {
    ...voucher,
    sessionId: null,
    request: null,
    status: STATUS.CANCELLED,
    updatedAt: now.toISOString(),
    history: [
      ...voucher.history,
      note(oldId ? `取消：${voucher.people} 人名额立即释放` : '取消待安排凭证'),
    ],
  };
  return {
    vouchers: vouchers.map((v) => (v.id === id ? cancelled : v)),
    result: { ok: true, voucher: cancelled, text: `已取消，${voucher.people} 人名额已释放` },
  };
}

// 过期：日期早于今天的已预约凭证立即释放名额。
// 返回值若无变化则保持原数组引用，便于界面判断是否需要落盘。
export function applyExpiry({ vouchers }, today = todayStr()) {
  let changed = false;
  const next = vouchers.map((v) => {
    if (v.status === STATUS.BOOKED && v.date < today) {
      changed = true;
      return {
        ...v,
        sessionId: null,
        status: STATUS.EXPIRED,
        updatedAt: new Date().toISOString(),
        history: [...v.history, note(`过期未核销：${v.date} ${v.period}，${v.people} 人名额自动释放`)],
      };
    }
    return v;
  });
  return changed ? next : vouchers;
}

// 入场核销：只认当天有效凭证；核销记录留档。
export function checkIn({ vouchers, checkins }, rawCode, now = new Date()) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { vouchers, checkins, result: { ok: false, reason: '请输入凭证号' } };
  const voucher = vouchers.find((v) => v.code.toUpperCase() === code);
  if (!voucher) return { vouchers, checkins, result: { ok: false, reason: `查无此凭证：${code}` } };

  const reasonByStatus = {
    [STATUS.CANCELLED]: '凭证已取消，名额已释放，不能入场',
    [STATUS.EXPIRED]: `凭证已过期（${voucher.date}），名额已释放`,
    [STATUS.CHECKED]: '该凭证已核销，请勿重复入场',
    [STATUS.PENDING]: '凭证仍为待安排，没有入场名额',
  };
  if (reasonByStatus[voucher.status])
    return { vouchers, checkins, result: { ok: false, reason: reasonByStatus[voucher.status], voucher } };

  const today = todayStr(now);
  if (voucher.date !== today)
    return {
      vouchers,
      checkins,
      result: { ok: false, voucher, reason: `非当天凭证：仅限 ${today} 使用，本凭证为 ${voucher.date}` },
    };

  const checked = {
    ...voucher,
    status: STATUS.CHECKED,
    updatedAt: now.toISOString(),
    history: [...voucher.history, note(`入场核销：${voucher.room} ${voucher.period}，${voucher.people} 人`)],
  };
  const record = {
    id: 'c-' + Date.now().toString(36),
    at: now.toISOString(),
    voucherId: voucher.id,
    code: voucher.code,
    room: voucher.room,
    title: voucher.title,
    period: voucher.period,
    people: voucher.people,
  };
  return {
    vouchers: vouchers.map((v) => (v.id === voucher.id ? checked : v)),
    checkins: [record, ...checkins],
    result: { ok: true, voucher: checked, record, text: `核销成功：${voucher.room} · ${voucher.people} 人入场` },
  };
}

// 按凭证号查档：无论状态都能查出展厅与人数。
export function findByCode(vouchers, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  return vouchers.find((v) => v.code.toUpperCase() === code) || null;
}

export const activeCount = (vouchers) =>
  vouchers.reduce((n, v) => (ACTIVE.has(v.status) ? n + v.people : n), 0);
