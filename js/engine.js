// ===== ENGINE.JS — randomization, game logic =====

const DESIGNATORS = {
  letters:  ['A','B','C','D','E','F'],
  numbers:  ['1','2','3','4','5','6'],
  emoji:    ['🔥','⚡','🌊','🌿','💀','🔮'],
  symbols:  ['★','◆','▲','●','✦','⬟'],
  roman:    ['I','II','III','IV','V','VI'],
  greek:    ['α','β','γ','δ','ε','ζ'],
};

// Simple seeded PRNG (mulberry32)
function makePRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded RNG
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Derive a numeric seed from sessionKey (4-digit string) + stage index
function stageSeed(sessionKey, stageIdx) {
  return (parseInt(sessionKey, 10) * 97 + stageIdx * 31337) >>> 0;
}

// For a stage, randomize question order and answer order
function randomizeStage(stage, sessionKey, stageIdx) {
  const rng = makePRNG(stageSeed(sessionKey, stageIdx));
  const questions = shuffle(stage.questions, rng);
  return questions.map(q => {
    const rng2 = makePRNG(stageSeed(sessionKey, stageIdx) ^ hashStr(q.question_text));
    const answers = q.answers.map((a, i) => ({ ...a, origIdx: i }));
    const shuffled = shuffle(answers, rng2);
    const correctShuffledIdx = shuffled.findIndex(a => a.origIdx === q.correct_answer_index);
    return { ...q, answers: shuffled, correctShuffledIdx };
  });
}

// Build grid number map: maps cell index → unique random number (1–999)
// Teacher stores object positions as {col, row} in reference grid.
// Session key randomizes which number appears in each cell.
function buildGridNumbers(cols, rows, sessionKey, stageIdx) {
  const total = cols * rows;
  const rng = makePRNG(stageSeed(sessionKey, stageIdx + 500));
  // Generate a shuffled list of numbers 1..total (or larger pool for bigger numbers)
  const pool = Array.from({ length: Math.max(total, 100) }, (_, i) => i + 1);
  const shuffled = shuffle(pool, rng).slice(0, total);
  // map: cellIndex → number
  const map = {};
  for (let i = 0; i < total; i++) map[i] = shuffled[i];
  return map;
}

function cellIndex(col, row, cols) {
  return row * cols + col;
}

// Get grid number for a teacher-defined object position
function getGridNumber(col, row, cols, gridNumbers) {
  return gridNumbers[cellIndex(col, row, cols)];
}

// Build the passkey string for a stage: concatenation of grid numbers for each object in order
function buildPasskey(stage, sessionKey, stageIdx) {
  const gn = buildGridNumbers(stage.grid_cols, stage.grid_rows, sessionKey, stageIdx);
  return stage.questions
    .map(q => getGridNumber(q.object_col, q.object_row, stage.grid_cols, gn))
    .join('');
}

// Simple string hash for seeding
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Generate a random 4-digit session key
function generateSessionKey() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Parse CSV into game data structure
function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV appears empty.');

  // Detect delimiter
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const parseRow = line => {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === delim && !inQ) { result.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    result.push(cur.trim());
    return result;
  };

  let headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,'_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i]);
    // If the first cell is literally "type", this is a section header row — re-read headers
    if (vals[0] && vals[0].toLowerCase() === 'type') {
      headers = vals.map(h => h.toLowerCase().replace(/\s+/g,'_'));
      continue;
    }
    const obj = {};
    headers.forEach((h, j) => obj[h] = vals[j] || '');
    rows.push(obj);
  }

  const stageMap = {};

  for (const row of rows) {
    if (row.type === 'stage') {
      stageMap[row.stage] = {
        stage: parseInt(row.stage),
        stage_image_url: row.stage_image_url || '',
        grid_cols: parseInt(row.grid_cols) || 6,
        grid_rows: parseInt(row.grid_rows) || 5,
        designator_type: row.designator_type || 'letters',
        background_url: row.background_url || '',
        questions: [],
      };
    } else if (row.type === 'question') {
      if (!stageMap[row.stage]) throw new Error(`Question references unknown stage ${row.stage}`);
      const answers = [];
      for (let i = 1; i <= 6; i++) {
        const t = row[`a${i}_text`];
        if (t) answers.push({ text: t, image_url: row[`a${i}_image`] || '' });
      }
      stageMap[row.stage].questions.push({
        stage: parseInt(row.stage),
        question_number: parseInt(row.question),
        question_text: row.question_text || '',
        question_image_url: row.question_image_url || '',
        correct_answer_index: parseInt(row.correct_answer) - 1, // 1-based in CSV
        answers,
        object_name: row.object_name || '',
        object_col: parseInt(row.object_col) || 0,
        object_row: parseInt(row.object_row) || 0,
      });
    }
  }

  const stages = Object.values(stageMap).sort((a, b) => a.stage - b.stage);
  if (stages.length === 0) throw new Error('No stages found in CSV.');
  return stages;
}

// Validate game data
function validateGame(stages) {
  const errors = [];
  stages.forEach((s, i) => {
    if (!s.stage_image_url) errors.push(`Stage ${s.stage}: missing stage_image_url`);
    if (s.questions.length === 0) errors.push(`Stage ${s.stage}: no questions`);
    s.questions.forEach((q, qi) => {
      if (q.answers.length < 2) errors.push(`Stage ${s.stage} Q${qi+1}: fewer than 2 answer choices`);
      if (q.correct_answer_index >= q.answers.length) errors.push(`Stage ${s.stage} Q${qi+1}: correct_answer out of range`);
      if (q.object_name === '') errors.push(`Stage ${s.stage} Q${qi+1}: missing object_name`);
    });
  });
  return errors;
}

// Export
window.EscapeEngine = {
  DESIGNATORS,
  makePRNG,
  shuffle,
  stageSeed,
  randomizeStage,
  buildGridNumbers,
  cellIndex,
  getGridNumber,
  buildPasskey,
  generateSessionKey,
  parseCSV,
  validateGame,
};
