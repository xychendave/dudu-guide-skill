import {validatePack, planRoute, currentFacts, agentPrompt, journalMarkdown, validateJournalRecords, mergeJournalBackup} from './core.mjs';
const $ = id => document.getElementById(id);
let pack, records = [], activePlan, toastTimer, storageKey;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function toast(message) { $('toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000); }
function validateRecords(value) {
  return validateJournalRecords(pack, value);
}
function saveRecords(next) {
  validateRecords(next);
  localStorage.setItem(storageKey, JSON.stringify(next));
  records = next;
  renderRecords();
}
function download(name, value, type) {
  const url = URL.createObjectURL(new Blob([value], {type}));
  const a = el('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function drawMap() {
  const svg = $('park-map'); svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const add = (tag, attributes, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    svg.append(node); return node;
  };
  add('title', {}, `${pack.name} · 地点关系示意图`);
  const byId = Object.fromEntries(pack.nodes.map(n => [n.id, n]));
  const line = (a, b, className) => add('line', {x1:a.x, y1:a.y, x2:b.x, y2:b.y, class:className});
  for (const e of pack.edges) if (!e.closed) line(byId[e.from], byId[e.to], 'edge');
  if (activePlan?.feasible) for (const item of [...activePlan.stops, activePlan.exit_walk]) {
    for (let i = 1; i < item.path.length; i++) line(byId[item.path[i-1]], byId[item.path[i]], 'route-edge');
  }
  for (const n of pack.nodes) {
    add('circle', {cx:n.x, cy:n.y, r:n.kind === 'gate' ? 2 : 3.1, class:n.kind === 'gate' ? 'gate' : 'node'});
    add('text', {x:n.x, y: n.y + 6.5}, n.name);
  }
}
function renderRoute() {
  const root = $('route'); root.replaceChildren();
  if (!activePlan.feasible) { root.append(el('p', activePlan.warning, 'callout')); drawMap(); return; }
  root.append(el('div', `预计 ${activePlan.total_minutes} 分钟 · ${activePlan.stops.length} 站 · 含 ${activePlan.reserve_minutes} 分钟缓冲`, 'route-summary'));
  const list = el('ol', undefined, 'route-list');
  activePlan.stops.forEach((stop, index) => {
    const venue = pack.nodes.find(n => n.id === stop.id);
    const li = el('li', undefined, 'route-stop'), content = el('div');
    content.append(el('strong', venue.name), el('small', `步行约 ${stop.walk_minutes} 分钟 · 停留 ${stop.stay_minutes} 分钟${venue.status === 'unknown' ? ' · 开放状态待核实' : ''}`));
    const button = el('button', '我到了'); button.type = 'button';
    button.addEventListener('click', () => { $('venue').value = stop.id; $('start').value = stop.id; renderGuide(); $('guide').scrollIntoView({behavior:'smooth'}); });
    li.append(el('span', String(index+1).padStart(2,'0'), 'number'), content, button); list.append(li);
  });
  root.append(list, el('p', `离园步行约 ${activePlan.exit_walk.minutes} 分钟。${activePlan.warning}`, 'quiet'));
  if (activePlan.skipped.length) root.append(el('p', `本次暂未安排：${activePlan.skipped.map(id => pack.nodes.find(n => n.id === id).name).join('、')}。可延长时间或减少其他选择。`, 'quiet'));
  drawMap();
}
function renderGuide() {
  const venue = pack.nodes.find(n => n.id === $('venue').value);
  const root = $('guide-content'); root.replaceChildren();
  $('alternative').hidden = true;
  $('prompt-fallback').hidden = true;
  $('record-venue').textContent = venue.name;
  root.append(el('h3', venue.name));
  if (venue.status !== 'open') root.append(el('p', venue.status === 'closed' ? '地点包将此处标记为关闭，请勿前往。' : '开放状态待现场核实。', 'callout'));
  const facts = currentFacts(pack, venue.id);
  for (const fact of facts.slice(0, 3)) root.append(el('p', fact.text, 'guide-copy'));
  if (!facts.length) root.append(el('p', '这站还没有可用的故事资料。先看看现场展板，把问题留给有来源的回答。', 'guide-copy'));
  const observations = el('div', undefined, 'observation'); observations.append(el('strong', '试着发现'));
  for (const prompt of venue.observation_prompts) observations.append(el('p', prompt));
  root.append(observations);
  const sources = el('p', undefined, 'source'); sources.append(document.createTextNode('资料来源：'));
  const usedSources = pack.sources.filter(s => facts.slice(0,3).some(f => f.source_ids.includes(s.id)));
  for (const source of usedSources) {
    const link = source.url ? el('a', source.title) : el('span', source.title);
    if (source.url) { link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    sources.append(link, document.createTextNode(`（资料检查日期 ${source.checked_on}） `));
  }
  if (!usedSources.length) sources.append(document.createTextNode('暂无。观察提示是活动建议，不是物种事实。'));
  root.append(sources);
  $('questions').replaceChildren();
  for (const question of ['这里最值得观察的是什么？', '这个空间为什么这样设计？', '这里有哪些有来源的保育故事？']) {
    const button = el('button', `${question} ↗`); button.type = 'button';
    button.addEventListener('click', () => { $('question').value = question; copyPrompt(); });
    $('questions').append(button);
  }
}
async function copyPrompt() {
  const prompt = agentPrompt(pack, $('venue').value, $('question').value.trim() || '这里最值得观察的是什么？', {remaining_minutes: Number($('minutes').value), note: '时间为手动输入，不是自动计时。'});
  // Always expose the exact text, including when clipboard access is unavailable.
  $('prompt-fallback').value = prompt; $('prompt-fallback').hidden = false;
  try { await navigator.clipboard.writeText(prompt); toast('已复制。粘贴到你的 Agent，继续聊聊这一站。'); }
  catch { $('prompt-fallback').focus(); $('prompt-fallback').select(); toast('请从展开的文本框手动复制问题与资料。'); }
}
function renderRecords() {
  $('count').textContent = records.length;
  $('records').replaceChildren();
  if (!records.length) $('records').append(el('p', '今天的第一条发现，等你写下。', 'empty'));
  for (const r of [...records].reverse()) {
    const card = el('article', undefined, 'record');
    card.append(el('p', r.seen ? 'A LITTLE ENCOUNTER / 看见了' : 'STILL A DISCOVERY / 暂未遇见', 'eyebrow'), el('h3', r.venue_name), el('p', r.note || '这次先记下到访。'), el('small', new Date(r.recorded_at).toLocaleString()));
    const button = el('button', '删除'); button.type = 'button';
    button.addEventListener('click', () => {
      if (window.confirm('删除这条本地记录？如果需要保留，请先导出备份。')) {
        try { saveRecords(records.filter(item => item.id !== r.id)); toast('已删除这条记录。'); }
        catch { toast('浏览器存储不可用，记录未删除。'); }
      }
    });
    card.append(button); $('records').append(card);
  }
}
async function start() {
  const response = await fetch('./pack.json');
  if (!response.ok) throw new Error('无法读取 pack.json');
  pack = await response.json();
  const errors = validatePack(pack); if (errors.length) throw new Error(errors.join('；'));
  storageKey = `dudu:${pack.id}:v1`;
  document.title = `${pack.name} · Dudu 游园搭子`;
  $('park-name').textContent = pack.name; $('description').textContent = pack.description; $('map-note').textContent = pack.map_note;
  $('mode-label').textContent = pack.mode === 'demo' ? '虚构园区 · 演示模式' : '个人游园工作台 · 现场信息请核实';
  for (const node of pack.nodes) {
    const option = () => { const o = el('option', node.name); o.value = node.id; return o; };
    $('start').append(option());
    if (node.kind === 'gate') $('exit').append(option());
    if (node.kind === 'venue') {
      $('venue').append(option());
      const label = el('label'), input = el('input'); input.type = 'checkbox'; input.value = node.id; input.checked = node.status !== 'closed'; input.disabled = node.status === 'closed';
      label.append(input, document.createTextNode(node.name)); $('interests').append(label);
    }
  }
  $('exit').value = pack.nodes.filter(n => n.kind === 'gate').at(-1).id;
  try { records = validateRecords(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
  catch { toast('本地记录无法读取。原始存储未改动；请先检查或导出浏览器中的数据。'); $('record-form').querySelector('button').disabled = true; }
  drawMap(); renderGuide(); renderRecords();
  $('plan-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      activePlan = planRoute(pack, {start:$('start').value, exit:$('exit').value, minutes:Number($('minutes').value), reserve:Number($('reserve').value), accessible:$('accessible').checked, selected:[...$('interests').querySelectorAll('input:checked')].map(n => n.value), visited:records.filter(r => new Date(r.recorded_at).toDateString() === new Date().toDateString()).map(r => r.venue_id)});
      renderRoute();
    } catch (error) { toast(error.message); }
  });
  $('venue').addEventListener('change', () => { $('start').value = $('venue').value; renderGuide(); });
  $('not-seen').addEventListener('click', () => { $('alternative').textContent = pack.nodes.find(n => n.id === $('venue').value).not_seen; $('alternative').hidden = false; $('seen').value = 'no'; });
  $('copy-prompt').addEventListener('click', copyPrompt);
  $('record-form').addEventListener('submit', event => {
    event.preventDefault();
    const venue = pack.nodes.find(n => n.id === $('venue').value);
    try {
      saveRecords([...records, {id:crypto.randomUUID(), venue_id:venue.id, venue_name:venue.name, note:$('note').value.trim(), seen:$('seen').value === 'yes', recorded_at:new Date().toISOString()}]);
      $('note').value = ''; toast('已收进手帐。更新剩余时间后，可以重新规划。');
    } catch { toast('记录未保存。浏览器存储不可用或已满；请先导出备份。'); }
  });
  $('export-md').addEventListener('click', () => download(`${pack.id}-journal.md`, journalMarkdown(pack, records), 'text/markdown;charset=utf-8'));
  $('export-json').addEventListener('click', () => download(`${pack.id}-backup.json`, JSON.stringify({schema_version:1, park_id:pack.id, records}, null, 2), 'application/json'));
  $('import-json').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('备份文件不能超过 5 MB');
      const value = JSON.parse(await file.text());
      saveRecords(mergeJournalBackup(pack, records, value)); toast('已合并导入备份。');
    } catch (error) { toast(`未导入：${error.message}`); }
    finally { event.target.value = ''; }
  });
}
start().catch(error => { $('mode-label').textContent = '工作台未能启动'; $('description').textContent = error.message; toast('请用本地服务器打开页面，并检查地点包格式。'); });
