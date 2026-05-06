// ============================================================
// DUSKIN 報價產生器 - 瀏覽器端 UI 邏輯
// ============================================================
'use strict';

const STORAGE_KEY = 'duskin_quote_state';
const TEMPLATES_KEY = 'duskin_quote_templates';

let engine = null;
let catalog = null;
let state = blankState();
let modalContext = null;  // 開啟商品選單時暫存當前 item ref

// ============================================================
// 啟動
// ============================================================
async function init() {
  try {
    const res = await fetch('../catalog.json');
    catalog = await res.json();
  } catch (e) {
    showToast('無法載入 catalog.json: ' + e.message, 'error');
    return;
  }
  engine = QuoteEngine.create(catalog);
  if (typeof QuoteBuilder !== 'undefined' && QuoteBuilder.setEngine) {
    QuoteBuilder.setEngine(engine);
  }

  // 載入上次未存的草稿
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { state = JSON.parse(saved); } catch (e) {}
  }
  if (!state.areas || state.areas.length === 0) {
    state.areas = [makeBlankArea()];
  }

  bindEvents();
  render();
  setDefaultDate();
}

function blankState() {
  return {
    client: '',
    version: '',
    date: '',
    customerInfo: { taxId: '', contact: '', phone: '', address: '' },
    displayCycle: '4W',
    discount: '',
    roundTotalToHundred: false,
    showLocation: true,
    showStamp: true,
    showCustomerNumber: true,
    extraNotes: '',
    areas: [makeBlankArea()]
  };
}

function makeBlankArea() {
  return { name: '商品明細', discount: '', items: [makeBlankItem()] };
}

function makeBlankItem() {
  return { code: '', qty: 1, loc: '', priceOverride: '', displayCycle: '' };
}

function setDefaultDate() {
  if (!state.date) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    state.date = `${yyyy}/${mm}/${dd}`;
    document.getElementById('date').value = state.date;
  }
}

// ============================================================
// 事件繫結
// ============================================================
function bindEvents() {
  // 客戶資料 / 全域設定
  bindInput('client');
  bindInput('version');
  bindInput('date');
  bindInput('taxId', 'customerInfo.taxId');
  bindInput('contact', 'customerInfo.contact');
  bindInput('customerPhone', 'customerInfo.phone');
  bindInput('customerAddress', 'customerInfo.address');
  bindInput('displayCycle');
  bindInput('discount');
  bindCheckbox('roundTotalToHundred');
  bindCheckbox('showLocation');
  bindCheckbox('showStamp');
  bindCheckbox('showCustomerNumber');
  bindInput('extraNotes');

  document.getElementById('btn-add-area').addEventListener('click', () => {
    state.areas.push(makeBlankArea());
    persist();
    render();
  });

  document.getElementById('btn-preview').addEventListener('click', onPreview);
  document.getElementById('btn-download').addEventListener('click', onDownload);
  document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
  document.getElementById('btn-load').addEventListener('click', onLoadTemplate);
  document.getElementById('btn-clear').addEventListener('click', onClear);

  document.getElementById('modal-close').addEventListener('click', closeProductModal);
  document.getElementById('product-search').addEventListener('input', renderProductList);
  document.getElementById('product-modal').addEventListener('click', (e) => {
    if (e.target.id === 'product-modal') closeProductModal();
  });

  document.getElementById('template-close').addEventListener('click', closeTemplateModal);
  document.getElementById('template-close-bottom').addEventListener('click', closeTemplateModal);
  document.getElementById('template-modal').addEventListener('click', (e) => {
    if (e.target.id === 'template-modal') closeTemplateModal();
  });

  // ESC 鍵關閉彈窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProductModal();
      closeTemplateModal();
    }
  });
}

function bindInput(id, statePath) {
  const el = document.getElementById(id);
  if (!el) return;
  const path = statePath || id;
  el.value = getStateAt(path) || '';
  el.addEventListener('input', () => {
    setStateAt(path, el.value);
    persist();
  });
}

function bindCheckbox(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!state[id];
  el.addEventListener('change', () => {
    state[id] = el.checked;
    persist();
  });
}

function getStateAt(path) {
  const parts = path.split('.');
  let cur = state;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setStateAt(path, val) {
  const parts = path.split('.');
  let cur = state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// ============================================================
// 區域與品項渲染
// ============================================================
function render() {
  document.getElementById('client').value = state.client || '';
  document.getElementById('version').value = state.version || '';
  document.getElementById('date').value = state.date || '';
  document.getElementById('taxId').value = state.customerInfo?.taxId || '';
  document.getElementById('contact').value = state.customerInfo?.contact || '';
  document.getElementById('customerPhone').value = state.customerInfo?.phone || '';
  document.getElementById('customerAddress').value = state.customerInfo?.address || '';
  document.getElementById('displayCycle').value = state.displayCycle || '';
  document.getElementById('discount').value = state.discount || '';
  document.getElementById('extraNotes').value = state.extraNotes || '';
  document.getElementById('roundTotalToHundred').checked = !!state.roundTotalToHundred;
  document.getElementById('showLocation').checked = state.showLocation !== false;
  document.getElementById('showStamp').checked = state.showStamp !== false;
  document.getElementById('showCustomerNumber').checked = state.showCustomerNumber !== false;

  renderAreas();
}

function renderAreas() {
  const container = document.getElementById('areas');
  container.innerHTML = '';
  state.areas.forEach((area, ai) => {
    container.appendChild(renderArea(area, ai));
  });
}

function renderArea(area, ai) {
  const div = document.createElement('div');
  div.className = 'area';

  // Header
  const header = document.createElement('div');
  header.className = 'area-header';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '區域名稱';
  nameInput.value = area.name || '';
  nameInput.addEventListener('input', () => {
    area.name = nameInput.value;
    persist();
  });

  const discInput = document.createElement('input');
  discInput.type = 'number';
  discInput.step = '0.01';
  discInput.min = '0';
  discInput.max = '1';
  discInput.placeholder = '折扣';
  discInput.className = 'area-discount';
  discInput.title = '區域折扣（例：0.8 = 8 折）';
  discInput.value = area.discount || '';
  discInput.addEventListener('input', () => {
    area.discount = discInput.value;
    persist();
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-icon danger';
  removeBtn.textContent = '✕';
  removeBtn.title = '刪除區域';
  removeBtn.addEventListener('click', () => {
    if (state.areas.length === 1) {
      showToast('至少需要一個區域', 'error');
      return;
    }
    if (!confirm(`刪除區域「${area.name}」？`)) return;
    state.areas.splice(ai, 1);
    persist();
    render();
  });

  header.appendChild(nameInput);
  header.appendChild(discInput);
  header.appendChild(removeBtn);
  div.appendChild(header);

  // Items
  area.items.forEach((item, ii) => {
    div.appendChild(renderItem(item, area, ii));
  });

  // Add item button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-secondary';
  addBtn.style.marginTop = '6px';
  addBtn.textContent = '＋ 新增品項';
  addBtn.addEventListener('click', () => {
    area.items.push(makeBlankItem());
    persist();
    render();
  });
  div.appendChild(addBtn);

  return div;
}

function renderItem(item, area, ii) {
  const div = document.createElement('div');
  div.className = 'item';

  const main = document.createElement('div');
  main.className = 'item-main';

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'item-pick' + (item.code ? '' : ' empty');
  if (item.code && catalog.products[item.code]) {
    const p = catalog.products[item.code];
    pickBtn.innerHTML = `<span class="code">${item.code}</span>${escapeHtml(p.name)}` +
                        `<span class="price">${p.cycle} / 單價 ${p.price}</span>`;
  } else {
    pickBtn.textContent = '👉 點此選擇商品';
  }
  pickBtn.addEventListener('click', () => openProductModal(item));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-icon danger';
  removeBtn.textContent = '✕';
  removeBtn.title = '刪除品項';
  removeBtn.addEventListener('click', () => {
    if (area.items.length === 1) {
      showToast('每個區域至少需要一個品項', 'error');
      return;
    }
    area.items.splice(ii, 1);
    persist();
    render();
  });

  main.appendChild(pickBtn);
  main.appendChild(removeBtn);
  div.appendChild(main);

  // Item fields
  const fields = document.createElement('div');
  fields.className = 'item-fields';

  fields.appendChild(makeField('數量', 'number', item.qty, (v) => {
    item.qty = parseInt(v, 10) || 1;
    persist();
  }, { min: 1 }));

  fields.appendChild(makeField('位置', 'text', item.loc || '', (v) => {
    item.loc = v;
    persist();
  }, { placeholder: '可選，例：大門口' }));

  fields.appendChild(makeField('特殊單價', 'number', item.priceOverride || '', (v) => {
    item.priceOverride = v === '' ? '' : Number(v);
    persist();
  }, { placeholder: '依顯示週期', step: 'any' }));

  const cycleWrap = document.createElement('label');
  cycleWrap.textContent = '此項顯示週期';
  const cycleSel = document.createElement('select');
  ['', '2W', '4W'].forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v || '隨全域';
    if ((item.displayCycle || '') === v) o.selected = true;
    cycleSel.appendChild(o);
  });
  cycleSel.addEventListener('change', () => {
    item.displayCycle = cycleSel.value;
    persist();
  });
  cycleWrap.appendChild(cycleSel);
  fields.appendChild(cycleWrap);

  div.appendChild(fields);

  return div;
}

function makeField(label, type, value, onChange, attrs) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value == null ? '' : value;
  if (attrs) {
    for (const k in attrs) input[k] = attrs[k];
  }
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================================
// 商品選擇彈窗
// ============================================================
function openProductModal(item) {
  modalContext = item;
  document.getElementById('product-search').value = '';
  renderProductList();
  document.getElementById('product-modal').hidden = false;
}

function closeProductModal() {
  document.getElementById('product-modal').hidden = true;
  modalContext = null;
}

function renderProductList() {
  const q = document.getElementById('product-search').value.trim().toLowerCase();
  const list = document.getElementById('product-list');
  list.innerHTML = '';

  // 依 category 分組
  const byCat = {};
  for (const code in catalog.products) {
    const p = catalog.products[code];
    const text = `${code} ${p.name} ${p.size || ''} ${p.color || ''}`.toLowerCase();
    if (q && !text.includes(q)) continue;
    const cat = p.category || 'other';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push({ code, ...p });
  }

  let total = 0;
  for (const cat in byCat) {
    const catLabel = catalog.categories[cat] || cat;
    const head = document.createElement('div');
    head.className = 'product-category';
    head.textContent = catLabel;
    list.appendChild(head);

    for (const p of byCat[cat]) {
      total++;
      const row = document.createElement('div');
      row.className = 'product-item';
      row.innerHTML = `
        <div class="pinfo">
          <div class="pname"><strong>${p.code}</strong> ${escapeHtml(p.name)}</div>
          <div class="pmeta">${[p.size, p.color, p.cycle].filter(Boolean).join(' · ')}</div>
        </div>
        <div class="pprice">$${p.price ?? '—'}</div>
      `;
      row.addEventListener('click', () => {
        if (modalContext) {
          modalContext.code = p.code;
          persist();
          render();
        }
        closeProductModal();
      });
      list.appendChild(row);
    }
  }

  if (total === 0) {
    list.innerHTML = '<div class="template-empty">沒有符合的商品</div>';
  }
}

// ============================================================
// 範本（多客戶儲存）
// ============================================================
function loadTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}');
  } catch (e) { return {}; }
}

function saveTemplates(t) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
}

function onSaveAs() {
  const name = prompt('範本名稱（建議用客戶+版本）：',
    (state.client || '未命名') + (state.version ? '_' + state.version : ''));
  if (!name) return;
  const templates = loadTemplates();
  templates[name] = { savedAt: new Date().toISOString(), config: deepClone(state) };
  saveTemplates(templates);
  showToast(`已儲存範本「${name}」`, 'success');
}

function onLoadTemplate() {
  const templates = loadTemplates();
  const list = document.getElementById('template-list');
  list.innerHTML = '';
  const names = Object.keys(templates).sort();
  if (names.length === 0) {
    list.innerHTML = '<div class="template-empty">尚未儲存任何範本</div>';
  } else {
    for (const name of names) {
      const t = templates[name];
      const row = document.createElement('div');
      row.className = 'template-item';
      const info = document.createElement('div');
      info.className = 'tinfo';
      info.innerHTML = `
        <div class="tname">${escapeHtml(name)}</div>
        <div class="tmeta">${escapeHtml((t.config.client || '') + (t.config.version ? ' · ' + t.config.version : ''))} · ${formatDate(t.savedAt)}</div>
      `;
      const actions = document.createElement('div');
      actions.className = 'tactions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-icon';
      loadBtn.textContent = '↓';
      loadBtn.title = '載入此範本';
      loadBtn.addEventListener('click', () => {
        state = deepClone(t.config);
        persist();
        render();
        closeTemplateModal();
        showToast(`已載入「${name}」`, 'success');
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-icon danger';
      delBtn.textContent = '✕';
      delBtn.title = '刪除';
      delBtn.addEventListener('click', () => {
        if (!confirm(`刪除範本「${name}」？`)) return;
        delete templates[name];
        saveTemplates(templates);
        onLoadTemplate();
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);
      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    }
  }
  document.getElementById('template-modal').hidden = false;
}

function closeTemplateModal() {
  document.getElementById('template-modal').hidden = true;
}

function onClear() {
  if (!confirm('清空目前所有輸入？（已儲存的範本不受影響）')) return;
  state = blankState();
  persist();
  render();
  setDefaultDate();
  showToast('已清空', 'success');
}

// ============================================================
// 預覽 / 下載
// ============================================================
function buildConfig() {
  const cfg = {
    client: state.client?.trim(),
    version: state.version?.trim() || undefined,
    date: state.date?.trim(),
    customerInfo: {
      taxId: state.customerInfo?.taxId || undefined,
      contact: state.customerInfo?.contact || undefined,
      phone: state.customerInfo?.phone || undefined,
      address: state.customerInfo?.address || undefined,
    },
    showLocation: state.showLocation !== false,
    showStamp: state.showStamp !== false,
    showCustomerNumber: state.showCustomerNumber !== false,
  };

  if (state.displayCycle) cfg.displayCycle = state.displayCycle;
  if (state.discount !== '' && state.discount != null) {
    const d = Number(state.discount);
    if (!Number.isNaN(d) && d > 0 && d <= 1) cfg.discount = d;
  }
  if (state.roundTotalToHundred) cfg.roundTotalToHundred = true;

  if (state.extraNotes && state.extraNotes.trim()) {
    cfg.extraNotes = state.extraNotes.split('\n').map(s => s.trim()).filter(Boolean);
  }

  // 多區還是單區
  const validAreas = state.areas.map(a => ({
    name: a.name || '商品明細',
    discount: (a.discount !== '' && a.discount != null && !Number.isNaN(Number(a.discount)))
      ? Number(a.discount) : undefined,
    items: a.items.filter(it => it.code).map(it => {
      const out = { code: it.code, qty: parseInt(it.qty, 10) || 1 };
      if (it.loc) out.loc = it.loc;
      if (it.priceOverride !== '' && it.priceOverride != null) {
        out.priceOverride = Number(it.priceOverride);
      }
      if (it.displayCycle) out.displayCycle = it.displayCycle;
      return out;
    })
  })).filter(a => a.items.length > 0);

  if (validAreas.length === 0) {
    throw new Error('請至少加入一筆商品');
  }

  if (validAreas.length === 1) {
    cfg.areaName = validAreas[0].name;
    cfg.items = validAreas[0].items;
    if (validAreas[0].discount != null) {
      // 單區的 area.discount 透過頂層 discount 不準確，改放回 areas[]
      cfg.areas = [validAreas[0]];
      delete cfg.items;
      delete cfg.areaName;
    }
  } else {
    cfg.areas = validAreas;
  }

  return cfg;
}

function validate() {
  if (!state.client?.trim()) throw new Error('請輸入客戶名稱');
  if (!state.date?.trim()) throw new Error('請輸入報價日期');
}

function onPreview() {
  try {
    validate();
    const cfg = buildConfig();
    const text = engine.previewText(cfg);
    document.getElementById('preview-output').textContent = text;
    document.getElementById('preview-card').hidden = false;
    document.getElementById('preview-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function onDownload() {
  const btn = document.getElementById('btn-download');
  btn.disabled = true;
  btn.textContent = '產生中...';
  try {
    validate();
    const cfg = buildConfig();
    const blob = await QuoteBuilder.buildBlob(cfg);
    const fname = makeFilename(cfg);
    triggerDownload(blob, fname);
    showToast(`已下載 ${fname}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 下載 Word';
  }
}

function makeFilename(cfg) {
  const safe = (s) => String(s || '').replace(/[\s\/\\:*?"<>|]/g, '');
  const versionSuffix = cfg.version ? `_${safe(cfg.version)}` : '';
  return `報價單_${safe(cfg.client)}${versionSuffix}.docx`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

// ============================================================
// Helpers
// ============================================================
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', { hour12: false });
  } catch (e) { return iso; }
}

function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2400);
}

// 註冊 service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

init();
