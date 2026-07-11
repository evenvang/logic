const STORAGE_KEY = "logic600.screenshot.app.v1";
const choices = ["A", "B", "C", "D"];

let state = loadState();
let currentSetId = state.currentSetId || 1;
let activeTab = "questions";
let timerId = null;
let zoom = state.zoom || 900;

const setGrid = document.getElementById("setGrid");
const setTitle = document.getElementById("setTitle");
const rangeLabel = document.getElementById("rangeLabel");
const pageStack = document.getElementById("pageStack");
const answerSheet = document.getElementById("answerSheet");
const answeredCount = document.getElementById("answeredCount");
const timerEl = document.getElementById("timer");
const resultCard = document.getElementById("resultCard");

function loadState() {
  const fallback = { attempts: {}, answers: {}, wrongbook: {}, answerKeys: {}, currentSetId: 1, zoom: 900 };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  state.currentSetId = currentSetId;
  state.zoom = zoom;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSet(id = currentSetId) {
  return window.LOGIC_QUIZ_DATA.sets.find((item) => item.id === id);
}

function setKey(setId, qIndex) {
  return `${setId}-${qIndex + 1}`;
}

function questionNo(setId, qIndex) {
  return (setId - 1) * 20 + qIndex + 1;
}

function renderSetGrid() {
  setGrid.innerHTML = "";
  window.LOGIC_QUIZ_DATA.sets.forEach((set) => {
    const btn = document.createElement("button");
    btn.className = "set-btn";
    btn.textContent = String(set.id).padStart(2, "0");
    btn.title = set.title;
    if (set.id === currentSetId) btn.classList.add("active");
    if (state.attempts[set.id]?.submittedAt) btn.classList.add("done");
    btn.addEventListener("click", () => {
      currentSetId = set.id;
      activeTab = "questions";
      saveState();
      renderAll();
    });
    setGrid.appendChild(btn);
  });
}

function renderHeader() {
  const set = getSet();
  setTitle.textContent = set.title;
  rangeLabel.textContent = `第 ${set.questionStart}-${set.questionEnd} 题`;
}

function renderPages() {
  const set = getSet();
  const pages = activeTab === "questions" ? set.questionPages : set.solutionPages;
  pageStack.style.setProperty("--page-width", `${zoom}px`);
  pageStack.innerHTML = "";
  pages.forEach((src, idx) => {
    const img = document.createElement("img");
    img.className = "page-img";
    img.loading = idx < 2 ? "eager" : "lazy";
    img.alt = `${set.title} ${activeTab === "questions" ? "题本" : "解析"} 第 ${idx + 1} 页`;
    img.src = src;
    pageStack.appendChild(img);
  });
}

function renderAnswerSheet() {
  const set = getSet();
  const answers = state.answers[set.id] || Array(20).fill(null);
  const keys = getAnswerKey(set.id);
  const attempt = state.attempts[set.id];
  const submitted = Boolean(attempt?.submittedAt);
  const answered = answers.filter(Boolean).length;
  answeredCount.textContent = `${answered}/20`;
  answerSheet.innerHTML = "";

  for (let i = 0; i < 20; i += 1) {
    const row = document.createElement("div");
    row.className = "answer-row";
    const no = document.createElement("div");
    no.className = "qno";
    no.textContent = questionNo(set.id, i);
    row.appendChild(no);

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.textContent = choice;
      if (answers[i] === choice) btn.classList.add("selected");
      if (submitted && keys[i]) {
        if (choice === keys[i]) btn.classList.add("correct");
        if (answers[i] === choice && answers[i] !== keys[i]) btn.classList.add("wrong");
      }
      btn.addEventListener("click", () => {
        if (!state.answers[set.id]) state.answers[set.id] = Array(20).fill(null);
        state.answers[set.id][i] = choice;
        saveState();
        renderAnswerSheet();
      });
      row.appendChild(btn);
    });

    const star = document.createElement("button");
    star.className = "star-btn";
    star.textContent = "☆";
    star.title = "加入错题本";
    if (state.wrongbook[setKey(set.id, i)]) {
      star.classList.add("active");
      star.textContent = "★";
    }
    star.addEventListener("click", () => {
      toggleWrong(set.id, i, "手动加入");
      renderAnswerSheet();
    });
    row.appendChild(star);
    answerSheet.appendChild(row);
  }

  renderResultCard();
}

function getAnswerKey(setId) {
  const saved = state.answerKeys[setId];
  if (saved?.length) return saved;
  const config = getSet(setId).answers;
  return config || Array(20).fill(null);
}

function toggleWrong(setId, qIndex, reason) {
  const key = setKey(setId, qIndex);
  if (state.wrongbook[key]) {
    delete state.wrongbook[key];
  } else {
    state.wrongbook[key] = {
      setId,
      qIndex,
      questionNo: questionNo(setId, qIndex),
      reason,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
  }
  saveState();
}

function addWrong(setId, qIndex, reason) {
  const key = setKey(setId, qIndex);
  state.wrongbook[key] = {
    setId,
    qIndex,
    questionNo: questionNo(setId, qIndex),
    reason,
    resolved: false,
    createdAt: new Date().toISOString(),
  };
}

function renderResultCard() {
  const set = getSet();
  const attempt = state.attempts[set.id];
  if (!attempt) {
    resultCard.innerHTML = "开始后会自动计时。交卷后显示解析；设置答案后可自动判分。";
    return;
  }
  if (!attempt.submittedAt) {
    resultCard.innerHTML = `进行中：<strong>${formatDuration(elapsedFor(set.id))}</strong>`;
    return;
  }
  if (attempt.hasKey) {
    resultCard.innerHTML = `本次用时 <strong>${formatDuration(attempt.durationMs)}</strong><br>正确 <strong>${attempt.correct}</strong> 题，错误 <strong>${attempt.wrong}</strong> 题。`;
  } else {
    resultCard.innerHTML = `本次用时 <strong>${formatDuration(attempt.durationMs)}</strong><br>当前套题还没有答案表，已切换到解析页，可手动加入错题本。`;
  }
}

function startSet() {
  const set = getSet();
  state.attempts[set.id] = { startedAt: Date.now(), submittedAt: null, durationMs: 0 };
  if (!state.answers[set.id]) state.answers[set.id] = Array(20).fill(null);
  saveState();
  startTimerLoop();
  renderAll();
}

function submitSet() {
  const set = getSet();
  const attempt = state.attempts[set.id] || { startedAt: Date.now() };
  const durationMs = elapsedFor(set.id);
  const answers = state.answers[set.id] || Array(20).fill(null);
  const keys = getAnswerKey(set.id);
  const hasKey = keys.filter(Boolean).length === 20;
  let correct = 0;
  let wrong = 0;

  if (hasKey) {
    keys.forEach((key, idx) => {
      if (answers[idx] === key) {
        correct += 1;
      } else {
        wrong += 1;
        addWrong(set.id, idx, answers[idx] ? "答错" : "未作答");
      }
    });
  }

  state.attempts[set.id] = {
    ...attempt,
    submittedAt: Date.now(),
    durationMs,
    hasKey,
    correct,
    wrong,
  };
  activeTab = "solutions";
  saveState();
  renderAll();
}

function elapsedFor(setId) {
  const attempt = state.attempts[setId];
  if (!attempt) return 0;
  if (attempt.submittedAt) return attempt.durationMs || 0;
  return Date.now() - attempt.startedAt;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function startTimerLoop() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    timerEl.textContent = formatDuration(elapsedFor(currentSetId));
    renderResultCard();
  }, 1000);
}

function renderTimer() {
  timerEl.textContent = formatDuration(elapsedFor(currentSetId));
}

function renderWrongbook() {
  const wrongList = document.getElementById("wrongList");
  const items = Object.values(state.wrongbook).sort((a, b) => a.questionNo - b.questionNo);
  if (!items.length) {
    wrongList.innerHTML = '<div class="empty">还没有错题。自动判分或手动标记后会出现在这里。</div>';
    return;
  }
  wrongList.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "wrong-item";
    card.innerHTML = `<strong>第 ${item.questionNo} 题</strong><span>${getSet(item.setId).title} · ${item.reason}${item.resolved ? " · 已掌握" : ""}</span>`;
    const actions = document.createElement("div");
    actions.className = "wrong-actions";
    const open = document.createElement("button");
    open.textContent = "查看";
    open.addEventListener("click", () => {
      currentSetId = item.setId;
      activeTab = "solutions";
      switchView("practice");
      renderAll();
    });
    const done = document.createElement("button");
    done.textContent = item.resolved ? "恢复" : "掌握";
    done.addEventListener("click", () => {
      state.wrongbook[setKey(item.setId, item.qIndex)].resolved = !item.resolved;
      saveState();
      renderWrongbook();
    });
    const remove = document.createElement("button");
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      delete state.wrongbook[setKey(item.setId, item.qIndex)];
      saveState();
      renderWrongbook();
      renderAnswerSheet();
    });
    actions.append(open, done, remove);
    card.appendChild(actions);
    wrongList.appendChild(card);
  });
}

function renderSettings() {
  const set = getSet();
  const keys = [...getAnswerKey(set.id)];
  document.getElementById("answerBulk").value = keys.filter(Boolean).length ? keys.map((x) => x || "_").join("") : "";
  const grid = document.getElementById("answerKeyGrid");
  grid.innerHTML = "";
  for (let i = 0; i < 20; i += 1) {
    const row = document.createElement("div");
    row.className = "key-row";
    row.dataset.index = String(i);
    const no = document.createElement("div");
    no.className = "qno";
    no.textContent = questionNo(set.id, i);
    row.appendChild(no);
    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.textContent = choice;
      if (keys[i] === choice) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        keys[i] = choice;
        state.answerKeys[set.id] = keys;
        saveState();
        renderSettings();
      });
      row.appendChild(btn);
    });
    grid.appendChild(row);
  }
}

function saveBulkAnswers() {
  const value = document.getElementById("answerBulk").value.toUpperCase().replace(/[^ABCD]/g, "");
  if (value.length !== 20) {
    alert("请录入 20 个 A/B/C/D 答案。");
    return;
  }
  state.answerKeys[currentSetId] = value.split("");
  saveState();
  renderSettings();
  renderAnswerSheet();
}

function switchView(view) {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  document.getElementById("practiceView").classList.toggle("hidden", view !== "practice");
  document.getElementById("wrongbookView").classList.toggle("hidden", view !== "wrongbook");
  document.getElementById("settingsView").classList.toggle("hidden", view !== "settings");
  if (view === "wrongbook") renderWrongbook();
  if (view === "settings") renderSettings();
}

function renderAll() {
  renderSetGrid();
  renderHeader();
  renderPages();
  renderAnswerSheet();
  renderTimer();
}

document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
  activeTab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === activeTab));
  renderPages();
}));
document.getElementById("startBtn").addEventListener("click", startSet);
document.getElementById("submitBtn").addEventListener("click", submitSet);
document.getElementById("zoomIn").addEventListener("click", () => {
  zoom = Math.min(1300, zoom + 100);
  saveState();
  renderPages();
});
document.getElementById("zoomOut").addEventListener("click", () => {
  zoom = Math.max(520, zoom - 100);
  saveState();
  renderPages();
});
document.getElementById("saveAnswersBtn").addEventListener("click", saveBulkAnswers);
document.getElementById("clearResolvedBtn").addEventListener("click", () => {
  Object.keys(state.wrongbook).forEach((key) => {
    if (state.wrongbook[key].resolved) delete state.wrongbook[key];
  });
  saveState();
  renderWrongbook();
});

renderAll();
startTimerLoop();
