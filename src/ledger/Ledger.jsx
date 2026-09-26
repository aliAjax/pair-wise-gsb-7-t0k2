// 界面层：只做展示与事件转发，所有判断交给 rules，所有落盘交给 archive（由 App 统一保存）。
import React, { useEffect, useMemo, useState } from 'react';
import {
  STATUS, todayStr, isPublished, sessionUsage, pendingFor,
  registerVoucher, rescheduleVoucher, retryArrange, cancelVoucher, checkIn, findByCode,
} from './rules.js';

const FILTERS = ['全部', STATUS.BOOKED, STATUS.PENDING, STATUS.CHECKED, STATUS.CANCELLED, STATUS.EXPIRED];
const PERIODS = ['上午 09:30–12:00', '下午 14:00–17:00', '晚间 18:30–21:00'];
const badgeClass = {
  [STATUS.BOOKED]: 'booked',
  [STATUS.PENDING]: 'pending',
  [STATUS.CHECKED]: 'checked',
  [STATUS.CANCELLED]: 'cancelled',
  [STATUS.EXPIRED]: 'expired',
};

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
};

export default function Ledger({ exhibits, sessions, vouchers, checkins, onChange, notice }) {
  const today = todayStr();
  const published = exhibits.filter(isPublished);

  const [sessionForm, setSessionForm] = useState({ exhibitId: published[0]?.id ?? '', date: today, period: PERIODS[0], capacity: 20 });
  const [regForm, setRegForm] = useState({ sessionId: '', people: 2 });
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinMsg, setCheckinMsg] = useState(null);
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState(undefined);
  const [filter, setFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState(null);
  const [targetSession, setTargetSession] = useState('');
  const [flash, setFlash] = useState(null);

  const say = (text, kind = 'ok') => setFlash({ text, kind });
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);
  const run = (fn) => {
    const out = fn();
    if (out.sessions) onChange({ sessions: out.sessions, vouchers: out.vouchers ?? vouchers, checkins: out.checkins ?? checkins });
    else onChange({ sessions, vouchers: out.vouchers ?? vouchers, checkins: out.checkins ?? checkins });
    return out.result;
  };

  const openSessions = useMemo(
    () => sessions.filter((s) => isPublished(exhibits.find((x) => x.id === s.exhibitId))),
    [sessions, exhibits]
  );
  const selected = vouchers.find((v) => v.id === selectedId) || null;
  const visible = filter === '全部' ? vouchers : vouchers.filter((v) => v.status === filter);
  const pendingList = vouchers.filter((v) => v.status === STATUS.PENDING);

  const addSession = () => {
    const exhibit = exhibits.find((x) => x.id === Number(sessionForm.exhibitId));
    if (!isPublished(exhibit)) return say('只有已发布展项才能开放时段', 'err');
    if (!sessionForm.date) return say('请选择日期', 'err');
    const capacity = Math.floor(Number(sessionForm.capacity));
    if (!Number.isFinite(capacity) || capacity < 1) return say('容量需为不小于 1 的整数', 'err');
    if (sessions.some((s) => s.exhibitId === exhibit.id && s.date === sessionForm.date && s.period === sessionForm.period))
      return say('该展项此时段已存在', 'err');
    const session = {
      id: 's-' + Date.now().toString(36),
      exhibitId: exhibit.id,
      date: sessionForm.date,
      period: sessionForm.period,
      capacity,
      createdAt: new Date().toISOString(),
    };
    onChange({ sessions: [...sessions, session], vouchers, checkins });
    say(`已开放时段：${exhibit.room} ${session.date} ${session.period}（${capacity} 人）`);
  };

  const register = () => {
    if (!regForm.sessionId) return say('请选择时段', 'err');
    const result = run(() => registerVoucher({ exhibits, sessions, vouchers }, { sessionId: regForm.sessionId, people: regForm.people }));
    say(result.text, result.ok ? (result.shortage ? 'warn' : 'ok') : 'err');
    if (result.ok) setSelectedId(result.voucher.id);
  };

  const doCheckIn = () => {
    const out = checkIn({ vouchers, checkins }, checkinCode);
    onChange({ sessions, vouchers: out.vouchers, checkins: out.checkins });
    setCheckinMsg(out.result);
    if (out.result.ok) setCheckinCode('');
  };

  const lookup = () => {
    const code = lookupCode.trim();
    if (!code) return setLookupResult(null);
    setLookupResult(findByCode(vouchers, code) || null);
  };

  const reschedule = () => {
    if (!selected || !targetSession) return say('请选择要改期到的时段', 'err');
    const result = run(() => rescheduleVoucher({ exhibits, sessions, vouchers }, selected.id, targetSession));
    say(result.text, result.shortage ? 'warn' : result.ok ? 'ok' : 'err');
    setTargetSession('');
  };
  const retry = () => {
    const result = run(() => retryArrange({ exhibits, sessions, vouchers }, selected.id));
    say(result.text, result.shortage ? 'warn' : result.ok ? 'ok' : 'err');
  };
  const cancel = () => {
    const result = run(() => cancelVoucher({ vouchers }, selected.id));
    say(result.text, result.ok ? 'ok' : 'err');
  };

  const usageOf = (s) => sessionUsage(s.id, sessions, vouchers);
  const sessionLabel = (s) => {
    const ex = exhibits.find((x) => x.id === s.exhibitId);
    return `${ex?.room || '?'} · ${s.date} ${s.period}`;
  };

  return (
    <div className="content">
      <section className="list-pane">
        <div className="list-head">
          <div>
            <h2>参观凭证</h2>
            <span>{vouchers.length} 张凭证 · 在册占额 {vouchers.reduce((n, v) => ([STATUS.BOOKED, STATUS.CHECKED].includes(v.status) ? n + v.people : n), 0)} 人</span>
          </div>
        </div>
        <div className="filters">
          {FILTERS.map((x) => (
            <button key={x} className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)}>{x}</button>
          ))}
        </div>
        <div className="exhibit-list">
          {visible.map((v) => (
            <button key={v.id} className={'exhibit-row ' + (selectedId === v.id ? 'chosen' : '')} onClick={() => { setSelectedId(v.id); setTargetSession(''); }}>
              <span className="row-copy">
                <strong>{v.code} · {v.people} 人</strong>
                <small>{v.room} · {v.date} {v.period}</small>
              </span>
              <span className={'status ' + badgeClass[v.status]}>{v.status}</span>
              <span className="chev">›</span>
            </button>
          ))}
          {!visible.length && <p className="empty">该状态下暂无凭证</p>}
        </div>

        <div className="panel-title ledger-sub"><div><span className="eyebrow">SESSIONS</span><h2>展厅时段台账</h2></div></div>
        <div className="session-list">
          {sessions.map((s) => {
            const ex = exhibits.find((x) => x.id === s.exhibitId);
            const u = usageOf(s);
            const pend = pendingFor(s.id, vouchers);
            const pct = u.capacity ? Math.min(100, Math.round((u.used / u.capacity) * 100)) : 0;
            return (
              <div className={'session-card' + (u.remaining === 0 ? ' full' : '')} key={s.id}>
                <div className="session-top">
                  <strong>{ex?.room || '已下架展项'}</strong>
                  <span>{s.date} {s.period}</span>
                </div>
                <div className="capbar"><i style={{ width: pct + '%' }} /></div>
                <div className="session-meta">
                  <span>占用 {u.used}/{u.capacity}（在册 {u.booked} · 已入场 {u.checked}）· 余 {u.remaining}</span>
                  {pend.length > 0 && <span className="shortage">待安排缺额 {pend.reduce((n, v) => n + v.request.shortage, 0)} 人</span>}
                </div>
                {!isPublished(ex) && <div className="session-meta"><span className="shortage">展项未发布，时段暂停开放</span></div>}
              </div>
            );
          })}
          {!sessions.length && <p className="empty">尚未开放任何时段</p>}
        </div>
      </section>

      <section className="form-panel">
        <div className="panel-title"><div><span className="eyebrow">OPEN SESSION</span><h2>开放时段</h2></div></div>
        <div className="editor">
          <div className="two">
            <label>展项（仅已发布）
              <select value={sessionForm.exhibitId} onChange={(e) => setSessionForm({ ...sessionForm, exhibitId: e.target.value })}>
                {published.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.room}</option>)}
                {!published.length && <option value="">暂无已发布展项</option>}
              </select>
            </label>
            <label>日期<input type="date" value={sessionForm.date} min={today} onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })} /></label>
          </div>
          <div className="two">
            <label>场次
              <select value={sessionForm.period} onChange={(e) => setSessionForm({ ...sessionForm, period: e.target.value })}>
                {PERIODS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>容量（人）<input type="number" min="1" value={sessionForm.capacity} onChange={(e) => setSessionForm({ ...sessionForm, capacity: e.target.value })} /></label>
          </div>
          <button className="primary full" onClick={addSession}>开放时段</button>
        </div>

        <div className="panel-title ledger-sub"><div><span className="eyebrow">REGISTER</span><h2>凭证登记</h2></div></div>
        <div className="editor">
          <label>时段
            <select value={regForm.sessionId} onChange={(e) => setRegForm({ ...regForm, sessionId: e.target.value })}>
              <option value="">选择已开放时段…</option>
              {openSessions.map((s) => {
                const u = usageOf(s);
                return <option key={s.id} value={s.id}>{sessionLabel(s)}（余 {u.remaining}）</option>;
              })}
            </select>
          </label>
          <label>人数<input type="number" min="1" value={regForm.people} onChange={(e) => setRegForm({ ...regForm, people: e.target.value })} /></label>
          <button className="primary full" onClick={register}>登记凭证</button>
          <small className="hint">容量足够即出「已预约」；不足则停在「待安排」并记录缺额，不占名额。</small>
        </div>

        <div className="panel-title ledger-sub"><div><span className="eyebrow">CHECK-IN</span><h2>入场核销</h2></div></div>
        <div className="editor">
          <div className="inline-form">
            <input placeholder="输入凭证号，如 V20260926-001" value={checkinCode} onChange={(e) => setCheckinCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doCheckIn()} />
            <button className="primary" onClick={doCheckIn}>核销</button>
          </div>
          <small className="hint">只认当天（{today}）有效的已预约凭证；取消、过期、待安排一律拒绝。</small>
          {checkinMsg && <p className={'msg ' + (checkinMsg.ok ? 'ok' : 'err')}>{checkinMsg.ok ? checkinMsg.text : checkinMsg.reason}</p>}
          {checkins.length > 0 && (
            <div className="log">
              <div className="log-head">核销留档（{checkins.length}）</div>
              {checkins.slice(0, 5).map((c) => (
                <div className="log-row" key={c.id}>
                  <span>{fmtTime(c.at)}</span><strong>{c.code}</strong><span>{c.room} · {c.people} 人</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel-title ledger-sub"><div><span className="eyebrow">LOOKUP</span><h2>凭证查询</h2></div></div>
        <div className="editor">
          <div className="inline-form">
            <input placeholder="输入凭证号查询档案" value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
            <button className="secondary" onClick={lookup}>查询</button>
          </div>
          {lookupResult === null && <p className="msg err">查无此凭证</p>}
          {lookupResult && (
            <div className="lookup-card">
              <div className="lookup-head">
                <strong>{lookupResult.code}</strong>
                <span className={'status ' + badgeClass[lookupResult.status]}>{lookupResult.status}</span>
              </div>
              <p>{lookupResult.room} · {lookupResult.title}</p>
              <p>{lookupResult.date} {lookupResult.period} · {lookupResult.people} 人</p>
              {lookupResult.request && <p className="shortage">待安排缺额 {lookupResult.request.shortage} 人</p>}
            </div>
          )}
        </div>

        {selected && (
          <>
            <div className="panel-title ledger-sub"><div><span className="eyebrow">VOUCHER</span><h2>凭证详情 · {selected.code}</h2></div><span className={'status ' + badgeClass[selected.status]}>{selected.status}</span></div>
            <div className="editor">
              <div className="lookup-card">
                <p>{selected.room} · {selected.title}</p>
                <p>{selected.date} {selected.period} · {selected.people} 人</p>
                {selected.request && <p className="shortage">待安排：目标 {selected.request.date} {selected.request.period}，缺额 {selected.request.shortage} 人</p>}
              </div>
              {selected.status === STATUS.BOOKED && (
                <>
                  <label>改期到（旧名额先归还）
                    <select value={targetSession} onChange={(e) => setTargetSession(e.target.value)}>
                      <option value="">选择新时段…</option>
                      {openSessions.filter((s) => s.id !== selected.sessionId).map((s) => {
                        const u = usageOf(s);
                        return <option key={s.id} value={s.id}>{sessionLabel(s)}（余 {u.remaining}）</option>;
                      })}
                    </select>
                  </label>
                  <button className="primary full" onClick={reschedule}>确认改期</button>
                </>
              )}
              {selected.status === STATUS.PENDING && (
                <button className="primary full" onClick={retry}>重试安排目标时段</button>
              )}
              {[STATUS.BOOKED, STATUS.PENDING].includes(selected.status) && (
                <button className="danger full" onClick={cancel}>取消凭证（名额立即释放）</button>
              )}
              <div className="log">
                <div className="log-head">流转记录</div>
                {selected.history.map((h, i) => (
                  <div className="log-row" key={i}><span>{fmtTime(h.at)}</span><span>{h.text}</span></div>
                ))}
              </div>
            </div>
          </>
        )}

        {pendingList.length > 0 && (
          <>
            <div className="panel-title ledger-sub"><div><span className="eyebrow">SHORTAGE</span><h2>待安排缺额</h2></div></div>
            <div className="log">
              {pendingList.map((v) => (
                <div className="log-row" key={v.id}>
                  <strong>{v.code}</strong>
                  <span>{v.room} {v.request.date} {v.request.period}</span>
                  <span className="shortage">缺 {v.request.shortage} 人</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {(flash || notice) && <div className={'toast ' + (flash?.kind || '')}>{flash?.text || notice}</div>}
    </div>
  );
}
