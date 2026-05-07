const STORAGE_KEY = "xenoah-sanrikutoku-state-v1";

const dom = {
    answered: document.getElementById("stat-answered"),
    law: document.getElementById("stat-law"),
    engineering: document.getElementById("stat-engineering"),
    result: document.getElementById("stat-result"),
    source: document.getElementById("source-label"),
    counter: document.getElementById("counter-label"),
    subject: document.getElementById("subject-label"),
    bookmark: document.getElementById("bookmark-button"),
    question: document.getElementById("question-text"),
    choices: document.getElementById("choices"),
    answerPanel: document.getElementById("answer-panel"),
    answerLine: document.getElementById("answer-line"),
    explanation: document.getElementById("explanation-text"),
    prev: document.getElementById("prev-button"),
    next: document.getElementById("next-button"),
    reveal: document.getElementById("reveal-button"),
    master: document.getElementById("master-button"),
    reset: document.getElementById("reset-button"),
    shuffle: document.getElementById("shuffle-toggle"),
    filters: Array.from(document.querySelectorAll("[data-filter]")),
    sourceNote: document.getElementById("source-note"),
    resultDialog: document.getElementById("result-dialog"),
    resultTitle: document.getElementById("result-title"),
    resultLead: document.getElementById("result-lead"),
    resultLaw: document.getElementById("result-law"),
    resultEngineering: document.getElementById("result-engineering"),
    resultTotal: document.getElementById("result-total"),
    resultMissedList: document.getElementById("result-missed-list"),
    resultReview: document.getElementById("result-review-button"),
    resultClose: document.getElementById("result-close-button")
};

let questions = [];
let examPattern = null;
let officialSources = [];
let order = [];
let state = {
    current: 0,
    filter: "all",
    shuffle: false,
    selected: {},
    correct: {},
    missed: {},
    mastered: {},
    bookmarked: {},
    revealed: {},
    resultAnnounced: false
};

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && typeof saved === "object") {
            state = { ...state, ...saved };
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function filteredQuestions() {
    const base = questions.filter((question) => {
        if (state.filter === "missed") return Boolean(state.missed[question.id]);
        if (state.filter === "bookmarked") return Boolean(state.bookmarked[question.id]);
        if (state.filter === "mastered") return Boolean(state.mastered[question.id]);
        return true;
    });

    return state.shuffle ? shuffleArray(base) : base;
}

function rebuildOrder() {
    order = filteredQuestions();
    if (state.current >= order.length) {
        state.current = Math.max(order.length - 1, 0);
    }
    saveState();
}

function currentQuestion() {
    return order[state.current] || null;
}

function answeredIds() {
    return new Set([...Object.keys(state.correct), ...Object.keys(state.missed)]);
}

function computeExamResult() {
    const answered = answeredIds();
    const scored = { "法規": 0, "無線工学": 0 };

    questions.forEach((question) => {
        if (state.correct[question.id]) {
            scored[question.subject] = (scored[question.subject] || 0) + 5;
        }
    });

    const lawPassed = scored["法規"] >= 40;
    const engineeringPassed = scored["無線工学"] >= 40;
    const allAnswered = answered.size >= 24;
    const total = (scored["法規"] || 0) + (scored["無線工学"] || 0);

    return {
        answered,
        lawScore: scored["法規"] || 0,
        engineeringScore: scored["無線工学"] || 0,
        total,
        lawPassed,
        engineeringPassed,
        allAnswered,
        passed: allAnswered && lawPassed && engineeringPassed
    };
}

function updateStats() {
    const result = computeExamResult();

    dom.answered.textContent = `${result.answered.size}/24`;
    dom.law.textContent = `${result.lawScore}/60`;
    dom.engineering.textContent = `${result.engineeringScore}/60`;
    dom.result.textContent = result.allAnswered ? (result.passed ? "合格圏" : "復習") : "-";
}

function updateFilterButtons() {
    dom.filters.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.filter === state.filter);
    });
    dom.shuffle.checked = state.shuffle;
}

function setChoiceClasses(question) {
    const selected = state.selected[question.id];
    const revealed = state.revealed[question.id];

    Array.from(dom.choices.children).forEach((button) => {
        const value = button.dataset.choice;
        button.classList.toggle("is-selected", value === selected && !revealed);
        button.classList.toggle("is-correct", revealed && value === question.answer);
        button.classList.toggle("is-wrong", revealed && value === selected && selected !== question.answer);
    });
}

function renderEmptyState() {
    dom.source.textContent = "該当する問題がありません";
    dom.counter.textContent = "0 / 0";
    dom.subject.textContent = "-";
    dom.question.textContent = "この条件に合うカードはまだありません。全問に戻すか、問題を解いてからもう一度開いてください。";
    dom.choices.innerHTML = "";
    dom.answerPanel.hidden = true;
    dom.bookmark.classList.remove("is-active");
    dom.master.classList.remove("is-active");
    dom.master.textContent = "習得済みにする";
}

function renderQuestion() {
    updateStats();
    updateFilterButtons();

    const question = currentQuestion();
    if (!question) {
        renderEmptyState();
        return;
    }

    const selected = state.selected[question.id];
    const revealed = state.revealed[question.id];
    const answerChoice = question.choices.find((choice) => choice.id === question.answer);

    dom.source.innerHTML = "";
    const sourceLink = document.createElement(question.sourceUrl ? "a" : "span");
    sourceLink.textContent = `${question.source} / ${question.published || "年月不明"} / 問${question.officialQuestionNo || "-"}`;
    if (question.sourceUrl) {
        sourceLink.href = question.sourceUrl;
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener";
    }
    dom.source.appendChild(sourceLink);
    dom.counter.textContent = `${state.current + 1} / ${order.length}`;
    dom.subject.textContent = question.subject;
    dom.question.textContent = question.question;
    dom.bookmark.textContent = state.bookmarked[question.id] ? "★" : "☆";
    dom.bookmark.classList.toggle("is-active", Boolean(state.bookmarked[question.id]));
    dom.master.classList.toggle("is-active", Boolean(state.mastered[question.id]));
    dom.master.textContent = state.mastered[question.id] ? "習得済みを解除" : "習得済みにする";

    dom.choices.innerHTML = "";
    question.choices.forEach((choice) => {
        const button = document.createElement("button");
        button.className = "choice-button";
        button.type = "button";
        button.dataset.choice = choice.id;
        button.textContent = `${choice.id}. ${choice.text}`;
        button.addEventListener("click", () => selectChoice(question, choice.id));
        dom.choices.appendChild(button);
    });

    dom.answerPanel.hidden = !revealed;
    dom.answerLine.textContent = answerChoice ? `正解: ${answerChoice.id}. ${answerChoice.text}` : `正解: ${question.answer}`;
    dom.explanation.textContent = question.explanation;
    dom.reveal.textContent = revealed ? "解説を閉じる" : selected ? "採点する" : "解答を見る";
    setChoiceClasses(question);
    announceResultIfComplete();
}

function renderResultDialog(result) {
    if (!dom.resultDialog) return;

    const missedQuestions = questions.filter((question) => state.missed[question.id]);

    dom.resultTitle.textContent = result.passed ? "合格圏です" : "復習しましょう";
    dom.resultLead.textContent = result.passed
        ? "1周完了。法規・無線工学ともに公式基準の40点以上に届いています。"
        : "1周完了。各科目40点以上が目安なので、間違えた問題をもう一度固めましょう。";
    dom.resultLaw.textContent = `${result.lawScore}/60`;
    dom.resultEngineering.textContent = `${result.engineeringScore}/60`;
    dom.resultTotal.textContent = `${result.total}/120`;

    dom.resultMissedList.innerHTML = "";
    if (missedQuestions.length === 0) {
        const item = document.createElement("li");
        item.textContent = "間違えた問題はありません。";
        dom.resultMissedList.appendChild(item);
    } else {
        missedQuestions.forEach((question) => {
            const item = document.createElement("li");
            item.textContent = `${question.subject} 問${question.officialQuestionNo}: ${question.question}`;
            dom.resultMissedList.appendChild(item);
        });
    }

    dom.resultReview.disabled = missedQuestions.length === 0;
    dom.resultDialog.hidden = false;
}

function closeResultDialog() {
    if (dom.resultDialog) {
        dom.resultDialog.hidden = true;
    }
}

function announceResultIfComplete() {
    const result = computeExamResult();
    if (!result.allAnswered || state.resultAnnounced) return;

    state.resultAnnounced = true;
    saveState();
    renderResultDialog(result);
}

function renderSourceNote() {
    if (!examPattern || !dom.sourceNote) return;
    const catalog = officialSources.find((source) => source.id === "jri-cbt-examples");
    const sourceText = catalog
        ? `<a href="${catalog.url}" target="_blank" rel="noopener">日本無線協会 CBT方式の国家試験の例題</a>`
        : "日本無線協会 CBT方式の国家試験の例題";
    dom.sourceNote.innerHTML = `問題データは <code>questions.json</code> で管理しています。出題形式は公式資料に合わせて、法規12問・無線工学12問の計24問、試験時間${examPattern.timeLimitMinutes}分、各科目60点中40点以上を合格圏として表示します。参照元: ${sourceText}。`;
}

function selectChoice(question, choiceId) {
    state.selected[question.id] = choiceId;
    state.revealed[question.id] = true;

    if (choiceId === question.answer) {
        state.correct[question.id] = true;
        delete state.missed[question.id];
    } else {
        state.missed[question.id] = true;
        delete state.correct[question.id];
    }

    saveState();
    renderQuestion();
}

function move(delta) {
    if (!order.length) return;
    state.current = (state.current + delta + order.length) % order.length;
    saveState();
    renderQuestion();
}

function revealAnswer() {
    const question = currentQuestion();
    if (!question) return;
    state.revealed[question.id] = !state.revealed[question.id];
    saveState();
    renderQuestion();
}

function toggleBookmark() {
    const question = currentQuestion();
    if (!question) return;
    state.bookmarked[question.id] = !state.bookmarked[question.id];
    if (!state.bookmarked[question.id]) delete state.bookmarked[question.id];
    saveState();
    renderQuestion();
}

function toggleMastered() {
    const question = currentQuestion();
    if (!question) return;
    state.mastered[question.id] = !state.mastered[question.id];
    if (!state.mastered[question.id]) delete state.mastered[question.id];
    saveState();
    renderQuestion();
}

function setFilter(filter) {
    state.filter = filter;
    state.current = 0;
    rebuildOrder();
    renderQuestion();
}

function resetProgress() {
    const keepSettings = {
        filter: state.filter,
        shuffle: state.shuffle
    };
    state = {
        current: 0,
        filter: keepSettings.filter,
        shuffle: keepSettings.shuffle,
        selected: {},
        correct: {},
        missed: {},
        mastered: {},
        bookmarked: {},
        revealed: {},
        resultAnnounced: false
    };
    rebuildOrder();
    renderQuestion();
}

function bindEvents() {
    dom.prev.addEventListener("click", () => move(-1));
    dom.next.addEventListener("click", () => move(1));
    dom.reveal.addEventListener("click", revealAnswer);
    dom.bookmark.addEventListener("click", toggleBookmark);
    dom.master.addEventListener("click", toggleMastered);
    dom.reset.addEventListener("click", resetProgress);
    dom.resultClose.addEventListener("click", closeResultDialog);
    dom.resultReview.addEventListener("click", () => {
        closeResultDialog();
        setFilter("missed");
    });
    dom.shuffle.addEventListener("change", () => {
        state.shuffle = dom.shuffle.checked;
        state.current = 0;
        rebuildOrder();
        renderQuestion();
    });
    dom.filters.forEach((button) => {
        button.addEventListener("click", () => setFilter(button.dataset.filter));
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
        if (event.key === "Escape") closeResultDialog();
        if (event.key === " ") {
            event.preventDefault();
            revealAnswer();
        }
    });
}

async function init() {
    bindEvents();
    loadState();

    try {
        const response = await fetch("questions.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        questions = data.questions || [];
        examPattern = data.examPattern || null;
        officialSources = data.officialSources || [];
        rebuildOrder();
        renderSourceNote();
        renderQuestion();
    } catch (error) {
        dom.question.textContent = "questions.json を読み込めませんでした。GitHub Pages などのWebサーバー上で開いてください。";
        dom.source.textContent = String(error.message || error);
    }
}

init();
