// app.js - Smart Study Planner (working, feature-complete frontend)
// Save as app.js

// === Constants & DOM ===
const STORAGE_KEY = 'ssp.tasks.v1';
let tasks = [];               // array of task objects
let reminderTimers = {};      // map taskId -> timeout id (for scheduled reminders)
let editingId = null;

// DOM elements
const searchInput = document.getElementById('searchInput');
const filterPriority = document.getElementById('filterPriority');
const btnExport = document.getElementById('btnExport');
const btnExport2 = document.getElementById('btnExport2');
const btnImport = document.getElementById('btnImport');
const importFile = document.getElementById('importFile');
const themeToggle = document.getElementById('themeToggle');
const openModal = document.getElementById('openModal');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const taskForm = document.getElementById('taskForm');
const taskList = document.getElementById('taskList');
const statTotal = document.getElementById('statTotal');
const statDone = document.getElementById('statDone');
const statToday = document.getElementById('statToday');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');

const pomTaskSelect = document.getElementById('pomTaskSelect');
const pomStart = document.getElementById('pomStart');
const pomStop = document.getElementById('pomStop');
const pomTimerEl = document.getElementById('pomTimer');
const pomTitle = document.getElementById('pomTitle');

// form fields
const fTitle = document.getElementById('fTitle');
const fSubject = document.getElementById('fSubject');
const fSubtasks = document.getElementById('fSubtasks');
const fDue = document.getElementById('fDue');
const fDuration = document.getElementById('fDuration');
const fPriority = document.getElementById('fPriority');
const fNotes = document.getElementById('fNotes');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');


// === Utilities ===
function uid(){ return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function load(){ const raw = localStorage.getItem(STORAGE_KEY); tasks = raw ? JSON.parse(raw) : []; }
function fmt(dt){ if(!dt) return '—'; try { return new Date(dt).toLocaleString(); } catch(e){ return dt; } }
function todayISO(){ const d=new Date(); return d.toISOString().slice(0,10); }
function isToday(dt){ if(!dt) return false; return new Date(dt).toDateString() === new Date().toDateString(); }

// === Init ===
load();
renderAll();         // initial render
scheduleAllReminders(); // reschedule for loaded tasks

// === Theme persistence ===
const THEME_KEY = 'ssp.theme';
function applyTheme(theme){
  if(theme === 'dark'){ document.body.classList.add('dark'); localStorage.setItem(THEME_KEY, 'dark'); }
  else { document.body.classList.remove('dark'); localStorage.setItem(THEME_KEY, 'light'); }
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
themeToggle.addEventListener('click', ()=> applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));

// === Modal controls ===
function openAddModal(prefill = {}) {
  editingId = null;
  modal.setAttribute('aria-hidden','false');
  modalTitle.textContent = 'Add Task';
  taskForm.reset();
  fTitle.value = prefill.title || '';
  fSubject.value = prefill.subject || '';
  fSubtasks.value = prefill.subtasks ? prefill.subtasks.join(', ') : '';
  fDue.value = prefill.due ? new Date(prefill.due).toISOString().slice(0,16) : '';
  fDuration.value = prefill.duration || '';
  fPriority.value = prefill.priority || 'normal';
  fNotes.value = prefill.notes || '';
  fTitle.focus();
}
function openEditModal(task){
  editingId = task.id;
  modal.setAttribute('aria-hidden','false');
  modalTitle.textContent = 'Edit Task';
  fTitle.value = task.title;
  fSubject.value = task.subject;
  fSubtasks.value = (task.subtasks||[]).join(', ');
  fDue.value = task.due ? new Date(task.due).toISOString().slice(0,16) : '';
  fDuration.value = task.duration || '';
  fPriority.value = task.priority || 'normal';
  fNotes.value = task.notes || '';
}
modalClose.addEventListener('click', ()=> modal.setAttribute('aria-hidden','true'));
cancelBtn.addEventListener('click', ()=> { modal.setAttribute('aria-hidden','true'); editingId = null; });

// open modal button
openModal.addEventListener('click', ()=> openAddModal());

// handle backdrop click to close
modal.addEventListener('click', e => { if(e.target === modal) { modal.setAttribute('aria-hidden','true'); editingId = null; } });

// === Form submit (add / edit) ===
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const title = fTitle.value.trim();
  if(!title){ alert('Title is required'); return; }
  const obj = {
    title,
    subject: fSubject.value.trim() || 'General',
    subtasks: fSubtasks.value ? fSubtasks.value.split(',').map(s=>s.trim()).filter(Boolean) : [],
    due: fDue.value ? new Date(fDue.value).toISOString() : null,
    duration: fDuration.value ? Number(fDuration.value) : 0,
    priority: fPriority.value || 'normal',
    notes: fNotes.value.trim(),
    completed: false,
    createdAt: Date.now()
  };

  if(editingId){
    const idx = tasks.findIndex(t => t.id === editingId);
    if(idx !== -1){
      obj.id = editingId;
      obj.completed = tasks[idx].completed;
      obj.createdAt = tasks[idx].createdAt;
      tasks[idx] = obj;
    }
    editingId = null;
  } else {
    obj.id = uid();
    tasks.push(obj);
  }
  save();
  renderAll();
  modal.setAttribute('aria-hidden','true');
  scheduleReminderForTask(obj); // schedule reminder if due
});

// === Render ===
function renderAll(){
  renderTasks();
  updateStats();
  updatePomOptions();
}

// create task card element
function createTaskCard(task){
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = task.id;

  // left: checkbox + priority
  const left = document.createElement('div'); left.className = 'task-left';
  const chk = document.createElement('div');
  chk.className = 'check';
  chk.innerHTML = task.completed ? '✔' : '';
  chk.title = task.completed ? 'Mark as pending' : 'Mark as complete';
  chk.addEventListener('click', () => {
    toggleComplete(task.id);
  });
  left.appendChild(chk);
  const pr = document.createElement('div');
  pr.className = 'badge ' + (task.priority || 'normal');
  pr.textContent = task.priority || 'normal';
  left.appendChild(pr);

  // body
  const body = document.createElement('div'); body.className = 'task-body';
  const title = document.createElement('div'); title.className = 'task-title';
  title.textContent = task.title + (task.completed ? ' ✓' : '');
  body.appendChild(title);

  const meta = document.createElement('div'); meta.className = 'task-meta';
  meta.textContent = (task.subject ? task.subject + ' • ' : '') + (task.duration ? task.duration + ' mins • ' : '') + (task.due ? fmt(task.due) : 'No due');
  body.appendChild(meta);

  if(task.subtasks && task.subtasks.length){
    const st = document.createElement('div');
    st.className = 'muted';
    st.textContent = 'Subtasks: ' + task.subtasks.slice(0,3).join(', ');
    body.appendChild(st);
  }
  if(task.notes){
    const notes = document.createElement('div'); notes.className = 'muted';
    notes.style.marginTop = '6px';
    notes.textContent = task.notes;
    body.appendChild(notes);
  }

  // actions
  const actions = document.createElement('div'); actions.className = 'task-actions';
  const btnView = document.createElement('button'); btnView.className = 'btn'; btnView.title = 'View / Edit';
  btnView.innerHTML = '<i data-lucide="edit"></i>'; btnView.addEventListener('click', ()=> openEditModal(task));
  const btnDelete = document.createElement('button'); btnDelete.className = 'btn ghost'; btnDelete.title = 'Delete';
  btnDelete.innerHTML = '<i data-lucide="trash-2"></i>'; btnDelete.addEventListener('click', ()=> {
    if(confirm('Delete this task?')) { deleteTask(task.id); }
  });
  const btnRemind = document.createElement('button'); btnRemind.className = 'btn ghost'; btnRemind.title = 'Schedule reminder';
  btnRemind.innerHTML = '<i data-lucide="bell"></i>'; btnRemind.addEventListener('click', ()=> scheduleReminderForTask(task, true));

  const btnPom = document.createElement('button'); btnPom.className = 'btn ghost'; btnPom.title = 'Focus (Pomodoro)';
  btnPom.innerHTML = '<i data-lucide="clock"></i>'; btnPom.addEventListener('click', ()=> { selectPomTask(task.id); });

  actions.appendChild(btnView);
  actions.appendChild(btnRemind);
  actions.appendChild(btnPom);
  actions.appendChild(btnDelete);

  card.appendChild(left);
  card.appendChild(body);
  card.appendChild(actions);

  // style completed
  if(task.completed) card.style.opacity = '0.6';

  // drag handlers for reordering
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', task.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  return card;
}

// render tasks (with search & filter)
function renderTasks(){
  taskList.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  const prFilter = filterPriority.value;

  // sorting: by due date, then priority, then createdAt
  const sorted = tasks.slice().sort((a,b) => {
    if(a.completed !== b.completed) return a.completed ? 1 : -1;
    const da = a.due ? new Date(a.due).getTime() : Infinity;
    const db = b.due ? new Date(b.due).getTime() : Infinity;
    if(da !== db) return da - db;
    const p = {high:3,normal:2,low:1};
    if(p[b.priority] !== p[a.priority]) return p[b.priority] - p[a.priority];
    return b.createdAt - a.createdAt;
  });

  const filtered = sorted.filter(t => {
    if(prFilter && t.priority !== prFilter) return false;
    if(q){
      const hay = (t.title + ' ' + t.subject + ' ' + (t.notes||'') + ' ' + (t.subtasks||[]).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(filtered.length === 0){
    const empty = document.createElement('div');
    empty.className = 'card muted';
    empty.textContent = 'No tasks found. Click "New Task" to add your first study item.';
    taskList.appendChild(empty);
    updateStats();
    return;
  }

  filtered.forEach(t => {
    const el = createTaskCard(t);
    taskList.appendChild(el);
  });

  // add dragover on container to reorder
  taskList.addEventListener('dragover', e => {
    e.preventDefault();
    const after = getDragAfterElement(taskList, e.clientY);
    const dragging = document.querySelector('.dragging');
    if(!dragging) return;
    if(after == null) taskList.appendChild(dragging);
    else taskList.insertBefore(dragging, after);
  });

  // update icons (lucide)
  try{ window.lucide && lucide.createIcons(); }catch(e){}
}

// helper to find element after drag position
function getDragAfterElement(container, y){
  const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset) return {offset, element: child};
    return closest;
  }, {offset: Number.NEGATIVE_INFINITY}).element;
}

// === CRUD ===
function addTask(obj){
  obj.id = uid();
  obj.createdAt = Date.now();
  tasks.push(obj);
  save();
  renderAll();
  scheduleReminderForTask(obj);
}
function updateTask(id, data){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx !== -1){
    tasks[idx] = {...tasks[idx], ...data};
    save(); renderAll();
  }
}
function deleteTask(id){
  // clear reminders
  if(reminderTimers[id]){ clearTimeout(reminderTimers[id]); delete reminderTimers[id]; }
  tasks = tasks.filter(t => t.id !== id);
  save(); renderAll();
}
function toggleComplete(id){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx === -1) return;
  tasks[idx].completed = !tasks[idx].completed;
  save(); renderAll();
}

// === Stats & progress ===
function updateStats(){
  statTotal.textContent = tasks.length;
  statDone.textContent = tasks.filter(t=>t.completed).length;
  statToday.textContent = tasks.filter(t=> isToday(t.due) ).length;
  // progress ring
  const total = tasks.length;
  const done = tasks.filter(t=>t.completed).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  progressPct.textContent = pct + '%';
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * pct / 100);
  progressFill.style.strokeDashoffset = offset;
}

// === Reminders ===
// Schedules a reminder for a single task. If confirmNow true, ask user for when to remind (now for demo) - here we schedule at the due time.
function scheduleReminderForTask(task, showPrompt=false){
  // Clear previous
  if(!task || !task.id) return;
  if(reminderTimers[task.id]) { clearTimeout(reminderTimers[task.id]); delete reminderTimers[task.id]; }
  if(!task.due) return; // nothing to schedule

  const dueMs = new Date(task.due).getTime();
  const now = Date.now();
  const ms = dueMs - now;
  if(ms <= 0) { alert('Due date already passed — you can set a new due time.'); return; }

  // request permission
  if('Notification' in window && Notification.permission !== 'granted'){
    Notification.requestPermission();
  }

  // schedule
  reminderTimers[task.id] = setTimeout(() => {
    // show browser notification if allowed
    if('Notification' in window && Notification.permission === 'granted'){
      new Notification('Study Reminder', { body: `${task.subject} — ${task.title}\nDue now (${fmt(task.due)})`, tag: task.id });
    } else {
      alert(`Reminder: ${task.subject} — ${task.title} (due now)`);
    }
    delete reminderTimers[task.id];
  }, ms);
}

// schedule reminders for all tasks on load
function scheduleAllReminders(){
  // clear existing
  for(const k in reminderTimers){ clearTimeout(reminderTimers[k]); }
  reminderTimers = {};
  tasks.forEach(t => {
    if(t.due && !t.completed) scheduleReminderForTask(t);
  });
}

// === Export / Import ===
btnExport.addEventListener('click', exportTasks);
btnExport2 && btnExport2.addEventListener('click', exportTasks);
function exportTasks(){
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'ssp_tasks_export.json'; a.click(); URL.revokeObjectURL(url);
}
importFile.addEventListener('change', handleImport);
btnImport.addEventListener('click', ()=> importFile.click());
function handleImport(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try{
      const imported = JSON.parse(evt.target.result);
      if(Array.isArray(imported)){
        // basic validation of objects
        tasks = imported.map(it => ({ ...it }));
        save();
        renderAll();
        scheduleAllReminders();
        alert('Import successful');
      } else alert('Invalid file format');
    } catch(err){ alert('Failed to import: ' + err.message); }
  };
  reader.readAsText(file);
}

// === Pomodoro simple ===
let pom = { running:false, timerId:null, workMs:25*60*1000, breakMs:5*60*1000, remaining:25*60*1000, mode:'work', selectedId:null };
function updatePomOptions(){
  const html = ['<option value="">-- Select task --</option>'].concat(tasks.map(t=>`<option value="${t.id}">${escapeHtml(t.title)} ${t.subject? ' — ' + escapeHtml(t.subject): ''}</option>`)).join('');
  if(pomTaskSelect) pomTaskSelect.innerHTML = html;
}
function selectPomTask(id){
  pom.selectedId = id;
  const task = tasks.find(t=>t.id===id);
  pomTitle.textContent = task ? task.title : 'Select a task to start';
}
pomTaskSelect && pomTaskSelect.addEventListener('change', e => selectPomTask(e.target.value));
pomStart.addEventListener('click', () => {
  if(!pom.selectedId){ alert('Choose a task to focus'); return; }
  if(pom.running) return;
  pom.running = true;
  pom.mode = 'work';
  pom.remaining = pom.workMs;
  pomTick();
  pom.timerId = setInterval(pomTick, 1000);
});
pomStop.addEventListener('click', () => {
  if(pom.timerId) clearInterval(pom.timerId);
  pom.running = false;
  pom.timerId = null;
  pomTimerEl.textContent = '25:00';
});

function pomTick(){
  pom.remaining -= 1000;
  if(pom.remaining < 0){
    // switch mode
    if(pom.mode === 'work'){ pom.mode = 'break'; pom.remaining = pom.breakMs; notify('Pomodoro', 'Work complete — break started'); }
    else { pom.mode = 'work'; pom.remaining = pom.workMs; notify('Pomodoro', 'Break complete — back to work'); }
  }
  pomTimerEl.textContent = formatMs(pom.remaining);
}
function formatMs(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  const m = Math.floor(s/60); const sec = s%60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// basic notification helper
function notify(title, body){
  if('Notification' in window && Notification.permission === 'granted'){
    new Notification(title, { body });
  } else {
    // fallback alert
    console.log('Notify:', title, body);
  }
}

// === Helpers & events ===
searchInput.addEventListener('input', renderTasks);
filterPriority.addEventListener('change', renderTasks);

// delete all / clear completed
document.getElementById('btnClearCompleted').addEventListener('click', ()=>{
  if(!confirm('Clear all completed tasks?')) return;
  tasks = tasks.filter(t=>!t.completed);
  save(); renderAll();
});
document.getElementById('btnDeleteAll').addEventListener('click', ()=>{
  if(!confirm('Delete ALL tasks? This cannot be undone.')) return;
  tasks = []; save(); renderAll();
});

// reorder persistence: when user finishes dragging, capture order
taskList.addEventListener('drop', () => {
  // rebuild tasks order from DOM
  const ids = [...taskList.querySelectorAll('.task-card')].map(el => el.dataset.id);
  if(ids && ids.length){
    const map = Object.fromEntries(tasks.map(t=>[t.id,t]));
    tasks = ids.map(id => map[id]).filter(Boolean);
    save();
    renderAll();
  }
});

// listen for page visibility to reschedule if needed
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') scheduleAllReminders();
});

// helper escape
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// show detail by selecting for edit
function selectPomFromTask(id){
  pomTaskSelect.value = id;
  selectPomTask(id);
}

// update pom options initial
updatePomOptions();

// === Render helpers ===
function renderTasks(){
  // If user has dragged, tasks array may update on drop; we sort by tasks order
  taskList.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  const pfilter = filterPriority.value;

  const visible = tasks.filter(t => {
    if(pfilter && t.priority !== pfilter) return false;
    if(q){
      const hay = (t.title + ' ' + t.subject + ' ' + (t.notes||'') + ' ' + (t.subtasks||[]).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(visible.length === 0){
    const empty = document.createElement('div'); empty.className = 'card muted'; empty.textContent = 'No tasks to show.';
    taskList.appendChild(empty); updateStats(); return;
  }

  visible.forEach(t => {
    const el = createTaskCard(t);
    taskList.appendChild(el);
  });

  // update lucide icons
  try{ window.lucide && lucide.createIcons(); }catch(e){}
  updateStats();
}
function updateStats(){
  statTotal.textContent = tasks.length;
  statDone.textContent = tasks.filter(t=>t.completed).length;
  statToday.textContent = tasks.filter(t=> isToday(t.due) ).length;
  // progress
  const total = tasks.length;
  const done = tasks.filter(t=>t.completed).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  progressPct.textContent = pct + '%';
  const r = 52;
  const circumference = 2 * Math.PI * r;
  progressFill.style.strokeDasharray = String(circumference);
  progressFill.style.strokeDashoffset = String(circumference - (circumference * pct / 100));
  updatePomOptions();
}
function updatePomOptions(){ 
  if(!pomTaskSelect) return;
  const opts = [ '<option value="">-- Select task --</option>' ].concat(tasks.map(t => `<option value="${t.id}">${escapeHtml(t.title)} ${t.subject ? ' — ' + escapeHtml(t.subject) : ''}</option>`));
  pomTaskSelect.innerHTML = opts.join('');
}

// show one-time schedule for a task (with optional immediate scheduling prompt)
function scheduleReminderForTask(task, promptNow=false){
  // already defined earlier; keep consistent
  // we reschedule by clearing existing timer
  if(reminderTimers[task.id]){ clearTimeout(reminderTimers[task.id]); delete reminderTimers[task.id]; }
  if(!task.due) { alert('Task has no due date set. Set a due date to schedule reminders.'); return; }
  const ms = new Date(task.due).getTime() - Date.now();
  if(ms <= 0){ alert('Due date already passed. Choose a future time.'); return; }
  if('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
  reminderTimers[task.id] = setTimeout(()=> {
    if('Notification' in window && Notification.permission === 'granted'){
      new Notification('Study Reminder', { body: `${task.subject} — ${task.title}\nDue now (${fmt(task.due)})`, tag: task.id });
    } else {
      alert(`Reminder: ${task.subject} — ${task.title} (due now)`);
    }
    delete reminderTimers[task.id];
  }, ms);
  alert('Reminder scheduled. Tab must remain open for this reminder to fire.');
}

// schedule reminders for all tasks (called on load)
scheduleAllReminders();

// === Drag & Drop note
// We already attach dragstart/dragend handlers to each card and reorder on drop event listener over taskList.

// === Final helpers: renderAll called initially and after updates ===
function renderAll(){ renderTasks(); updateStats(); updatePomOptions(); }
