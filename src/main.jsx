import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { loadExhibits, saveExhibits, loadLedger, saveLedger } from './ledger/archive.js';
import { applyExpiry } from './ledger/rules.js';
import Ledger from './ledger/Ledger.jsx';

function App() {
  const [exhibits, setExhibits] = useState(loadExhibits);
  const [tab, setTab] = useState('ledger');
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState('edit');
  const [filter, setFilter] = useState('全部');
  const [form, setForm] = useState({ title: '', room: '', type: '装置', desc: '', audio: '' });
  const [notice, setNotice] = useState('');

  // 凭证台账（独立档案：时段 / 凭证 / 核销）
  const [ledger, setLedger] = useState(() => {
    const data = loadLedger();
    const vouchers = applyExpiry({ vouchers: data.vouchers });
    if (vouchers !== data.vouchers) {
      data.vouchers = vouchers;
      saveLedger(data);
    }
    return data;
  });

  useEffect(() => saveExhibits(exhibits), [exhibits]);
  useEffect(() => saveLedger(ledger), [ledger]);

  const { sessions, vouchers, checkins } = ledger;
  const visible = useMemo(
    () => (filter === '全部' ? exhibits : exhibits.filter((x) => x.status === filter)),
    [exhibits, filter]
  );
  const current = exhibits.find((x) => x.id === selected) || exhibits[0];

  const add = () => {
    if (!form.title.trim()) return;
    const item = {
      ...form, id: Date.now(), status: '草稿',
      color: ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'][exhibits.length % 4],
    };
    setExhibits([...exhibits, item]);
    setSelected(item.id);
    setForm({ title: '', room: '', type: '装置', desc: '', audio: '' });
    setNotice('展项已保存为草稿');
  };
  const update = (k, v) => setExhibits(exhibits.map((x) => x.id === current.id ? { ...x, [k]: v } : x));
  const publish = () => {
    const nextStatus = current.status === '已发布' ? '草稿' : '已发布';
    update('status', nextStatus);
    setNotice(nextStatus === '已发布'
      ? '已发布，现在可以为该展项开放参观时段'
      : '已撤回发布；对应时段不再开放登记，已占名额不受影响');
  };
  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ exhibits, ...ledger }, null, 2)], { type: 'application/json' }));
    a.download = 'exhibition-guide.json';
    a.click();
    setNotice('已导出台账数据');
  };

  if (view === 'visitor') {
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
          <button className="ghost" onClick={() => setView('edit')}>返回编辑</button>
        </header>
        <main className="visitor-main">
          <span className="eyebrow">VISITOR GUIDE / 2024</span>
          <h1>沿着作品，<em>走进</em>另一种时间。</h1>
          <p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p>
          <div className="visitor-grid">
            {exhibits.filter((x) => x.status === '已发布').map((x) => (
              <article className="visitor-card" key={x.id} onClick={() => { setSelected(x.id); setView('detail'); }}>
                <div className="art" style={{ background: x.color }}><span>{String(x.id).padStart(2, '0')}</span><i>↗</i></div>
                <div className="card-meta"><small>{x.room}</small><h3>{x.title}</h3><p>{x.desc}</p></div>
              </article>
            ))}
          </div>
        </main>
      </div>
    );
  }
  if (view === 'detail' && current) {
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
          <button className="ghost" onClick={() => setView('visitor')}>← 全部展项</button>
        </header>
        <main className="detail">
          <div className="detail-art" style={{ background: current.color }}><span>{String(current.id).padStart(2, '0')}</span></div>
          <div className="detail-copy">
            <span className="eyebrow">{current.room} / {current.type}</span>
            <h1>{current.title}</h1>
            <p>{current.desc}</p>
            {current.audio && <button className="audio" onClick={() => setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}
            <div className="qr">
              <div className="qr-box">▦</div>
              <div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div>
            </div>
          </div>
        </main>
        {notice && <div className="toast">{notice}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project">
          <span className="project-dot"></span>
          <div><strong>潮汐之后</strong><small>2024 春季展</small></div>
          <span>⌄</span>
        </div>
        <nav>
          <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>
            ◷ <span>参观凭证与时段</span><b>{vouchers.length}</b>
          </button>
          <button className={tab === 'exhibits' ? 'active' : ''} onClick={() => setTab('exhibits')}>
            ▧ <span>展项内容</span><b>{exhibits.length}</b>
          </button>
          <button>⌁ <span>展厅动线</span></button>
          <button>◉ <span>二维码</span></button>
        </nav>
        <div className="side-foot">
          <button>⚙ 设置</button>
          <small>已自动保存 · 刚刚</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{tab === 'ledger' ? 'VISIT LEDGER' : 'EXHIBITION BUILDER'}</span>
            <h1>{tab === 'ledger' ? '参观凭证与展厅时段台账' : '展项内容'}</h1>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
            <button className="secondary" onClick={() => setView('visitor')}>◉ 访客预览</button>
            {tab === 'exhibits' && (
              <button className="primary" onClick={publish}>
                {current?.status === '已发布' ? '撤回发布' : '发布更新'} <span>↗</span>
              </button>
            )}
          </div>
        </header>
        {tab === 'ledger' ? (
          <Ledger
            exhibits={exhibits}
            sessions={sessions}
            vouchers={vouchers}
            checkins={checkins}
            notice={notice}
            onChange={(next) => setLedger((prev) => ({ ...prev, ...next }))}
          />
        ) : (
          <div className="content">
            <section className="list-pane">
              <div className="list-head">
                <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
                <button className="add-btn" onClick={() => document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' })}>＋ 添加展项</button>
              </div>
              <div className="filters">
                {['全部', '已发布', '草稿'].map((x) => (
                  <button key={x} className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)}>{x}</button>
                ))}
              </div>
              <div className="exhibit-list">
                {visible.map((x) => (
                  <button className={'exhibit-row ' + (selected === x.id ? 'chosen' : '')} key={x.id} onClick={() => setSelected(x.id)}>
                    <span className="thumb" style={{ background: x.color }}>{String(x.id).padStart(2, '0')}</span>
                    <span className="row-copy"><strong>{x.title}</strong><small>{x.room} · {x.type}</small></span>
                    <span className={'status ' + (x.status === '已发布' ? 'live' : 'draft')}>{x.status}</span>
                    <span className="chev">›</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="form-panel">
              <div className="panel-title">
                <div><span className="eyebrow">EDIT EXHIBIT</span><h2>编辑展项</h2></div>
                <span className={'status ' + (current?.status === '已发布' ? 'live' : 'draft')}>{current?.status}</span>
              </div>
              {current && (
                <div className="editor">
                  <label>展项标题<input value={current.title} onChange={(e) => update('title', e.target.value)} /></label>
                  <div className="two">
                    <label>所在展厅<input value={current.room} onChange={(e) => update('room', e.target.value)} /></label>
                    <label>内容类型
                      <select value={current.type} onChange={(e) => update('type', e.target.value)}>
                        <option>装置</option><option>档案</option><option>互动</option><option>绘画</option>
                      </select>
                    </label>
                  </div>
                  <label>展项介绍<textarea rows="5" value={current.desc} onChange={(e) => update('desc', e.target.value)} /></label>
                  <label>语音导览 URL
                    <input value={current.audio} placeholder="https://…" onChange={(e) => update('audio', e.target.value)} />
                    <small className="hint">访客扫描二维码后可播放</small>
                  </label>
                  <div className="preview-block">
                    <div className="preview-heading"><span>二维码预览</span><button onClick={() => setNotice('二维码链接已复制')}>复制链接</button></div>
                    <div className="qr-preview">
                      <div className="qr-box big">▦</div>
                      <div><strong>展项-{String(current.id).padStart(3, '0')}</strong><small>/guide/{current.id}</small></div>
                    </div>
                  </div>
                </div>
              )}
              <div className="new-form">
                <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
                <div className="two">
                  <input placeholder="展项标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <input placeholder="展厅编号" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
                </div>
                <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
                <button className="primary full" onClick={add}>保存新展项</button>
              </div>
            </section>
          </div>
        )}
        {tab === 'exhibits' && notice && <div className="toast">{notice}</div>}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
