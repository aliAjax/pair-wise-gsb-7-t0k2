// 档案层：唯一负责 localStorage 读写；判断层与界面层都不直接碰存储。
// 四个键各自独立：展项档案、时段台账、参观凭证、核销留档。
import { STATUS, dateStr } from './rules.js';

const K = {
  exhibits: 'guide-exhibits',
  sessions: 'guide-sessions',
  vouchers: 'guide-vouchers',
  checkins: 'guide-checkins',
};

const seedExhibits = [
  { id: 1, title: '潮汐之后', room: 'A01 · 主展厅', type: '装置', desc: '一件记录海岸线变化的沉浸式影像装置。', audio: 'https://example.com/audio.mp3', status: '已发布', color: '#e6b45d' },
  { id: 2, title: '未寄出的信', room: 'B02 · 纸上时间', type: '档案', desc: '来自三代人的手写信件与声音档案。', audio: '', status: '草稿', color: '#ef8f84' },
  { id: 3, title: '柔软的边界', room: 'C01 · 新媒介', type: '互动', desc: '观众的移动会改变墙面上的光影。', audio: '', status: '已发布', color: '#83b9b1' },
];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时静默降级，界面仍可操作 */
  }
}

// 演示台账：时段相对“今天”生成，保证任何时候打开都能看到当天核销与过期释放。
function seedLedger() {
  const t = dateStr(0);
  const y = dateStr(-1);
  const tm = dateStr(1);
  const sessions = [
    { id: 's-1', exhibitId: 1, date: t, period: '上午 09:30–12:00', capacity: 30, createdAt: `${t}T08:00:00.000Z` },
    { id: 's-2', exhibitId: 1, date: t, period: '下午 14:00–17:00', capacity: 30, createdAt: `${t}T08:00:00.000Z` },
    { id: 's-3', exhibitId: 3, date: t, period: '上午 10:00–12:00', capacity: 12, createdAt: `${t}T08:00:00.000Z` },
    { id: 's-4', exhibitId: 1, date: tm, period: '上午 09:30–12:00', capacity: 30, createdAt: `${t}T08:00:00.000Z` },
    { id: 's-5', exhibitId: 1, date: y, period: '下午 14:00–17:00', capacity: 30, createdAt: `${y}T08:00:00.000Z` },
  ];
  const vouchers = [
    {
      id: 'v-demo-1', code: 'V-TODAY-001', people: 4, exhibitId: 1, title: '潮汐之后',
      room: 'A01 · 主展厅', date: t, period: '上午 09:30–12:00', sessionId: 's-1',
      status: STATUS.BOOKED, request: null, createdAt: `${t}T01:00:00.000Z`, updatedAt: `${t}T01:00:00.000Z`,
      history: [{ at: `${t}T01:00:00.000Z`, text: '登记成功：A01 · 主展厅 上午场，4 人' }],
    },
    {
      id: 'v-demo-2', code: 'V-TODAY-002', people: 2, exhibitId: 3, title: '柔软的边界',
      room: 'C01 · 新媒介', date: t, period: '上午 10:00–12:00', sessionId: 's-3',
      status: STATUS.CHECKED, request: null, createdAt: `${t}T01:10:00.000Z`, updatedAt: `${t}T02:30:00.000Z`,
      history: [
        { at: `${t}T01:10:00.000Z`, text: '登记成功：C01 · 新媒介 上午场，2 人' },
        { at: `${t}T02:30:00.000Z`, text: '入场核销：C01 · 新媒介 上午场，2 人' },
      ],
    },
    {
      id: 'v-demo-3', code: 'V-YEST-001', people: 6, exhibitId: 1, title: '潮汐之后',
      room: 'A01 · 主展厅', date: y, period: '下午 14:00–17:00', sessionId: 's-5',
      status: STATUS.BOOKED, request: null, createdAt: `${y}T03:00:00.000Z`, updatedAt: `${y}T03:00:00.000Z`,
      history: [{ at: `${y}T03:00:00.000Z`, text: '登记成功：A01 · 主展厅 下午场，6 人' }],
    },
    {
      id: 'v-demo-4', code: 'V-TODAY-003', people: 5, exhibitId: 1, title: '潮汐之后',
      room: 'A01 · 主展厅', date: t, period: '下午 14:00–17:00', sessionId: null,
      status: STATUS.PENDING,
      request: { sessionId: 's-2', date: t, period: '下午 14:00–17:00', shortage: 5 },
      createdAt: `${t}T01:20:00.000Z`, updatedAt: `${t}T01:20:00.000Z`,
      history: [{ at: `${t}T01:20:00.000Z`, text: '容量不足：下午场余 0 人，缺 5 人，停在待安排' }],
    },
    {
      id: 'v-demo-5', code: 'V-TODAY-004', people: 3, exhibitId: 1, title: '潮汐之后',
      room: 'A01 · 主展厅', date: t, period: '上午 09:30–12:00', sessionId: null,
      status: STATUS.CANCELLED, request: null, createdAt: `${t}T01:05:00.000Z`, updatedAt: `${t}T01:40:00.000Z`,
      history: [
        { at: `${t}T01:05:00.000Z`, text: '登记成功：A01 · 主展厅 上午场，3 人' },
        { at: `${t}T01:40:00.000Z`, text: '取消：3 人名额立即释放' },
      ],
    },
  ];
  const checkins = [
    {
      id: 'c-demo-1', at: `${t}T02:30:00.000Z`, voucherId: 'v-demo-2', code: 'V-TODAY-002',
      room: 'C01 · 新媒介', title: '柔软的边界', period: '上午 10:00–12:00', people: 2,
    },
  ];
  return { sessions, vouchers, checkins };
}

export function loadExhibits() {
  return read(K.exhibits, seedExhibits);
}
export function saveExhibits(exhibits) {
  write(K.exhibits, exhibits);
}

export function loadLedger() {
  let sessions = read(K.sessions, null);
  let vouchers = read(K.vouchers, null);
  let checkins = read(K.checkins, null);
  if (!sessions || !vouchers || !checkins) {
    const seed = seedLedger();
    sessions = sessions || seed.sessions;
    vouchers = vouchers || seed.vouchers;
    checkins = checkins || seed.checkins;
    saveLedger(seed);
  }
  return { sessions, vouchers, checkins };
}
export function saveLedger({ sessions, vouchers, checkins }) {
  write(K.sessions, sessions);
  write(K.vouchers, vouchers);
  write(K.checkins, checkins);
}
