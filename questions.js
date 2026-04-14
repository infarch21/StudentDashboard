/**
 * questions.js — Question rendering & interaction module
 * Requires globals from index.html: STATE, lockAndContinue, flash, esc
 */

/* ── Inject question-specific CSS ────────────────────────────── */
(function injectStyles() {
  const css = `
    /* ── Ordering arrows (mobile/fallback) ── */
    .order-arrows {
      display:flex;flex-direction:column;gap:2px;
      margin-left:auto;flex-shrink:0;
    }
    .order-arrow-btn {
      width:28px;height:28px;
      background:rgba(121,158,255,0.1);
      border:1.5px solid rgba(121,158,255,0.25);
      border-radius:6px;
      color:var(--text-2);font-size:13px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      transition:background .15s,border-color .15s;
      user-select:none;-webkit-user-select:none;
      touch-action:manipulation;
    }
    .order-arrow-btn:hover:not(:disabled) { background:rgba(121,158,255,0.22);border-color:var(--accent); }
    .order-arrow-btn:disabled { opacity:0.25;cursor:not-allowed; }

    /* Hide arrows on real pointer devices (show handle instead) */
    @media (hover:hover) and (pointer:fine) {
      .order-arrows { display:none; }
    }
    /* Always show arrows on touch devices */
    @media (hover:none) {
      .drag-handle { display:none; }
      .order-arrows { display:flex !important; }
      .order-item { cursor:default; }
    }

    .order-item.touch-lifted {
      opacity:0.5;transform:scale(0.97);
      border-color:var(--accent);
    }
    .order-item.touch-target {
      border-color:var(--accent-warm);
      background:rgba(255,222,99,0.12);
    }

    /* ── Matching SVG overlay ── */
    #match-wrap { position:relative !important; }
    #match-svg-overlay {
      position:absolute;inset:0;
      pointer-events:none;
      overflow:visible;
      z-index:5;
    }
    .match-item[data-left] { cursor:crosshair; }
    .match-item[data-left].drag-source {
      border-color:var(--accent);
      background:rgba(121,158,255,0.18);
    }
    .match-item[data-right].drop-target {
      border-color:var(--accent-warm);
      background:rgba(255,222,99,0.12);
    }
    .match-hint { font-size:12px;color:var(--text-3);margin-top:8px; }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let matchActiveLeft = null;
let multiSelected   = new Set();
let answerLocked    = false;

/* ═══════════════════════════════════════════════════════════════
   RENDER FUNCTIONS
═══════════════════════════════════════════════════════════════ */
function renderMCQ(item) {
  const keys = ['A','B','C','D','E','F'];
  return `<div class="options-grid">${
    item.options.map((o,i) =>
      `<div class="opt" data-idx="${i}" onclick="selectMCQ(this,${i})">
        <span class="opt-key">${keys[i]}</span>${esc(o)}
      </div>`
    ).join('')
  }</div>`;
}

function renderTF(item) {
  return `<div class="tf-grid">
    <div class="tf-btn" data-val="true"  onclick="selectTF(this,true)">
      <span class="tf-icon">✓</span>True
    </div>
    <div class="tf-btn" data-val="false" onclick="selectTF(this,false)">
      <span class="tf-icon">✗</span>False
    </div>
  </div>`;
}

function renderMatching(item) {
  const shuffled = [...item.pairs.map((_,i)=>i)].sort(()=>Math.random()-.5);
  return `
    <div class="match-container" id="match-wrap">
      <div>
        <p class="match-col-label">Term</p>
        <div class="match-col" id="match-left">
          ${item.pairs.map((p,i) =>
            `<div class="match-item" data-left="${i}">${esc(p.left)}</div>`
          ).join('')}
        </div>
      </div>
      <div>
        <p class="match-col-label">Definition</p>
        <div class="match-col" id="match-right">
          ${shuffled.map(i =>
            `<div class="match-item" data-right="${i}">${esc(item.pairs[i].right)}</div>`
          ).join('')}
        </div>
      </div>
    </div>
    <p class="match-hint">Click a term then click its definition — or drag from a term to connect</p>`;
}

function renderMultiSelect(item) {
  const keys = ['A','B','C','D','E','F'];
  return `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">Select all that apply</p>
    <div class="options-grid">${
      item.options.map((o,i) =>
        `<div class="opt" data-idx="${i}" onclick="toggleMulti(this,${i})">
          <span class="opt-key">${keys[i]}</span>${esc(o)}
        </div>`
      ).join('')
    }</div>
    <button onclick="submitMultiSelect()" id="btn-multi-submit" class="q-submit-btn">Confirm Selection</button>`;
}

function renderOrdering(item) {
  const ids = item.items.map((_,i)=>i).sort(()=>Math.random()-.5);
  return `
    <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">Arrange items in the correct order — drag or use ↑↓ arrows</p>
    <div class="order-list" id="order-list">
      ${ids.map((idx,pos) =>
        `<div class="order-item" draggable="true" data-idx="${idx}" id="oi-${idx}">
          <div class="drag-handle"><span></span><span></span><span></span></div>
          <span style="flex:1">${esc(item.items[idx])}</span>
          <div class="order-arrows">
            <button class="order-arrow-btn" title="Move up"   onclick="moveOrderItem(this,-1)">▲</button>
            <button class="order-arrow-btn" title="Move down" onclick="moveOrderItem(this,+1)">▼</button>
          </div>
        </div>`
      ).join('')}
    </div>
    <button onclick="submitOrdering()" id="btn-order-submit" class="q-submit-btn">Confirm Order</button>`;
}

function renderShortAnswer(item) {
  return `
    <div class="short-answer-wrap">
      <textarea id="sa-input" placeholder="Type your answer here…" maxlength="500"
        oninput="document.getElementById('sa-char').textContent=(500-this.value.length)+' characters remaining'"></textarea>
      <p class="char-count" id="sa-char">500 characters remaining</p>
    </div>
    <button onclick="submitShortAnswer()" id="btn-sa-submit" class="q-submit-btn">Submit Answer</button>`;
}

/* ═══════════════════════════════════════════════════════════════
   BIND EVENTS
═══════════════════════════════════════════════════════════════ */
function bindQuestionEvents(item) {
  answerLocked = false;
  multiSelected = new Set();
  matchActiveLeft = null;

  if (item.questionType === 'ordering') {
    bindDragDrop();
    bindTouchOrdering();
  }
  if (item.questionType === 'matching') {
    bindMatchingInteraction(item);
  }
}

/* ═══════════════════════════════════════════════════════════════
   MCQ / TF
═══════════════════════════════════════════════════════════════ */
function selectMCQ(el, idx) {
  if (answerLocked) return;
  const item = STATE.items[STATE.currentIndex];
  const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
  document.querySelectorAll('.opt').forEach(o => {
    o.classList.remove('selected','correct','incorrect');
    o.classList.add('disabled');
  });
  const isCorrect = idx === item.correctAnswer;
  el.classList.add(isCorrect ? 'correct' : 'incorrect');
  const correctEl = document.querySelector(`.opt[data-idx="${item.correctAnswer}"]`);
  if (correctEl) correctEl.classList.add('correct');
  lockAndContinue(item, idx, isCorrect, timeSecs);
}

function selectTF(el, val) {
  if (answerLocked) return;
  const item = STATE.items[STATE.currentIndex];
  const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.add('disabled'));
  const isCorrect = val === item.correctAnswer;
  el.classList.add(isCorrect ? 'correct' : 'incorrect');
  const other = document.querySelector(`.tf-btn[data-val="${item.correctAnswer}"]`);
  if (other && !isCorrect) other.classList.add('correct');
  lockAndContinue(item, val, isCorrect, timeSecs);
}

/* ═══════════════════════════════════════════════════════════════
   MATCHING — click + drag-to-connect
═══════════════════════════════════════════════════════════════ */
function ensureMatchSVG(wrap) {
  let svg = document.getElementById('match-svg-overlay');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = 'match-svg-overlay';
    wrap.appendChild(svg);
  }
  return svg;
}

function getCenterRelTo(el, container) {
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return {
    x: er.left + er.width  / 2 - cr.left,
    y: er.top  + er.height / 2 - cr.top,
  };
}

function drawConnectorPath(svg, x1, y1, x2, y2, color, id) {
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  const cx = (x1 + x2) / 2;
  path.setAttribute('d', `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('opacity', '0.85');
  if (id) path.id = id;
  svg.appendChild(path);
  return path;
}

function updateConnectorPath(path, x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2;
  path.setAttribute('d', `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
}

function bindMatchingInteraction(item) {
  const wrap = document.getElementById('match-wrap');
  if (!wrap) return;
  const svg = ensureMatchSVG(wrap);

  let tempLine = null;
  let dragSrcEl = null;
  let isDragging = false;
  let pointerId = null;

  // ── CLICK mechanic (existing) ──
  document.querySelectorAll('.match-item[data-left]').forEach(el => {
    el.addEventListener('click', () => {
      if (isDragging || answerLocked) return;
      if (el.classList.contains('matched')) return;
      document.querySelectorAll('.match-item[data-left]').forEach(m => {
        m.classList.remove('active','drag-source');
      });
      el.classList.add('active');
      matchActiveLeft = parseInt(el.dataset.left);
    });
  });

  document.querySelectorAll('.match-item[data-right]').forEach(el => {
    el.addEventListener('click', () => {
      if (isDragging || answerLocked || matchActiveLeft === null) return;
      if (el.classList.contains('matched')) return;
      processMatch(el, matchActiveLeft, item, svg, wrap);
      matchActiveLeft = null;
      document.querySelectorAll('.match-item[data-left]').forEach(m => m.classList.remove('active'));
    });
  });

  // ── DRAG mechanic (pointer events) ──
  wrap.addEventListener('pointerdown', e => {
    const leftEl = e.target.closest('.match-item[data-left]');
    if (!leftEl || answerLocked || leftEl.classList.contains('matched')) return;
    e.preventDefault();

    // deselect click-selection
    document.querySelectorAll('.match-item[data-left]').forEach(m => m.classList.remove('active'));

    isDragging = false;
    dragSrcEl = leftEl;
    pointerId = e.pointerId;

    try { wrap.setPointerCapture(e.pointerId); } catch(_) {}

    dragSrcEl.classList.add('drag-source');
    matchActiveLeft = parseInt(dragSrcEl.dataset.left);

    const from = getCenterRelTo(dragSrcEl, wrap);
    tempLine = drawConnectorPath(svg, from.x, from.y, from.x, from.y, 'rgba(121,158,255,0.55)', 'temp-line');
  }, { passive:false });

  wrap.addEventListener('pointermove', e => {
    if (!tempLine || !dragSrcEl) return;
    e.preventDefault();
    isDragging = true;

    const cr = wrap.getBoundingClientRect();
    const x = e.clientX - cr.left;
    const y = e.clientY - cr.top;
    const from = getCenterRelTo(dragSrcEl, wrap);
    updateConnectorPath(tempLine, from.x, from.y, x, y);

    // Highlight potential drop target
    document.querySelectorAll('.match-item[data-right]').forEach(r => r.classList.remove('drop-target'));
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const rightEl = el?.closest('.match-item[data-right]');
    if (rightEl && !rightEl.classList.contains('matched')) {
      rightEl.classList.add('drop-target');
    }
  }, { passive:false });

  wrap.addEventListener('pointerup', e => {
    if (!tempLine) return;
    tempLine.remove();
    tempLine = null;

    document.querySelectorAll('.match-item[data-right]').forEach(r => r.classList.remove('drop-target'));

    if (dragSrcEl) dragSrcEl.classList.remove('drag-source');

    if (!answerLocked && isDragging && dragSrcEl) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const rightEl = el?.closest('.match-item[data-right]');
      if (rightEl && !rightEl.classList.contains('matched')) {
        processMatch(rightEl, parseInt(dragSrcEl.dataset.left), item, svg, wrap);
        matchActiveLeft = null;
        document.querySelectorAll('.match-item[data-left]').forEach(m => m.classList.remove('active'));
      }
    }

    dragSrcEl  = null;
    isDragging = false;
    pointerId  = null;
  });

  wrap.addEventListener('pointercancel', () => {
    if (tempLine) { tempLine.remove(); tempLine = null; }
    if (dragSrcEl) dragSrcEl.classList.remove('drag-source');
    document.querySelectorAll('.match-item[data-right]').forEach(r => r.classList.remove('drop-target'));
    dragSrcEl = null; isDragging = false; pointerId = null;
  });
}

function processMatch(rightEl, leftIdx, item, svg, wrap) {
  const rightIdx = parseInt(rightEl.dataset.right);
  const leftEl   = document.querySelector(`.match-item[data-left="${leftIdx}"]`);
  const isCorrect = leftIdx === rightIdx;

  if (isCorrect) {
    leftEl.classList.add('matched','disabled');
    rightEl.classList.add('matched','disabled');
    // Draw permanent green line
    const from = getCenterRelTo(leftEl,  wrap);
    const to   = getCenterRelTo(rightEl, wrap);
    drawConnectorPath(svg, from.x, from.y, to.x, to.y, 'rgba(22,163,74,0.75)', `line-${leftIdx}`);
  } else {
    rightEl.classList.add('wrong-match');
    // Draw brief red flash line
    const from = getCenterRelTo(leftEl,  wrap);
    const to   = getCenterRelTo(rightEl, wrap);
    const errLine = drawConnectorPath(svg, from.x, from.y, to.x, to.y, 'rgba(239,68,68,0.65)');
    setTimeout(() => {
      rightEl.classList.remove('wrong-match');
      errLine.remove();
    }, 600);
  }

  // Check if all matched
  const allMatched = document.querySelectorAll('.match-item[data-left].matched').length === item.pairs.length;
  if (allMatched) {
    const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
    lockAndContinue(item, 'all_matched', true, timeSecs);
  }
}

/* Legacy click fallback kept for compatibility */
function selectMatchLeft(el) {
  if (answerLocked) return;
  document.querySelectorAll('.match-item[data-left]').forEach(m => m.classList.remove('active'));
  el.classList.add('active');
  matchActiveLeft = parseInt(el.dataset.left);
}

function selectMatchRight(el) {
  if (answerLocked || matchActiveLeft === null) return;
  if (el.classList.contains('matched')) return;
  const item  = STATE.items[STATE.currentIndex];
  const wrap  = document.getElementById('match-wrap');
  const svg   = ensureMatchSVG(wrap);
  processMatch(el, matchActiveLeft, item, svg, wrap);
  matchActiveLeft = null;
  document.querySelectorAll('.match-item[data-left]').forEach(m => m.classList.remove('active'));
}

/* ═══════════════════════════════════════════════════════════════
   MULTI-SELECT
═══════════════════════════════════════════════════════════════ */
function toggleMulti(el, idx) {
  if (answerLocked) return;
  if (multiSelected.has(idx)) { multiSelected.delete(idx); el.classList.remove('selected'); }
  else { multiSelected.add(idx); el.classList.add('selected'); }
}

function submitMultiSelect() {
  if (answerLocked || multiSelected.size === 0) return;
  const item     = STATE.items[STATE.currentIndex];
  const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
  const correct  = new Set(item.correctAnswers);
  const isCorrect = multiSelected.size === correct.size && [...multiSelected].every(v => correct.has(v));
  document.querySelectorAll('.opt').forEach((o,i) => {
    o.classList.add('disabled');
    if (correct.has(i))        o.classList.add('correct');
    else if (multiSelected.has(i)) o.classList.add('incorrect');
  });
  document.getElementById('btn-multi-submit').style.display = 'none';
  lockAndContinue(item, [...multiSelected], isCorrect, timeSecs);
}

/* ═══════════════════════════════════════════════════════════════
   ORDERING — mouse drag (desktop)
═══════════════════════════════════════════════════════════════ */
function bindDragDrop() {
  let dragged = null;
  const list = document.getElementById('order-list');
  if (!list) return;
  list.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragged = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging','drag-over'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragged && dragged !== item) {
        const items  = [...list.querySelectorAll('.order-item')];
        const fromIdx = items.indexOf(dragged);
        const toIdx   = items.indexOf(item);
        if (fromIdx < toIdx) list.insertBefore(dragged, item.nextSibling);
        else                  list.insertBefore(dragged, item);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ORDERING — touch drag (mobile)
═══════════════════════════════════════════════════════════════ */
function bindTouchOrdering() {
  const list = document.getElementById('order-list');
  if (!list) return;

  let touchedItem = null;
  let startY = 0;
  let currentY = 0;
  let clone = null;

  list.addEventListener('touchstart', e => {
    const item = e.target.closest('.order-item');
    // Only start drag from drag-handle area; arrows handle themselves
    if (!item || e.target.closest('.order-arrows') || e.target.closest('.order-arrow-btn')) return;

    e.preventDefault(); // ← Critical: prevent text-selection + scroll
    touchedItem = item;
    startY = e.touches[0].clientY;
    currentY = startY;
    item.classList.add('touch-lifted');
  }, { passive: false });

  list.addEventListener('touchmove', e => {
    if (!touchedItem) return;
    e.preventDefault(); // ← Critical: prevent scroll during drag
    currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    // Clear old drop targets
    list.querySelectorAll('.order-item').forEach(i => i.classList.remove('touch-target'));

    // Find the item under the finger
    touchedItem.style.visibility = 'hidden';
    const underEl = document.elementFromPoint(
      e.touches[0].clientX, e.touches[0].clientY
    );
    touchedItem.style.visibility = '';

    const target = underEl?.closest('.order-item');
    if (target && target !== touchedItem) {
      target.classList.add('touch-target');
    }
  }, { passive: false });

  list.addEventListener('touchend', e => {
    if (!touchedItem) return;
    e.preventDefault();

    touchedItem.classList.remove('touch-lifted');
    list.querySelectorAll('.order-item').forEach(i => i.classList.remove('touch-target'));

    // Find drop target
    touchedItem.style.visibility = 'hidden';
    const underEl = document.elementFromPoint(
      e.changedTouches[0].clientX, e.changedTouches[0].clientY
    );
    touchedItem.style.visibility = '';
    const target = underEl?.closest('.order-item');

    if (target && target !== touchedItem) {
      const items   = [...list.querySelectorAll('.order-item')];
      const fromIdx = items.indexOf(touchedItem);
      const toIdx   = items.indexOf(target);
      if (fromIdx < toIdx) list.insertBefore(touchedItem, target.nextSibling);
      else                  list.insertBefore(touchedItem, target);
    }

    touchedItem = null;
  }, { passive: false });

  list.addEventListener('touchcancel', () => {
    if (touchedItem) {
      touchedItem.classList.remove('touch-lifted');
      touchedItem = null;
    }
    list.querySelectorAll('.order-item').forEach(i => i.classList.remove('touch-target'));
  });
}

/* ═══════════════════════════════════════════════════════════════
   ORDERING — arrow buttons
═══════════════════════════════════════════════════════════════ */
function moveOrderItem(btn, dir) {
  if (answerLocked) return;
  const item = btn.closest('.order-item');
  const list = document.getElementById('order-list');
  if (!item || !list) return;
  const items = [...list.querySelectorAll('.order-item')];
  const idx   = items.indexOf(item);
  if (dir === -1 && idx > 0) {
    list.insertBefore(item, items[idx - 1]);
  } else if (dir === 1 && idx < items.length - 1) {
    list.insertBefore(items[idx + 1], item);
  }
  // Update arrow disabled states
  refreshArrowStates(list);
  // Visual feedback
  item.style.transition = 'background .2s';
  item.style.background = 'rgba(121,158,255,0.14)';
  setTimeout(() => { item.style.background = ''; }, 300);
}

function refreshArrowStates(list) {
  const items = [...list.querySelectorAll('.order-item')];
  items.forEach((item, idx) => {
    const up   = item.querySelector('.order-arrow-btn:first-child');
    const down = item.querySelector('.order-arrow-btn:last-child');
    if (up)   up.disabled   = idx === 0;
    if (down) down.disabled = idx === items.length - 1;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ORDERING — submit
═══════════════════════════════════════════════════════════════ */
function submitOrdering() {
  if (answerLocked) return;
  const item     = STATE.items[STATE.currentIndex];
  const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
  const list     = document.getElementById('order-list');
  const current  = [...list.querySelectorAll('.order-item')].map(el => parseInt(el.dataset.idx));
  const isCorrect = JSON.stringify(current) === JSON.stringify(item.correctOrder);
  list.querySelectorAll('.order-item').forEach((el, i) => {
    el.classList.add(current[i] === item.correctOrder[i] ? 'correct-pos' : 'wrong-pos');
  });
  document.getElementById('btn-order-submit').style.display = 'none';
  lockAndContinue(item, current, isCorrect, timeSecs);
}

/* ═══════════════════════════════════════════════════════════════
   SHORT ANSWER
═══════════════════════════════════════════════════════════════ */
function submitShortAnswer() {
  if (answerLocked) return;
  const item     = STATE.items[STATE.currentIndex];
  const timeSecs = (Date.now() - STATE.slideStartTime) / 1000;
  const val      = document.getElementById('sa-input').value.trim();
  if (!val) { flash('Please write an answer before submitting.'); return; }
  document.getElementById('sa-input').disabled = true;
  document.getElementById('btn-sa-submit').style.display = 'none';
  const kw = (item.keywords || []).map(k => k.toLowerCase());
  const isCorrect = kw.length === 0 || kw.some(k => val.toLowerCase().includes(k));
  lockAndContinue(item, val, isCorrect, timeSecs);
}
