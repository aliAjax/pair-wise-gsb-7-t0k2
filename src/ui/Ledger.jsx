// 界面层：只负责展示和收集输入，所有判断都交给 domain/rules，所有保存都交给 App 的持久化副作用。
import React, { useMemo, useState } from 'react';
import { VOUCHER_STATUS as VS } from '../domain/model.js';
import {
  todayStr,
  occupiedOf,
  openSlot,
  bookVoucher,
  rescheduleVoucher,
  cancelVoucher,
  verifyVoucher,
  findVoucherByCode,
} from '../domain/rules.js';

const ST_CLASS = {
  [VS.BOOKED]: 'booked',
  [VS.PENDING]: 'pending',
  [VS.VERIFIED]: 'verified',
  [VS.CANCELLED]: 'cancelled',
  [VS.EXPIRED]: 'expired',
};

const fmtTime = iso => new Date(iso).toLocaleString('zh-CN', { hour12: false });

export default function Ledger({ exhibits, ledger, setLedger, notify }) {
  const today = todayStr();
  const published = exhibits.filter(x => x.status === '已发布');
  const [slotForm, setSlotForm] = useState({ exhibitId: '', date: today, start: '10:00', end: '11:30', capacity: 8 });
  const [slotId, setSlotId] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(undefined);
  const [code, setCode] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [reId, setReId] = useState(null);
  const [reSlot, setReSlot] = useState('');

  const titleOf = id => exhibits.find(x => x.id === id)?.title || '—';

  const rows = useMemo(() => ledger.slots.map(s => {
    const occ = occupiedOf(ledger.vouchers, s.id);
    const pend = ledger.vouchers.filter(v => v.slotId === s.id && v.status === VS.PENDING);
    return { ...s, occ, free: s.capacity - occ, pendN: pend.length, pendShort: pend.reduce((a, v) => a + v.shortfall, 0) };
  }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)), [ledger]);

  const open = () => {
    const ex = exhibits.find(x => x.id === Number(slotForm.exhibitId));
    const r = openSlot(ledger, ex, {
      id: `s-${Date.now()}`, exhibitId: ex?.id, hall: ex?.room || '',
      date: slotForm.date, start: slotForm.start, end: slotForm.end, capacity: slotForm.capacity,
    });
    if (!r.ok) return notify(r.reason);
    setLedger(r.state);
    notify(`已开放时段：${r.slot.hall} · ${r.slot.date} ${r.slot.start}`);
  };

  const book = () => {
    if (!slotId) return notify('请选择时段');
    const slot = ledger.slots.find(s => s.id === slotId);
    const ex = exhibits.find(x => x.id === slot?.exhibitId);
    const r = bookVoucher(ledger, ex, slotId, partySize);
    if (!r.ok) return notify(r.reason);
    setLedger(r.state);
    notify(r.voucher.status === VS.BOOKED
      ? `凭证 ${r.voucher.code} 已预约：${r.voucher.hall} · ${r.voucher.partySize} 人`
      : `容量不足，${r.voucher.code} 停在待安排（缺额 ${r.voucher.shortfall} 人）`);
  };

  const doReschedule = id => {
    const r = rescheduleVoucher(ledger, id, reSlot);
    if (!r.ok) return notify(r.reason);
    setLedger(r.state);
    setReId(null);
    notify(r.fits ? '改期成功，旧名额已归还' : `已归还旧名额；新时段容量不足，凭证停在待安排（缺额 ${r.shortfall} 人）`);
  };

  const cancel = id => {
    setLedger(cancelVoucher(ledger, id));
    notify('已取消，名额立即释放');
  };

  const verify = () => {
    if (!code.trim()) return;
    const r = verifyVoucher(ledger, code);
    setLedger(r.state);
    setVerdict({
      ok: r.ok,
      text: r.ok
        ? `核销成功：${r.record.voucherCode} · ${r.record.hall} · ${r.record.partySize} 人`
        : `核销失败：${r.reason}`,
    });
    setCode('');
  };

  const search = () => setFound(findVoucherByCode(ledger, query) || null);

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">ADMISSION LEDGER · 今天 {today}</span>
          <h1>凭证与时段台账</h1>
        </div>
      </header>
      <div className="ledger">
        <section className="pane left">
          <div className="section">
            <div className="section-head">
              <h2>展厅时段台账</h2>
              <span>{rows.length} 个时段</span>
            </div>
            {rows.length === 0 && <p className="empty">尚未开放任何时段。</p>}
            {rows.length > 0 && (
              <table className="slot-table">
                <thead>
                  <tr><th>时段 / 展厅</th><th>展项</th><th>名额占用</th></tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.date} {s.start}–{s.end}</strong>
                        <small>{s.hall}</small>
                      </td>
                      <td>{titleOf(s.exhibitId)}</td>
                      <td className="cap">
                        <span>{s.occ}/{s.capacity} 人 · 余 {s.free}</span>
                        <div className={'cap-bar' + (s.free <= 0 ? ' full' : '')}>
                          <i style={{ width: `${Math.min(100, (s.occ / s.capacity) * 100)}%` }}></i>
                        </div>
                        {s.pendN > 0 && <div className="pend-note">待安排 {s.pendN} 张 · 缺额 {s.pendShort} 人</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>开放时段</h2>
              <span>仅已发布展项</span>
            </div>
            {published.length === 0
              ? <p className="empty">没有已发布的展项，请先在「展项内容」中发布。</p>
              : (
                <div className="form-grid">
                  <select className="wide" value={slotForm.exhibitId} onChange={e => setSlotForm({ ...slotForm, exhibitId: e.target.value })}>
                    <option value="">选择已发布展项…</option>
                    {published.map(x => <option key={x.id} value={x.id}>{x.title} · {x.room}</option>)}
                  </select>
                  <label>日期<input type="date" value={slotForm.date} onChange={e => setSlotForm({ ...slotForm, date: e.target.value })} /></label>
                  <label>容量<input type="number" min="1" value={slotForm.capacity} onChange={e => setSlotForm({ ...slotForm, capacity: e.target.value })} /></label>
                  <label>开始<input type="time" value={slotForm.start} onChange={e => setSlotForm({ ...slotForm, start: e.target.value })} /></label>
                  <label>结束<input type="time" value={slotForm.end} onChange={e => setSlotForm({ ...slotForm, end: e.target.value })} /></label>
                  <button className="primary full wide" onClick={open}>开放时段</button>
                </div>
              )}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>登记参观凭证</h2>
            </div>
            <div className="form-grid">
              <select className="wide" value={slotId} onChange={e => setSlotId(e.target.value)}>
                <option value="">选择时段…</option>
                {rows.map(s => <option key={s.id} value={s.id}>{s.hall} · {s.date} {s.start}（余 {s.free}）</option>)}
              </select>
              <label>参观人数<input type="number" min="1" value={partySize} onChange={e => setPartySize(e.target.value)} /></label>
              <button className="primary full" onClick={book}>登记凭证</button>
            </div>
          </div>
        </section>

        <section className="pane">
          <div className="section">
            <div className="section-head">
              <h2>按凭证查询</h2>
              <span>重开后仍可查</span>
            </div>
            <div className="inline-form">
              <input placeholder="凭证号，如 V-0001" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
              <button className="secondary" onClick={search}>查询</button>
            </div>
            {found === null && <p className="empty">未找到该凭证。</p>}
            {found && (
              <div className="query-card">
                <dl>
                  <dt>凭证号</dt><dd>{found.code}</dd>
                  <dt>展厅</dt><dd>{found.hall}</dd>
                  <dt>时段</dt><dd>{found.slotLabel}</dd>
                  <dt>人数</dt><dd>{found.partySize} 人</dd>
                  <dt>状态</dt><dd><span className={'st ' + ST_CLASS[found.status]}>{found.status}</span>{found.status === VS.PENDING && <span className="pend-note">　缺额 {found.shortfall} 人</span>}</dd>
                </dl>
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>参观凭证</h2>
              <span>{ledger.vouchers.length} 张</span>
            </div>
            {ledger.vouchers.length === 0 && <p className="empty">还没有凭证。</p>}
            {ledger.vouchers.slice().reverse().map(v => (
              <div className="v-row" key={v.id}>
                <div className="v-main">
                  <strong>{v.code}</strong>
                  <span>{v.exhibitTitle} · {v.hall}</span>
                  <small>{v.slotLabel} · {v.partySize} 人</small>
                  {v.status === VS.PENDING && <small className="short">容量不足，待安排 · 缺额 {v.shortfall} 人</small>}
                </div>
                <span className={'st ' + ST_CLASS[v.status]}>{v.status}</span>
                <div className="v-actions">
                  {[VS.BOOKED, VS.PENDING].includes(v.status) && (
                    <>
                      <button className="mini" onClick={() => { setReId(reId === v.id ? null : v.id); setReSlot(''); }}>改期</button>
                      <button className="mini" onClick={() => cancel(v.id)}>取消</button>
                    </>
                  )}
                </div>
                {reId === v.id && (
                  <div className="v-re">
                    <select value={reSlot} onChange={e => setReSlot(e.target.value)}>
                      <option value="">选择新时段（旧名额将先归还）…</option>
                      {rows.map(s => <option key={s.id} value={s.id}>{s.hall} · {s.date} {s.start}（余 {s.free}）</option>)}
                    </select>
                    <button className="mini" disabled={!reSlot} onClick={() => doReschedule(v.id)}>确认改期</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>入场核销</h2>
              <span>只认当天有效凭证</span>
            </div>
            <div className="inline-form">
              <input placeholder="扫描或输入凭证号" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()} />
              <button className="primary" onClick={verify}>核销</button>
            </div>
            {verdict && <div className={'verdict ' + (verdict.ok ? 'ok' : 'no')}>{verdict.text}</div>}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>核销档案</h2>
              <span>{ledger.verifications.length} 条</span>
            </div>
            {ledger.verifications.length === 0 && <p className="empty">暂无核销记录。</p>}
            {ledger.verifications.map(r => (
              <div className="log-row" key={r.id}>
                <span className={'dot ' + (r.ok ? 'ok' : 'no')}></span>
                <div>
                  <strong>{r.voucherCode}</strong>
                  <small>{r.ok ? `${r.hall} · ${r.partySize} 人` : '未入场'}</small>
                </div>
                <div>
                  <span>{r.reason}</span>
                  <small>{fmtTime(r.verifiedAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
