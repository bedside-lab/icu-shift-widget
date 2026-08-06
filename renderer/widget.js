/* ===== 근무조 정의 =====
   Day     : 07:40 ~ 15:39  -> 08~15시 표시
   Evening : 15:40 ~ 23:39  -> 16~23시 표시
   Night   : 23:40 ~ 07:39  -> 00~07시 표시 (자정 넘어감)
*/
const SHIFT_RANGES = {
  D: { label: 'DAY', hours: [8, 9, 10, 11, 12, 13, 14, 15], startMin: 7 * 60 + 40 },
  E: { label: 'EVENING', hours: [16, 17, 18, 19, 20, 21, 22, 23], startMin: 15 * 60 + 40 },
  N: { label: 'NIGHT', hours: [0, 1, 2, 3, 4, 5, 6, 7], startMin: 23 * 60 + 40 },
};

let tasks = []; // {id, time:'HH:MM', memo, done, fired, alarmOn}
let currentPeriod = null;
let pinned = false;
let saveTimer = null;

function pad(n) { return String(n).padStart(2, '0'); }

function getCurrentPeriod(now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= SHIFT_RANGES.D.startMin && mins < SHIFT_RANGES.E.startMin) return 'D';
  if (mins >= SHIFT_RANGES.E.startMin && mins < SHIFT_RANGES.N.startMin) return 'E';
  return 'N';
}

function applyShift(s, silent) {
  tasks = SHIFT_RANGES[s].hours.map(h => ({
    id: Date.now() + h,
    time: pad(h) + ':00',
    memo: '',
    done: false,
    fired: false,
    alarmOn: false,
  }));
  if (!silent) toast(SHIFT_RANGES[s].label + ' 근무 시간표로 자동 전환되었습니다');
  persist();
  render();
}

function updateNextSwitchLabel(period) {
  const order = ['D', 'E', 'N'];
  const idx = order.indexOf(period);
  const nextPeriod = order[(idx + 1) % 3];
  const startMin = SHIFT_RANGES[nextPeriod].startMin;
  const h = Math.floor(startMin / 60), m = startMin % 60;
  document.getElementById('nextSwitch').textContent =
    '다음 전환: ' + pad(h) + ':' + pad(m) + ' (' + SHIFT_RANGES[nextPeriod].label + ')';
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.electronAPI.saveTasks({ tasks, currentPeriod });
  }, 150);
}

async function init() {
  const now = new Date();
  const period = getCurrentPeriod(now);
  currentPeriod = period;

  const saved = await window.electronAPI.loadTasks();
  // 저장된 데이터가 있고, 그게 지금과 같은 근무조라면 이어서 사용 (재시작 대비)
  if (saved && saved.currentPeriod === period && Array.isArray(saved.tasks)) {
    tasks = saved.tasks;
  } else {
    tasks = SHIFT_RANGES[period].hours.map(h => ({
      id: Date.now() + h, time: pad(h) + ':00', memo: '', done: false, fired: false, alarmOn: false,
    }));
    persist();
  }
  document.getElementById('shiftBadge').textContent = SHIFT_RANGES[period].label;
  render();
  tick();
  setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  document.getElementById('dateStr').textContent =
    now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  document.getElementById('hm').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  document.getElementById('ss').textContent = pad(now.getSeconds());

  const period = getCurrentPeriod(now);
  if (period !== currentPeriod) {
    currentPeriod = period;
    document.getElementById('shiftBadge').textContent = SHIFT_RANGES[period].label;
    applyShift(period, false);
  }
  updateNextSwitchLabel(period);

  const curHM = pad(now.getHours()) + ':' + pad(now.getMinutes());
  tasks.forEach(t => {
    if (t.time === curHM && t.alarmOn && t.memo.trim() && !t.fired && !t.done) {
      t.fired = true;
      window.electronAPI.triggerAlarm({ time: t.time, memo: t.memo });
    }
  });

  render();
}

function togglePin() {
  pinned = !pinned;
  const btn = document.getElementById('pinBtn');
  btn.textContent = pinned ? '📌 고정 켜짐' : '📌 고정 꺼짐';
  btn.classList.toggle('on', pinned);
  window.electronAPI.setAlwaysOnTop(pinned);
}

function toast(msg) {
  let t = document.getElementById('toastEl');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toastEl';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

let confirmYesAction = null;
function askConfirm(msg, onYes) {
  document.getElementById('confirmMsg').textContent = msg;
  confirmYesAction = onYes;
  document.getElementById('confirmOverlay').classList.add('show');
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('show');
  confirmYesAction = null;
}
document.getElementById('confirmYesBtn').onclick = function () {
  const action = confirmYesAction;
  closeConfirm();
  if (action) action();
};

function clearAll() {
  if (tasks.length === 0) { toast('이미 비어 있습니다'); return; }
  askConfirm('현재 목록(' + tasks.length + '개)을 모두 지울까요?\n이 작업은 되돌릴 수 없습니다.', function () {
    tasks = [];
    persist();
    toast('목록을 초기화했습니다');
    render();
  });
}

function addTimeSlot() {
  const time = document.getElementById('inTime').value;
  if (!time) { toast('추가할 시간을 선택해주세요'); return; }
  if (tasks.some(t => t.time === time)) { toast('이미 등록된 시간입니다'); return; }
  tasks.push({ id: Date.now(), time, memo: '', done: false, fired: false, alarmOn: false });
  persist();
  render();
}

function updateMemo(id, value) {
  const t = tasks.find(x => x.id === id);
  if (t) t.memo = value;
  persist();
}

function toggleAlarm(id) {
  const t = tasks.find(x => x.id === id);
  if (t) t.alarmOn = !t.alarmOn;
  persist();
  render();
}

function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  persist();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  persist();
  render();
}

function render() {
  const now = new Date();
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  const el = document.getElementById('timeline');

  if (tasks.length === 0) {
    el.innerHTML = '<div class="empty">등록된 항목이 없습니다.</div>';
    return;
  }

  const sorted = [...tasks].sort((a, b) => a.time.localeCompare(b.time));
  const activeInput = document.activeElement && document.activeElement.classList.contains('memo-input')
    ? document.activeElement : null;
  const focusedId = activeInput ? Number(activeInput.dataset.id) : null;
  const caret = activeInput ? activeInput.selectionStart : null;

  el.innerHTML = sorted.map(t => {
    const [h, m] = t.time.split(':').map(Number);
    const taskMinutes = h * 60 + m;
    let cls = '';
    if (t.done) cls = 'done';
    else if (taskMinutes === curMinutes) cls = 'now';
    else if (taskMinutes > curMinutes && taskMinutes - curMinutes <= 15) cls = 'upcoming';

    return `
      <div class="task ${cls}">
        <div class="time">${t.time}</div>
        <div class="dot"></div>
        <div class="body">
          <button class="checkbtn" onclick="toggleDone(${t.id})" title="완료 체크">✓</button>
          <input class="memo-input" type="text" data-id="${t.id}"
                 value="${escapeHtml(t.memo)}" placeholder="할 일을 입력하세요..."
                 oninput="updateMemo(${t.id}, this.value)">
          <button class="bellbtn ${t.alarmOn ? 'on' : ''}" onclick="toggleAlarm(${t.id})" title="알람 켜기/끄기">🔔</button>
          <button class="del" onclick="deleteTask(${t.id})" title="삭제">✕</button>
        </div>
      </div>`;
  }).join('');

  if (focusedId !== null) {
    const inputEl = el.querySelector(`.memo-input[data-id="${focusedId}"]`);
    if (inputEl) { inputEl.focus(); inputEl.setSelectionRange(caret, caret); }
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

init();
