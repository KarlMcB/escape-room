// ===== CREATOR.JS — Teacher/Creator UI =====

(function() {
  const E = window.EscapeEngine;

  let gameData = { title: '', bg_url: '', stages: [] };
  let currentStageIdx = 0;
  let creatorStep = 1; // 1=upload, 2=configure, 3=place objects, 4=preview

  // ---- DOM refs ----
  const uploadSection   = () => document.getElementById('cr-upload-section');
  const configSection   = () => document.getElementById('cr-config-section');
  const placerSection   = () => document.getElementById('cr-placer-section');
  const previewSection  = () => document.getElementById('cr-preview-section');

  function showStep(n) {
    creatorStep = n;
    [uploadSection(), configSection(), placerSection(), previewSection()].forEach((el, i) => {
      if (el) el.classList.toggle('hidden', i + 1 !== n);
    });
    // Update step indicator
    document.querySelectorAll('.cr-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === n);
      el.classList.toggle('done', i + 1 < n);
    });
  }

  // ---- STEP 1: Upload CSV ----
  function initUpload() {
    const dropZone  = document.getElementById('cr-drop-zone');
    const fileInput = document.getElementById('cr-file-input');
    const pasteArea = document.getElementById('cr-paste-area');
    const parseBtn  = document.getElementById('cr-parse-btn');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) readFile(fileInput.files[0]);
    });

    parseBtn.addEventListener('click', () => {
      const text = pasteArea.value.trim();
      if (!text) { showAlert('cr-upload-alert', 'Paste CSV text or upload a file.', 'danger'); return; }
      processCSV(text);
    });

    document.getElementById('cr-template-btn').addEventListener('click', downloadTemplate);
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('cr-paste-area').value = e.target.result;
      processCSV(e.target.result);
    };
    reader.readAsText(file);
  }

  function processCSV(text) {
    try {
      const stages = E.parseCSV(text);
      gameData.stages = stages;
      const errs = E.validateGame(stages);
      if (errs.length > 0) {
        showAlert('cr-upload-alert', '⚠ Warnings:<br>' + errs.join('<br>'), 'gold');
      } else {
        showAlert('cr-upload-alert', `✓ Loaded ${stages.length} stage(s) with ${stages.reduce((a,s)=>a+s.questions.length,0)} questions.`, 'success');
      }
      renderConfigSection();
      showStep(2);
    } catch(e) {
      showAlert('cr-upload-alert', 'Parse error: ' + e.message, 'danger');
    }
  }

  // ---- STEP 2: Configure ----
  function renderConfigSection() {
    const el = configSection();

    const titleInput = document.getElementById('cr-game-title');
    titleInput.value = gameData.title || '';
    titleInput.oninput = () => { gameData.title = titleInput.value; };

    const bgInput = document.getElementById('cr-game-bg');
    bgInput.value = gameData.bg_url || '';
    bgInput.oninput = () => { gameData.bg_url = bgInput.value; };

    renderStageTabs();
    renderStageConfig(0);

    document.getElementById('cr-to-step3').onclick = () => {
      gameData.title = titleInput.value || 'Escape Room';
      renderPlacerSection();
      showStep(3);
    };
  }

  function renderStageTabs() {
    const wrap = document.getElementById('cr-stage-tabs-config');
    wrap.innerHTML = '';
    gameData.stages.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'stage-tab' + (i === currentStageIdx ? ' active' : '');
      btn.textContent = `Stage ${s.stage}`;
      btn.onclick = () => { currentStageIdx = i; renderStageTabs(); renderStageConfig(i); };
      wrap.appendChild(btn);
    });
  }

  function renderStageConfig(idx) {
    const s = gameData.stages[idx];
    const wrap = document.getElementById('cr-stage-config-body');

    wrap.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label>Stage Image URL</label>
          <input type="text" id="cfg-img-${idx}" value="${s.stage_image_url}" placeholder="https://...">
        </div>
        <div class="form-group">
          <label>Designator Type</label>
          <select id="cfg-des-${idx}">
            ${Object.keys(E.DESIGNATORS).map(k => `<option value="${k}" ${s.designator_type===k?'selected':''}>${k} (${E.DESIGNATORS[k].slice(0,3).join(' ')}...)</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Grid Columns</label>
          <input type="number" id="cfg-cols-${idx}" value="${s.grid_cols}" min="2" max="20">
        </div>
        <div class="form-group">
          <label>Grid Rows</label>
          <input type="number" id="cfg-rows-${idx}" value="${s.grid_rows}" min="2" max="20">
        </div>
      </div>
      <div class="card-title" style="margin-top:1rem">Questions <span class="badge badge-cyan">${s.questions.length}</span></div>
      <table class="q-table">
        <thead><tr><th>#</th><th>Question</th><th>Answers</th><th>Object</th></tr></thead>
        <tbody>
          ${s.questions.map((q,qi) => `
            <tr>
              <td>${qi+1}</td>
              <td>${q.question_text.substring(0,60)}${q.question_text.length>60?'…':''}</td>
              <td>${q.answers.map((a,ai) => `<span class="answer-chip${ai===q.correct_answer_index?' correct':''}">${E.DESIGNATORS[s.designator_type][ai]||ai+1}: ${a.text.substring(0,20)}</span>`).join('')}</td>
              <td>${q.object_name || '<span class="text-muted">not set</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Bind inputs
    document.getElementById(`cfg-img-${idx}`).oninput = e => { s.stage_image_url = e.target.value; };
    document.getElementById(`cfg-des-${idx}`).onchange = e => { s.designator_type = e.target.value; renderStageConfig(idx); };
    document.getElementById(`cfg-cols-${idx}`).oninput = e => { s.grid_cols = parseInt(e.target.value)||6; };
    document.getElementById(`cfg-rows-${idx}`).oninput = e => { s.grid_rows = parseInt(e.target.value)||5; };
  }

  // ---- STEP 3: Place Objects ----
  function renderPlacerSection() {
    currentStageIdx = 0;
    renderPlacerTabs();
    renderPlacer(0);

    document.getElementById('cr-to-step4').onclick = () => {
      renderPreview();
      showStep(4);
    };
  }

  function renderPlacerTabs() {
    const wrap = document.getElementById('cr-placer-tabs');
    wrap.innerHTML = '';
    gameData.stages.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'stage-tab' + (i === currentStageIdx ? ' active' : '');
      btn.textContent = `Stage ${s.stage}`;
      btn.onclick = () => { currentStageIdx = i; renderPlacerTabs(); renderPlacer(i); };
      wrap.appendChild(btn);
    });
  }

  function renderPlacer(idx) {
    const s = gameData.stages[idx];
    const wrap = document.getElementById('cr-placer-body');
    wrap.innerHTML = '';

    // Object queue panel
    const queueDiv = document.createElement('div');
    queueDiv.id = 'placer-queue';
    queueDiv.style.cssText = 'margin-bottom:1rem;';
    const firstUnplaced = s.questions.findIndex(q => !q._placed);
    queueDiv.innerHTML = `<div class="card-title">Objects to Place</div>
      <div class="find-queue" id="placer-items">
        ${s.questions.map((q,qi) => {
          let cls = 'find-item';
          if (q._placed) cls += ' done';
          else if (qi === firstUnplaced) cls += ' current';
          return `<div class="${cls}" id="pitem-${idx}-${qi}">${q._placed ? '✓ ' : ''}${qi+1}. ${q.object_name || 'Q'+(qi+1)}</div>`;
        }).join('')}
      </div>
      <div class="alert alert-info">Click a grid cell to assign the <strong>highlighted</strong> object. Objects are placed in question order.</div>`;
    wrap.appendChild(queueDiv);

    if (!s.stage_image_url) {
      const warn = document.createElement('div');
      warn.className = 'alert alert-gold';
      warn.innerHTML = '⚠ No stage image URL set. Go back to Configure to add one.';
      wrap.appendChild(warn);
      return;
    }

    // Image + grid
    const imgWrap = document.createElement('div');
    imgWrap.className = 'grid-editor-wrap';
    imgWrap.id = 'placer-img-wrap-' + idx;

    const img = document.createElement('img');
    img.src = s.stage_image_url;
    img.alt = 'Stage image';
    img.style.maxHeight = '500px';
    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);

    img.onload = () => buildPlacerGrid(idx, img, imgWrap);
    img.onerror = () => {
      const e = document.createElement('div');
      e.className = 'alert alert-danger';
      e.textContent = 'Could not load image. Check the URL.';
      imgWrap.appendChild(e);
    };
    if (img.complete && img.naturalWidth > 0) buildPlacerGrid(idx, img, imgWrap);
  }

  function buildPlacerGrid(idx, img, wrap) {
    // Remove old overlay
    const old = wrap.querySelector('.grid-overlay');
    if (old) old.remove();

    const s = gameData.stages[idx];
    const overlay = document.createElement('div');
    overlay.className = 'grid-overlay';

    const W = img.offsetWidth, H = img.offsetHeight;
    const cw = W / s.grid_cols, ch = H / s.grid_rows;

    let currentObjIdx = s.questions.findIndex(q => !q._placed);
    if (currentObjIdx === -1) currentObjIdx = 0;

    for (let r = 0; r < s.grid_rows; r++) {
      for (let c = 0; c < s.grid_cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.style.left   = (c * cw) + 'px';
        cell.style.top    = (r * ch) + 'px';
        cell.style.width  = cw + 'px';
        cell.style.height = ch + 'px';
        cell.dataset.col = c;
        cell.dataset.row = r;
        cell.textContent = `${c},${r}`;

        // Mark already-placed
        const placed = s.questions.findIndex(q => q._placed && q.object_col === c && q.object_row === r);
        if (placed !== -1) cell.classList.add('placed');

        cell.addEventListener('click', () => {
          const oi = s.questions.findIndex(q => !q._placed);
          if (oi === -1) return;
          s.questions[oi].object_col = c;
          s.questions[oi].object_row = r;
          s.questions[oi]._placed = true;
          // Rebuild entire placer body to update queue + grid together
          renderPlacer(idx);
        });

        overlay.appendChild(cell);
      }
    }

    wrap.appendChild(overlay);
  }

  // ---- STEP 4: Preview ----
  function renderPreview() {
    const wrap = document.getElementById('cr-preview-body');
    const sessionKey = '1234'; // fixed for preview
    wrap.innerHTML = `<div class="alert alert-info">Preview uses session key <strong>${sessionKey}</strong>. Final game uses student's actual key.</div>`;

    gameData.stages.forEach((s, si) => {
      const stageDiv = document.createElement('div');
      stageDiv.className = 'card';
      stageDiv.innerHTML = `<div class="card-title">Stage ${s.stage} Preview</div>`;

      const randomized = E.randomizeStage(s, sessionKey, si);
      const designators = E.DESIGNATORS[s.designator_type] || E.DESIGNATORS.letters;

      randomized.forEach((q, qi) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-card';
        qDiv.innerHTML = `
          <div class="question-num">Question ${qi + 1}</div>
          <div class="question-text">${q.question_text}</div>
          ${q.question_image_url ? `<img class="question-img" src="${q.question_image_url}" alt="">` : ''}
          <div class="answer-grid">
            ${q.answers.map((a, ai) => `
              <div class="answer-option${ai === q.correctShuffledIdx ? ' correct' : ''}">
                <div class="designator">${designators[ai] || ai+1}</div>
                <div>
                  ${a.image_url ? `<img class="answer-img-thumb" src="${a.image_url}" alt="">` : ''}
                  ${a.text}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="text-muted mt-1" style="font-size:0.75rem">✓ Correct: designator <strong>${designators[q.correctShuffledIdx]}</strong></div>
        `;
        stageDiv.appendChild(qDiv);
      });

      // Decoder preview
      const gn = E.buildGridNumbers(s.grid_cols, s.grid_rows, sessionKey, si);
      const passkey = s.questions.map(q => E.getGridNumber(q.object_col ?? 0, q.object_row ?? 0, s.grid_cols, gn)).join('');
      const decDiv = document.createElement('div');
      decDiv.innerHTML = `
        <div class="card-title mt-2">Decoder Preview</div>
        <div class="find-queue">${s.questions.map(q => `<div class="find-item">${q.object_name}</div>`).join('')}</div>
        <div class="text-muted">Grid: ${s.grid_cols}×${s.grid_rows} &nbsp;|&nbsp; Passkey for this session: <code style="color:var(--accent3)">${passkey}</code></div>
      `;
      stageDiv.appendChild(decDiv);
      wrap.appendChild(stageDiv);
    });

    document.getElementById('cr-export-btn').onclick = exportGame;
  }

  function exportGame() {
    const out = {
      title: gameData.title || 'Escape Room',
      bg_url: gameData.bg_url || '',
      created: new Date().toISOString(),
      stages: gameData.stages.map(s => ({
        stage: s.stage,
        stage_image_url: s.stage_image_url,
        grid_cols: s.grid_cols,
        grid_rows: s.grid_rows,
        designator_type: s.designator_type,
        questions: s.questions.map(q => ({
          question_text: q.question_text,
          question_image_url: q.question_image_url,
          correct_answer_index: q.correct_answer_index,
          answers: q.answers.map(a => ({ text: a.text, image_url: a.image_url })),
          object_name: q.object_name,
          object_col: q.object_col ?? 0,
          object_row: q.object_row ?? 0,
        }))
      }))
    };

    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (gameData.title || 'escape-room').replace(/\s+/g,'-').toLowerCase() + '.json';
    a.click();
  }

  function downloadTemplate() {
    const csv = [
      'type,stage,stage_image_url,grid_cols,grid_rows,designator_type,background_url',
      'stage,1,https://example.com/stage1.jpg,8,6,letters,',
      'stage,2,https://example.com/stage2.jpg,10,7,numbers,',
      '',
      'type,stage,question,question_text,question_image_url,correct_answer,a1_text,a1_image,a2_text,a2_image,a3_text,a3_image,a4_text,a4_image,a5_text,a5_image,a6_text,a6_image,object_name,object_col,object_row',
      'question,1,1,What is the capital of France?,https://example.com/q1.jpg,2,Berlin,,Paris,,Rome,,Madrid,,,,,The Eiffel Tower,3,2',
      'question,1,2,Which planet is closest to the Sun?,,1,Mercury,,Venus,,Earth,,Mars,,,,,The Solar Panel,5,4',
      'question,2,1,What is 7 × 8?,,2,54,,56,,63,,49,,,,,The Clock,2,3',
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'escape-room-template.csv';
    a.click();
  }

  // ---- Utility ----
  function showAlert(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.innerHTML = msg;
    el.classList.remove('hidden');
  }

  // ---- Init ----
  function init() {
    initUpload();
    showStep(1);
  }

  window.CreatorInit = init;
})();
