// ===== PLAYER.JS — Student/Player UI =====

(function() {
  const E = window.EscapeEngine;

  let game = null;          // loaded JSON
  let sessionKey = '';
  let stageIdx = 0;
  let playerAnswers = [];   // per question: chosen shuffled idx or null
  let randomizedStages = [];
  let decoderState = null;  // { found: Set of objIdx, gridNumbers }
  let playerScreen = 'load'; // load | session | questions | result | decoder | win

  // ---- DOM refs ----
  const screens = {
    load:      () => document.getElementById('pl-load-screen'),
    session:   () => document.getElementById('pl-session-screen'),
    questions: () => document.getElementById('pl-questions-screen'),
    result:    () => document.getElementById('pl-result-screen'),
    decoder:   () => document.getElementById('pl-decoder-screen'),
    win:       () => document.getElementById('pl-win-screen'),
  };

  function showScreen(name) {
    playerScreen = name;
    Object.entries(screens).forEach(([k, fn]) => {
      const el = fn();
      if (el) el.classList.toggle('hidden', k !== name);
    });
  }

  // ---- LOAD SCREEN ----
  function initLoad() {
    const fileInput = document.getElementById('pl-file-input');
    const loadBtn   = document.getElementById('pl-load-btn');

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      loadBtn.textContent = '⏳ Loading ' + file.name + '…';
      loadBtn.style.pointerEvents = 'none';
      const reader = new FileReader();
      reader.onload = e => {
        try {
          game = JSON.parse(e.target.result);
          if (!game.stages || game.stages.length === 0) throw new Error('Invalid game file.');
          showSessionScreen();
        } catch(err) {
          showPlayerAlert('pl-load-alert', 'Could not load game: ' + err.message, 'danger');
          loadBtn.textContent = '▶ Choose Game File';
          loadBtn.style.pointerEvents = '';
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('pl-load-saved-btn').addEventListener('click', () => {
      document.getElementById('pl-save-input').click();
    });

    document.getElementById('pl-save-input').addEventListener('change', e => {
      if (!e.target.files[0]) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const save = JSON.parse(ev.target.result);
          game = save.game;
          sessionKey = save.sessionKey;
          stageIdx = save.stageIdx;
          playerAnswers = save.playerAnswers || [];
          buildRandomizedStages();
          showQuestionsScreen();
        } catch(err) {
          showPlayerAlert('pl-load-alert', 'Could not load save: ' + err.message, 'danger');
        }
      };
      reader.readAsText(e.target.files[0]);
    });
  }

  // ---- SESSION SCREEN ----
  function showSessionScreen() {
    document.getElementById('pl-game-title').textContent = game.title || 'Escape Room';
    document.getElementById('pl-stage-count-label').textContent = `${game.stages.length} stage${game.stages.length !== 1 ? 's' : ''}`;

    // Apply game background
    if (game.bg_url) {
      document.body.style.backgroundImage = `url('${game.bg_url}')`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundPosition = 'center';
    }

    const skDisplay = document.getElementById('pl-session-key-display');
    const newKey = E.generateSessionKey();
    sessionKey = newKey;
    skDisplay.textContent = newKey;

    document.getElementById('pl-regen-key').onclick = () => {
      sessionKey = E.generateSessionKey();
      skDisplay.textContent = sessionKey;
    };

    document.getElementById('pl-custom-key-input').addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g,'').substring(0,4);
      e.target.value = v;
      if (v.length === 4) { sessionKey = v; skDisplay.textContent = v; }
    });

    document.getElementById('pl-start-btn').onclick = () => {
      stageIdx = 0;
      playerAnswers = [];
      buildRandomizedStages();
      showQuestionsScreen();
    };

    showScreen('session');
  }

  function buildRandomizedStages() {
    randomizedStages = game.stages.map((s, i) => E.randomizeStage(s, sessionKey, i));
  }

  // ---- QUESTIONS SCREEN ----
  function showQuestionsScreen() {
    playerAnswers = [];
    renderQuestions();
    showScreen('questions');
  }

  function renderQuestions() {
    const s = game.stages[stageIdx];
    const rq = randomizedStages[stageIdx];
    const designators = E.DESIGNATORS[s.designator_type] || E.DESIGNATORS.letters;
    const total = game.stages.length;

    // Header
    document.getElementById('pl-stage-label').textContent = `Stage ${s.stage} of ${total}`;
    document.getElementById('pl-stage-name').textContent = game.title || 'Escape Room';

    // Progress bar
    const pct = (stageIdx / total) * 100;
    document.getElementById('pl-progress-fill').style.width = pct + '%';

    const wrap = document.getElementById('pl-questions-body');
    wrap.innerHTML = '';

    rq.forEach((q, qi) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.innerHTML = `
        <div class="question-num">Question ${qi + 1} of ${rq.length}</div>
        <div class="question-text">${q.question_text}</div>
        ${q.question_image_url ? `<img class="question-img" src="${q.question_image_url}" alt="">` : ''}
        <div class="answer-grid" id="q-answers-${qi}"></div>
      `;

      const ag = card.querySelector(`#q-answers-${qi}`);
      q.answers.forEach((a, ai) => {
        const opt = document.createElement('div');
        opt.className = 'answer-option';
        opt.dataset.qi = qi;
        opt.dataset.ai = ai;
        opt.innerHTML = `
          <div class="designator">${designators[ai] || ai+1}</div>
          <div style="flex:1">
            ${a.image_url ? `<img class="answer-img-thumb" src="${a.image_url}" alt="">` : ''}
            <span>${a.text}</span>
          </div>
        `;
        opt.addEventListener('click', () => selectAnswer(qi, ai));
        ag.appendChild(opt);
      });

      wrap.appendChild(card);
    });

    // Submit button
    const submitBtn = document.getElementById('pl-submit-btn');
    submitBtn.onclick = submitAnswers;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Check Answers';

    // Save button
    document.getElementById('pl-save-btn').onclick = saveGame;
  }

  function selectAnswer(qi, ai) {
    playerAnswers[qi] = ai;
    // Update UI
    document.querySelectorAll(`.answer-option[data-qi="${qi}"]`).forEach(el => {
      el.classList.remove('selected');
    });
    const opt = document.querySelector(`.answer-option[data-qi="${qi}"][data-ai="${ai}"]`);
    if (opt) opt.classList.add('selected');
  }

  function submitAnswers() {
    const rq = randomizedStages[stageIdx];
    const total = rq.length;

    // Check all answered
    const unanswered = rq.filter((_, qi) => playerAnswers[qi] === undefined);
    if (unanswered.length > 0) {
      showPlayerAlert('pl-q-alert', `Please answer all ${total} questions before submitting.`, 'danger');
      return;
    }

    const wrong = rq.filter((q, qi) => playerAnswers[qi] !== q.correctShuffledIdx);
    renderResult(wrong.length, total);
    showScreen('result');
  }

  // ---- RESULT SCREEN ----
  function renderResult(wrongCount, total) {
    const res = document.getElementById('pl-result-body');
    res.innerHTML = '';

    if (wrongCount === 0) {
      res.innerHTML = `
        <div class="alert alert-success" style="font-size:1.1rem;justify-content:center">
          🎉 All ${total} questions correct! Ready to decode the stage.
        </div>
      `;
      document.getElementById('pl-result-action').innerHTML = `
        <button class="btn btn-gold w-full" id="pl-go-decoder">Go to Stage Decoder →</button>
      `;
      document.getElementById('pl-go-decoder').onclick = showDecoderScreen;
    } else {
      res.innerHTML = `
        <div class="alert alert-danger" style="font-size:1.1rem;justify-content:center">
          ✗ ${wrongCount} answer${wrongCount > 1 ? 's' : ''} incorrect. Try again!
        </div>
        <p class="text-muted text-center mt-1">Check your work and resubmit.</p>
      `;
      document.getElementById('pl-result-action').innerHTML = `
        <button class="btn btn-secondary w-full" id="pl-retry-btn">← Back to Questions</button>
      `;
      document.getElementById('pl-retry-btn').onclick = () => {
        showScreen('questions');
        // Keep existing selections
      };
    }
  }

  // ---- DECODER SCREEN ----
  function showDecoderScreen() {
    const s = game.stages[stageIdx];
    const gridNumbers = E.buildGridNumbers(s.grid_cols, s.grid_rows, sessionKey, stageIdx);

    decoderState = {
      gridNumbers,
      found: new Set(),
      total: s.questions.length,
      currentIdx: 0,
      collectedNumbers: [],
    };

    renderDecoder();
    showScreen('decoder');
  }

  function renderDecoder() {
    const s = game.stages[stageIdx];
    const { gridNumbers, found, currentIdx } = decoderState;

    // Header
    document.getElementById('pl-decoder-stage').textContent = `Stage ${s.stage} Decoder`;

    // Find queue
    const queueEl = document.getElementById('pl-find-queue');
    queueEl.innerHTML = s.questions.map((q, i) => `
      <div class="find-item ${found.has(i) ? 'done' : i === currentIdx ? 'current' : ''}" id="fitem-${i}">
        ${found.has(i) ? '✓ ' : ''}${q.object_name}
      </div>
    `).join('');

    // Image + grid
    const imgWrap = document.getElementById('pl-decoder-img-wrap');
    imgWrap.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'decoder-wrap';

    const img = document.createElement('img');
    img.src = s.stage_image_url;
    img.alt = 'Stage image';
    img.style.maxHeight = '500px';
    img.onload = () => buildDecoderGrid(s, img, container, gridNumbers);
    img.onerror = () => {
      container.innerHTML = '<div class="alert alert-danger">Could not load stage image.</div>';
    };
    if (img.complete) buildDecoderGrid(s, img, container, gridNumbers);

    container.appendChild(img);
    imgWrap.appendChild(container);

    // Passkey input
    renderPasskeyInput(s, decoderState.collectedNumbers, decoderState.currentIdx >= s.questions.length);
  }

  function buildDecoderGrid(s, img, wrap, gridNumbers) {
    const old = wrap.querySelector('.decoder-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'decoder-overlay';

    const W = img.offsetWidth, H = img.offsetHeight;
    const cw = W / s.grid_cols, ch = H / s.grid_rows;

    for (let r = 0; r < s.grid_rows; r++) {
      for (let c = 0; c < s.grid_cols; c++) {
        const cellIdx = E.cellIndex(c, r, s.grid_cols);
        const num = gridNumbers[cellIdx];
        const cell = document.createElement('div');
        cell.className = 'decoder-cell';
        cell.style.left   = (c * cw) + 'px';
        cell.style.top    = (r * ch) + 'px';
        cell.style.width  = cw + 'px';
        cell.style.height = ch + 'px';
        cell.dataset.col = c;
        cell.dataset.row = r;
        cell.dataset.num = num;
        cell.textContent = num;

        // Mark found cells
        const foundObjIdx = s.questions.findIndex((q, i) =>
          decoderState.found.has(i) && q.object_col === c && q.object_row === r
        );
        if (foundObjIdx !== -1) cell.classList.add('found');

        cell.addEventListener('click', () => handleDecoderClick(c, r, num, s));
        overlay.appendChild(cell);
      }
    }

    wrap.appendChild(overlay);
  }

  function handleDecoderClick(col, row, num, s) {
    const { currentIdx, found } = decoderState;
    if (currentIdx >= s.questions.length) return;

    const targetQ = s.questions[currentIdx];

    if (targetQ.object_col === col && targetQ.object_row === row) {
      // Correct!
      decoderState.found.add(currentIdx);
      decoderState.collectedNumbers.push(num);
      decoderState.currentIdx++;

        renderDecoder(); // re-render queue + grid — passkey shown via renderPasskeyInput
    } else {
      // Wrong — flash cell red briefly
      const cell = document.querySelector(`.decoder-cell[data-col="${col}"][data-row="${row}"]`);
      if (cell) {
        cell.classList.add('wrong-click');
        setTimeout(() => cell.classList.remove('wrong-click'), 600);
      }
    }
  }

  function renderPasskeyInput(s, collectedNumbers = [], allFound = false) {
    const wrap = document.getElementById('pl-passkey-input-wrap');
    wrap.innerHTML = '';

    const label = document.createElement('p');
    label.className = 'text-muted mb-1';
    label.textContent = 'Find all objects in order, then enter the passkey to advance:';
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.className = 'passkey-input-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'passkey-input';
    input.placeholder = '???';
    input.id = 'pl-passkey-entry';

    const btn = document.createElement('button');
    btn.className = 'btn btn-gold';
    btn.textContent = 'Submit Passkey';
    btn.onclick = () => checkPasskey(s);

    row.appendChild(input);
    row.appendChild(btn);
    wrap.appendChild(row);

    // Show passkey hint as items are found
    if (collectedNumbers.length > 0) {
      const hint = document.createElement('div');
      hint.className = 'alert alert-info mt-1';
      hint.innerHTML = `Numbers collected so far: <strong style="letter-spacing:2px;color:var(--accent3)">${collectedNumbers.join(' · ')}</strong>`;
      wrap.appendChild(hint);
    }

    if (allFound) {
      const passkey = collectedNumbers.join('');
      const passkeyResult = document.createElement('div');
      passkeyResult.className = 'alert alert-success mt-1';
      passkeyResult.innerHTML = `All objects found! Your passkey: <strong style="letter-spacing:3px;font-size:1.2rem;color:var(--accent3)">${passkey}</strong>`;
      wrap.appendChild(passkeyResult);
      input.value = passkey;
    }
  }

  function checkPasskey(s) {
    const input = document.getElementById('pl-passkey-entry');
    const entered = input.value.trim();
    const correct = E.buildPasskey(s, sessionKey, stageIdx);

    if (entered === correct) {
      stageIdx++;
      if (stageIdx >= game.stages.length) {
        showWinScreen();
      } else {
        showQuestionsScreen();
      }
    } else {
      const old = document.querySelector('#pl-passkey-input-wrap .alert-danger');
      if (old) old.remove();
      const err = document.createElement('div');
      err.className = 'alert alert-danger mt-1';
      err.textContent = '✗ Incorrect passkey. Check your numbers and try again.';
      document.getElementById('pl-passkey-input-wrap').appendChild(err);
    }
  }

  // ---- WIN SCREEN ----
  function showWinScreen() {
    document.getElementById('pl-win-title').textContent = '🏆 You Escaped!';
    document.getElementById('pl-win-game').textContent = game.title || 'Escape Room';
    showScreen('win');

    // Confetti burst
    launchConfetti();
  }

  function launchConfetti() {
    const canvas = document.getElementById('pl-confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20,
      r: 4 + Math.random() * 6,
      color: ['#7c3aed','#06b6d4','#f59e0b','#10b981','#ef4444'][Math.floor(Math.random()*5)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 3,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 5,
    }));

    let frame;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
        ctx.restore();
        p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.vy += 0.05;
      });
      if (pieces.some(p => p.y < canvas.height + 30)) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    draw();
  }

  // ---- Save/Load mid-game ----
  function saveGame() {
    const saveName = prompt('Enter a save name:', 'my-game');
    if (!saveName) return;
    const saveData = { game, sessionKey, stageIdx, playerAnswers };
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = saveName.replace(/\s+/g,'-') + '-save.json';
    a.click();
  }

  // ---- Utility ----
  function showPlayerAlert(id, msg, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  // ---- Init ----
  function init() {
    initLoad();
    showScreen('load');
  }

  window.PlayerInit = init;
})();
