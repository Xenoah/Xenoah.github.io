const CATALOG_FILES = [
    {
        id: "3rikutoku",
        url: "questions.json",
        shortName: "三陸特",
        qualification: "第三級陸上特殊無線技士"
    },
    {
        id: "2rikutoku",
        url: "questions-2rikutoku.json",
        shortName: "二陸特",
        qualification: "第二級陸上特殊無線技士"
    },
    {
        id: "1rikutoku",
        url: "questions-1rikutoku.json",
        shortName: "一陸特",
        qualification: "第一級陸上特殊無線技士"
    }
];

const PAGE_MODE = document.body?.dataset.pageMode || "menu";
const PAGE_QUALIFICATION_ID = document.body?.dataset.qualification || "";
const ACTIVE_QUALIFICATION_KEY = "xenoah-rikutoku-active-qualification-v1";
const STATE_KEY_PREFIX = "xenoah-rikutoku-study-state-v2";
const LEGACY_STORAGE_KEY = "xenoah-sanrikutoku-state-v1";

const dom = {
    appTitle: document.getElementById("app-title"),
    eyebrow: document.getElementById("qualification-eyebrow"),
    homeMenu: document.getElementById("home-menu"),
    examSections: Array.from(document.querySelectorAll("[data-exam-section]")),
    historyView: document.getElementById("history-view"),
    historyViewList: document.getElementById("history-view-list"),
    overviewJa: document.getElementById("overview-ja"),
    overviewEn: document.getElementById("overview-en"),
    qualificationTabs: document.getElementById("qualification-tabs"),
    qualificationSummary: document.getElementById("qualification-summary"),
    answered: document.getElementById("stat-answered"),
    lawLabel: document.getElementById("stat-law-label"),
    law: document.getElementById("stat-law"),
    engineeringLabel: document.getElementById("stat-engineering-label"),
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
    resultLawLabel: document.getElementById("result-law-label"),
    resultLaw: document.getElementById("result-law"),
    resultEngineeringLabel: document.getElementById("result-engineering-label"),
    resultEngineering: document.getElementById("result-engineering"),
    resultTotal: document.getElementById("result-total"),
    resultTime: document.getElementById("result-time"),
    resultMissedList: document.getElementById("result-missed-list"),
    resultAllList: document.getElementById("result-all-list"),
    resultHistoryList: document.getElementById("result-history-list"),
    resultReview: document.getElementById("result-review-button"),
    resultRetry: document.getElementById("result-retry-button"),
    finish: document.getElementById("finish-button"),
    progressFill: document.getElementById("progress-fill"),
    palette: document.getElementById("question-palette"),
    timer: document.getElementById("timer-display"),
    examMode: document.getElementById("exam-mode-toggle"),
    autoNext: document.getElementById("auto-next-toggle"),
    timerBox: document.querySelector(".timer-box"),
    resultClose: document.getElementById("result-close-button")
};

let catalogs = [];
let activeCatalog = null;
let questions = [];
let examPattern = null;
let officialSources = [];
let order = [];
let state = createDefaultState();
let timerInterval = null;
let currentView = "menu";

function createDefaultState() {
    return {
        current: 0,
        filter: "all",
        shuffle: false,
        selected: {},
        correct: {},
        missed: {},
        mastered: {},
        bookmarked: {},
        revealed: {},
        resultAnnounced: false,
        resultRecorded: false,
        resultHistory: [],
        examMode: false,
        autoNext: false,
        examFinished: false,
        startedAt: null,
        finishedAt: null
    };
}

function defaultSubjects() {
    return [
        { name: "法規", count: 12, pointsPerQuestion: 5, maxScore: 60, passingScore: 40 },
        { name: "無線工学", count: 12, pointsPerQuestion: 5, maxScore: 60, passingScore: 40 }
    ];
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stateKey(qualificationId) {
    return `${STATE_KEY_PREFIX}-${qualificationId}`;
}

function sanitizeState(saved) {
    const next = { ...createDefaultState(), ...(isPlainObject(saved) ? saved : {}) };
    next.selected = isPlainObject(next.selected) ? next.selected : {};
    next.correct = isPlainObject(next.correct) ? next.correct : {};
    next.missed = isPlainObject(next.missed) ? next.missed : {};
    next.mastered = isPlainObject(next.mastered) ? next.mastered : {};
    next.bookmarked = isPlainObject(next.bookmarked) ? next.bookmarked : {};
    next.revealed = isPlainObject(next.revealed) ? next.revealed : {};
    next.resultHistory = Array.isArray(next.resultHistory) ? next.resultHistory : [];
    next.filter = ["all", "unanswered", "missed", "bookmarked", "mastered"].includes(next.filter) ? next.filter : "all";
    next.current = Number.isFinite(next.current) ? next.current : 0;
    next.shuffle = Boolean(next.shuffle);
    next.resultAnnounced = Boolean(next.resultAnnounced);
    next.resultRecorded = Boolean(next.resultRecorded);
    next.examMode = Boolean(next.examMode);
    next.autoNext = Boolean(next.autoNext);
    next.examFinished = Boolean(next.examFinished);
    return next;
}

function loadState(qualificationId) {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(stateKey(qualificationId)));
        if (!saved && qualificationId === "3rikutoku") {
            saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
        }
    } catch {
        saved = null;
    }
    state = sanitizeState(saved);
}

function saveState() {
    if (!activeCatalog) return;
    localStorage.setItem(stateKey(activeCatalog.id), JSON.stringify(state));
    localStorage.setItem(ACTIVE_QUALIFICATION_KEY, activeCatalog.id);
}

function normalizeCatalog(file, data) {
    const exam = data.examPattern || {};
    const subjects = Array.isArray(exam.subjects) && exam.subjects.length ? exam.subjects : defaultSubjects();
    const id = data.qualificationId || file.id;
    const shortName = data.shortTitle || file.shortName || id;
    return {
        id,
        url: file.url,
        dataFile: data.dataFile || file.url,
        shortName,
        title: data.title || `${shortName} 公式例題ベース単語帳データ`,
        appTitle: `${shortName} 過去問単語帳`,
        qualification: exam.qualification || file.qualification || shortName,
        description: data.description || "",
        examPattern: { ...exam, subjects },
        officialSources: Array.isArray(data.officialSources) ? data.officialSources : [],
        questions: Array.isArray(data.questions)
            ? data.questions.map((question) => ({ ...question, qualificationId: id }))
            : []
    };
}

async function loadCatalogs() {
    const files = PAGE_QUALIFICATION_ID
        ? CATALOG_FILES.filter((file) => file.id === PAGE_QUALIFICATION_ID)
        : CATALOG_FILES;
    const loaded = await Promise.all(
        files.map(async (file) => {
            const response = await fetch(file.url, { cache: "no-store" });
            if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
            const data = await response.json();
            return normalizeCatalog(file, data);
        })
    );
    catalogs = loaded;
}

function preferredQualificationId() {
    if (catalogs.some((catalog) => catalog.id === PAGE_QUALIFICATION_ID)) return PAGE_QUALIFICATION_ID;

    const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (catalogs.some((catalog) => catalog.id === hashId)) return hashId;

    const savedId = localStorage.getItem(ACTIVE_QUALIFICATION_KEY);
    if (catalogs.some((catalog) => catalog.id === savedId)) return savedId;

    return catalogs.some((catalog) => catalog.id === "3rikutoku") ? "3rikutoku" : catalogs[0]?.id;
}

function setVisibleView(view) {
    currentView = view;
    if (dom.homeMenu) dom.homeMenu.hidden = view !== "menu";
    if (dom.historyView) dom.historyView.hidden = view !== "history";
    dom.examSections.forEach((section) => {
        section.hidden = view !== "exam";
    });
    if (dom.reset) dom.reset.hidden = view !== "exam";
    closeResultDialog();
}

function renderHomeChrome() {
    document.title = "陸特 模試メニュー | Radio Operator Exam Study | Xenoah";
    dom.eyebrow.textContent = "陸上特殊無線技士";
    dom.appTitle.textContent = "陸特 模試メニュー";
}

function renderHistoryChrome() {
    document.title = "陸特 過去成績 | Radio Operator Exam Study | Xenoah";
    dom.eyebrow.textContent = "陸上特殊無線技士";
    dom.appTitle.textContent = "過去成績";
}

function parseRoute() {
    if (PAGE_MODE === "exam") {
        return { view: "exam", qualificationId: preferredQualificationId() };
    }
    if (PAGE_MODE === "history") {
        return { view: "history" };
    }

    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!hash || hash === "menu") return { view: "menu" };
    if (hash === "history") return { view: "history" };
    if (PAGE_MODE === "menu") return { view: "menu" };

    const mockMatch = hash.match(/^mock-(.+)$/);
    if (mockMatch && catalogs.some((catalog) => catalog.id === mockMatch[1])) {
        return { view: "exam", qualificationId: mockMatch[1] };
    }

    if (catalogs.some((catalog) => catalog.id === hash)) {
        return { view: "exam", qualificationId: hash };
    }

    return { view: "menu" };
}

function replaceHash(hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}#${hash}`);
}

function pushHash(hash) {
    if (location.hash === `#${hash}`) return;
    history.pushState(null, "", `${location.pathname}${location.search}#${hash}`);
}

function setActiveCatalog(qualificationId, options = {}) {
    const nextCatalog = catalogs.find((catalog) => catalog.id === qualificationId) || catalogs[0];
    if (!nextCatalog) return;

    if (activeCatalog && activeCatalog.id !== nextCatalog.id) {
        saveState();
    }

    activeCatalog = nextCatalog;
    questions = activeCatalog.questions;
    examPattern = activeCatalog.examPattern;
    officialSources = activeCatalog.officialSources;
    loadState(activeCatalog.id);
    if (state.resultAnnounced && !state.examFinished && answeredIds().size >= totalQuestionCount()) {
        lockExam();
        saveState();
    }
    rebuildOrder();
    renderCatalogChrome();
    renderSourceNote();
    syncTimer();
    renderQuestion();

    if (options.pushHash) {
        replaceHash(options.hash || `mock-${activeCatalog.id}`);
    }
}

function startMockExam(qualificationId, options = {}) {
    setVisibleView("exam");
    setActiveCatalog(qualificationId);
    if (!activeCatalog) return;

    if (options.resetCompleted && (state.examFinished || state.resultAnnounced)) {
        const resultHistory = state.resultHistory || [];
        state = {
            ...createDefaultState(),
            resultHistory,
            examMode: true,
            startedAt: Date.now()
        };
    } else {
        state.examMode = true;
        if (!state.examFinished && !state.startedAt) {
            state.startedAt = Date.now();
        }
    }

    saveState();
    rebuildOrder();
    renderCatalogChrome();
    renderSourceNote();
    syncTimer();
    renderQuestion();

    if (options.pushHash) {
        pushHash(`mock-${activeCatalog.id}`);
    }
}

function showMenu(options = {}) {
    setVisibleView("menu");
    renderHomeChrome();
    if (options.pushHash) {
        pushHash("menu");
    }
}

function readSavedState(qualificationId) {
    try {
        return sanitizeState(JSON.parse(localStorage.getItem(stateKey(qualificationId))));
    } catch {
        return createDefaultState();
    }
}

function renderHistoryView() {
    if (!dom.historyViewList) return;
    dom.historyViewList.innerHTML = "";

    catalogs.forEach((catalog) => {
        const saved = activeCatalog?.id === catalog.id ? state : readSavedState(catalog.id);
        const history = Array.isArray(saved.resultHistory) ? saved.resultHistory.slice(0, 8) : [];
        const section = document.createElement("section");
        section.className = "history-group";

        const heading = document.createElement("h3");
        heading.textContent = catalog.qualification;
        section.appendChild(heading);

        if (!history.length) {
            const empty = document.createElement("p");
            empty.className = "history-empty";
            empty.textContent = "まだ成績はありません。";
            section.appendChild(empty);
        } else {
            const list = document.createElement("ol");
            history.forEach((entry) => {
                const item = document.createElement("li");
                const date = new Date(entry.at);
                const label = document.createElement("span");
                const score = document.createElement("strong");
                const max = entry.totalMax || 0;
                label.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                score.textContent = `${entry.passed ? "合格圏" : "復習"} ${entry.total}/${max} ${formatTime(entry.elapsedSeconds || 0)}`;
                item.append(label, score);
                list.appendChild(item);
            });
            section.appendChild(list);
        }

        dom.historyViewList.appendChild(section);
    });
}

function showHistory(options = {}) {
    setVisibleView("history");
    renderHistoryChrome();
    renderHistoryView();
    if (options.pushHash) {
        pushHash("history");
    }
}

function openMockFromMenu(qualificationId) {
    if (!qualificationId) return;
    pushHash(`mock-${qualificationId}`);
    if (catalogs.some((catalog) => catalog.id === qualificationId)) {
        startMockExam(qualificationId, { resetCompleted: true });
    }
}

function handleRoute() {
    const route = parseRoute();
    if (route.view === "exam") {
        startMockExam(route.qualificationId);
        return;
    }
    if (route.view === "history") {
        showHistory();
        return;
    }
    showMenu();
}

function getSubjects() {
    return Array.isArray(examPattern?.subjects) && examPattern.subjects.length ? examPattern.subjects : defaultSubjects();
}

function subjectSpec(subjectName) {
    return getSubjects().find((subject) => subject.name === subjectName) || {
        name: subjectName,
        count: 0,
        pointsPerQuestion: 5,
        maxScore: 0,
        passingScore: 0
    };
}

function subjectMaxScore(subject) {
    const count = Number(subject.count) || questions.filter((question) => question.subject === subject.name).length;
    const points = Number(subject.pointsPerQuestion) || 5;
    return Number(subject.maxScore) || count * points;
}

function subjectPassingScore(subject) {
    const max = subjectMaxScore(subject);
    return Number(subject.passingScore) || Math.ceil(max * 0.67);
}

function totalMaxScore() {
    return getSubjects().reduce((sum, subject) => sum + subjectMaxScore(subject), 0);
}

function totalQuestionCount() {
    return questions.length || Number(examPattern?.questionCount) || getSubjects().reduce((sum, subject) => sum + (Number(subject.count) || 0), 0);
}

function currentQuestionIds() {
    return new Set(questions.map((question) => question.id));
}

function answeredIds() {
    const validIds = currentQuestionIds();
    return new Set(
        [...Object.keys(state.correct), ...Object.keys(state.missed)]
            .filter((id) => validIds.has(id))
    );
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
        if (state.filter === "unanswered") return !state.selected[question.id];
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
    if (state.current < 0) state.current = 0;
    saveState();
}

function currentQuestion() {
    return order[state.current] || null;
}

function computeExamResult() {
    const answered = answeredIds();
    const scores = Object.fromEntries(getSubjects().map((subject) => [subject.name, 0]));

    questions.forEach((question) => {
        if (state.correct[question.id]) {
            const subject = subjectSpec(question.subject);
            scores[question.subject] = (scores[question.subject] || 0) + (Number(subject.pointsPerQuestion) || 5);
        }
    });

    const subjectResults = getSubjects().map((subject) => {
        const maxScore = subjectMaxScore(subject);
        const passingScore = subjectPassingScore(subject);
        const score = scores[subject.name] || 0;
        return {
            name: subject.name,
            score,
            maxScore,
            passingScore,
            passed: score >= passingScore
        };
    });

    const total = subjectResults.reduce((sum, subject) => sum + subject.score, 0);
    const totalMax = subjectResults.reduce((sum, subject) => sum + subject.maxScore, 0);
    const allAnswered = answered.size >= totalQuestionCount();

    return {
        answered,
        subjectResults,
        total,
        totalMax,
        allAnswered,
        passed: allAnswered && subjectResults.every((subject) => subject.passed)
    };
}

function subjectResultAt(result, index) {
    return result.subjectResults[index] || {
        name: "-",
        score: 0,
        maxScore: 0,
        passingScore: 0,
        passed: false
    };
}

function formatScore(score, maxScore) {
    return `${score}/${maxScore}`;
}

function updateStats() {
    const result = computeExamResult();
    const first = subjectResultAt(result, 0);
    const second = subjectResultAt(result, 1);
    const hideScores = state.examMode && !result.allAnswered && !state.examFinished;

    dom.answered.textContent = `${result.answered.size}/${totalQuestionCount()}`;
    dom.lawLabel.textContent = first.name;
    dom.engineeringLabel.textContent = second.name;
    dom.law.textContent = hideScores ? `--/${first.maxScore}` : formatScore(first.score, first.maxScore);
    dom.engineering.textContent = hideScores ? `--/${second.maxScore}` : formatScore(second.score, second.maxScore);
    dom.result.textContent = state.examFinished ? "終了" : result.allAnswered ? (result.passed ? "合格圏" : "復習") : "-";

    if (dom.progressFill) {
        const denominator = Math.max(totalQuestionCount(), 1);
        dom.progressFill.style.width = `${Math.min(100, (result.answered.size / denominator) * 100)}%`;
    }
}

function updateFilterButtons() {
    const locked = state.examFinished;
    dom.filters.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.filter === state.filter);
        button.disabled = locked;
    });
    dom.shuffle.checked = state.shuffle;
    dom.examMode.checked = state.examMode;
    dom.autoNext.checked = state.autoNext;
    dom.shuffle.disabled = locked;
    dom.examMode.disabled = true;
    dom.autoNext.disabled = locked;
    dom.finish.disabled = locked;
}

function renderQualificationTabs() {
    if (!dom.qualificationTabs) return;
    dom.qualificationTabs.innerHTML = "";
    catalogs.forEach((catalog) => {
        const button = document.createElement("button");
        button.className = "segment";
        button.type = "button";
        button.role = "tab";
        button.textContent = catalog.shortName;
        button.classList.toggle("is-active", catalog.id === activeCatalog?.id);
        button.setAttribute("aria-selected", String(catalog.id === activeCatalog?.id));
        button.addEventListener("click", () => startMockExam(catalog.id, { pushHash: PAGE_MODE !== "exam" }));
        dom.qualificationTabs.appendChild(button);
    });
}

function renderCatalogChrome() {
    if (!activeCatalog) return;
    const subjectSummary = getSubjects()
        .map((subject) => `${subject.name}${subject.count || questions.filter((question) => question.subject === subject.name).length}問`)
        .join("・");
    const title = `${activeCatalog.qualification}・模試 | Radio Operator Exam Study | Xenoah`;
    const description = `${activeCatalog.qualification}の法規・無線工学を、模試形式、採点、全問解説、過去成績で学習できる教材です。`;

    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", `${description} / Study Japanese land radio operator law and engineering with quizzes and review tools.`);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);

    dom.eyebrow.textContent = activeCatalog.qualification;
    dom.appTitle.textContent = `${activeCatalog.shortName} 模試`;
    dom.overviewJa.textContent = `${activeCatalog.qualification}の法規・無線工学を、模試形式、採点、全問解説、過去成績で学習できるブラウザ教材です。`;
    dom.overviewEn.textContent = `A browser mock exam for ${activeCatalog.shortName}, with law and engineering questions, scoring, full explanations and saved results.`;
    dom.qualificationSummary.textContent = `${questions.length}問 / ${subjectSummary} / 模試${examPattern?.timeLimitMinutes || 60}分`;
    renderQualificationTabs();
}

function renderPalette() {
    if (!dom.palette) return;
    dom.palette.innerHTML = "";
    order.forEach((question, index) => {
        const button = document.createElement("button");
        button.className = "palette-button";
        button.type = "button";
        button.textContent = question.officialQuestionNo || index + 1;
        button.classList.toggle("is-current", index === state.current);
        button.classList.toggle("is-correct", Boolean(state.correct[question.id]));
        button.classList.toggle("is-wrong", Boolean(state.missed[question.id]));
        button.classList.toggle("is-bookmarked", Boolean(state.bookmarked[question.id]));
        button.addEventListener("click", () => {
            state.current = index;
            saveState();
            renderQuestion();
        });
        dom.palette.appendChild(button);
    });
}

function setChoiceClasses(question) {
    const selected = state.selected[question.id];
    const revealed = state.examFinished || state.revealed[question.id];
    const hideAnswer = state.examMode && !computeExamResult().allAnswered && !state.examFinished;

    Array.from(dom.choices.children).forEach((button) => {
        const value = button.dataset.choice;
        button.classList.toggle("is-selected", value === selected && (!revealed || hideAnswer));
        button.classList.toggle("is-correct", !hideAnswer && revealed && value === question.answer);
        button.classList.toggle("is-wrong", !hideAnswer && revealed && value === selected && selected !== question.answer);
    });
}

function renderEmptyState() {
    dom.source.textContent = "該当する問題がありません";
    dom.counter.textContent = "0 / 0";
    dom.subject.textContent = "-";
    dom.question.textContent = "この条件に合うカードはまだありません。全問に戻すか、問題を解いてからもう一度開いてください。";
    dom.choices.innerHTML = "";
    dom.answerPanel.hidden = true;
    dom.bookmark.textContent = "☆";
    dom.bookmark.classList.remove("is-active");
    dom.master.classList.remove("is-active");
    dom.master.textContent = "習得済みにする";
}

function renderQuestion() {
    updateStats();
    updateFilterButtons();
    renderPalette();

    const question = currentQuestion();
    if (!question) {
        renderEmptyState();
        return;
    }

    const selected = state.selected[question.id];
    const locked = state.examFinished;
    const revealed = locked || state.revealed[question.id];
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
    dom.bookmark.disabled = locked;
    dom.master.classList.toggle("is-active", Boolean(state.mastered[question.id]));
    dom.master.textContent = state.mastered[question.id] ? "習得済みを解除" : "習得済みにする";
    dom.master.disabled = locked;

    dom.choices.innerHTML = "";
    question.choices.forEach((choice) => {
        const button = document.createElement("button");
        button.className = "choice-button";
        button.type = "button";
        button.dataset.choice = choice.id;
        button.disabled = locked;
        button.textContent = `${choice.id}. ${choice.text}`;
        button.addEventListener("click", () => selectChoice(question, choice.id));
        dom.choices.appendChild(button);
    });

    const hideAnswer = state.examMode && !computeExamResult().allAnswered && !locked;
    dom.answerPanel.hidden = !revealed || hideAnswer;
    dom.answerLine.textContent = answerChoice ? `正解: ${answerChoice.id}. ${answerChoice.text}` : `正解: ${question.answer}`;
    dom.explanation.textContent = question.explanation;
    dom.reveal.disabled = hideAnswer && !locked;
    dom.reveal.textContent = locked ? "結果を見る" : hideAnswer ? "結果発表まで非表示" : revealed ? "解説を閉じる" : selected ? "採点する" : "解答を見る";
    setChoiceClasses(question);
    announceResultIfComplete();
}

function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const rest = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function elapsedSeconds() {
    if (!state.startedAt) return 0;
    const end = state.finishedAt || Date.now();
    return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}

function updateTimer() {
    if (!dom.timer) return;
    const limit = (examPattern?.timeLimitMinutes || 60) * 60;
    const remaining = state.startedAt ? Math.max(0, limit - elapsedSeconds()) : limit;
    dom.timer.textContent = formatTime(remaining);
    dom.timerBox?.classList.toggle("is-low", state.startedAt && remaining > 0 && remaining <= 300);

    if (state.startedAt && remaining === 0 && !state.resultAnnounced && !computeExamResult().allAnswered) {
        finishExam(true);
    }
}

function syncTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (state.startedAt && !state.finishedAt) {
        timerInterval = setInterval(updateTimer, 1000);
    }
    updateTimer();
}

function startTimer() {
    if (state.examFinished) return;
    if (!state.startedAt) {
        state.startedAt = Date.now();
        state.finishedAt = null;
        saveState();
    }
    syncTimer();
}

function passingSummary(result) {
    return result.subjectResults
        .map((subject) => `${subject.name}${subject.passingScore}点/${subject.maxScore}点`)
        .join("・");
}

function revealAllAnswers() {
    questions.forEach((question) => {
        state.revealed[question.id] = true;
    });
}

function lockExam() {
    state.examFinished = true;
    state.examMode = true;
    state.autoNext = false;
    state.filter = "all";
    state.current = 0;
    state.finishedAt = state.finishedAt || Date.now();
    revealAllAnswers();
    rebuildOrder();
}

function choiceText(question, choiceId) {
    if (!choiceId) return "未回答";
    const choice = question.choices.find((item) => item.id === choiceId);
    return choice ? `${choice.id}. ${choice.text}` : choiceId;
}

function renderAllQuestionResults() {
    if (!dom.resultAllList) return;
    dom.resultAllList.innerHTML = "";

    questions.forEach((question) => {
        const selected = state.selected[question.id];
        const isCorrect = selected === question.answer;
        const item = document.createElement("article");
        item.className = "result-question";
        item.classList.toggle("is-correct", isCorrect);
        item.classList.toggle("is-wrong", Boolean(selected) && !isCorrect);
        item.classList.toggle("is-unanswered", !selected);

        const title = document.createElement("h4");
        title.textContent = `${question.subject} 問${question.officialQuestionNo || "-"}: ${question.question}`;

        const status = document.createElement("p");
        status.className = "result-question-status";
        status.textContent = `${isCorrect ? "正解" : selected ? "不正解" : "未回答"} / あなたの答え: ${choiceText(question, selected)} / 正解: ${choiceText(question, question.answer)}`;

        const explanation = document.createElement("p");
        explanation.className = "result-question-explanation";
        explanation.textContent = question.explanation || "解説はありません。";

        item.append(title, status, explanation);
        dom.resultAllList.appendChild(item);
    });
}

function renderResultDialog(result, options = {}) {
    if (!dom.resultDialog) return;

    const missedQuestions = questions.filter((question) => state.missed[question.id]);
    const incomplete = !result.allAnswered;
    const first = subjectResultAt(result, 0);
    const second = subjectResultAt(result, 1);

    dom.resultTitle.textContent = state.examFinished ? "試験終了" : incomplete ? "途中結果です" : result.passed ? "合格圏です" : "復習しましょう";
    dom.resultLead.textContent = incomplete
        ? `未回答が${Math.max(0, totalQuestionCount() - result.answered.size)}問あります。今の回答だけで採点しています。`
        : result.passed
        ? `1周完了。${passingSummary(result)}の基準に届いています。全問の正誤と解説を確認できます。`
        : `1周完了。目安は${passingSummary(result)}です。全問の正誤と解説を確認できます。`;
    dom.resultLawLabel.textContent = first.name;
    dom.resultEngineeringLabel.textContent = second.name;
    dom.resultLaw.textContent = formatScore(first.score, first.maxScore);
    dom.resultEngineering.textContent = formatScore(second.score, second.maxScore);
    dom.resultTotal.textContent = formatScore(result.total, result.totalMax);
    dom.resultTime.textContent = formatTime(elapsedSeconds());

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
    dom.resultReview.hidden = Boolean(state.examFinished);
    dom.resultRetry.textContent = state.examFinished ? "もう一度模試" : "もう一周";
    renderAllQuestionResults();
    renderHistory();
    dom.resultDialog.hidden = false;
    if (result.passed && !incomplete && !options.skipEffect) {
        runResultEffect();
    }
}

function renderHistory() {
    if (!dom.resultHistoryList) return;
    dom.resultHistoryList.innerHTML = "";
    const history = state.resultHistory.slice(0, 5);
    if (!history.length) {
        const item = document.createElement("li");
        item.textContent = "まだ記録はありません。";
        dom.resultHistoryList.appendChild(item);
        return;
    }

    history.forEach((entry) => {
        const item = document.createElement("li");
        const date = new Date(entry.at);
        const label = document.createElement("span");
        const score = document.createElement("strong");
        const max = entry.totalMax || totalMaxScore();
        label.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        score.textContent = `${entry.passed ? "合格圏" : "復習"} ${entry.total}/${max}`;
        item.append(label, score);
        dom.resultHistoryList.appendChild(item);
    });
}

function recordResult(result) {
    if (state.resultRecorded || !result.allAnswered) return;
    state.finishedAt = state.finishedAt || Date.now();
    state.resultRecorded = true;
    state.resultHistory = [
        {
            at: state.finishedAt,
            qualificationId: activeCatalog?.id,
            passed: result.passed,
            subjectScores: Object.fromEntries(result.subjectResults.map((subject) => [subject.name, subject.score])),
            total: result.total,
            totalMax: result.totalMax,
            elapsedSeconds: elapsedSeconds()
        },
        ...state.resultHistory
    ].slice(0, 10);
    saveState();
    syncTimer();
}

function runResultEffect() {
    const burst = document.getElementById("result-burst");
    if (!burst) return;
    burst.innerHTML = "";
    const colors = ["#0f6a7a", "#1f8a5b", "#d84545", "#e2bd42", "#ffffff"];
    for (let i = 0; i < 48; i += 1) {
        const piece = document.createElement("span");
        piece.style.setProperty("--x", `${Math.random() * 100}%`);
        piece.style.setProperty("--d", `${Math.random() * 0.5}s`);
        piece.style.setProperty("--c", colors[i % colors.length]);
        burst.appendChild(piece);
    }
}

function closeResultDialog() {
    if (dom.resultDialog) {
        dom.resultDialog.hidden = true;
    }
}

function announceResultIfComplete() {
    const result = computeExamResult();
    if (!result.allAnswered || state.resultAnnounced) return;

    lockExam();
    state.resultAnnounced = true;
    recordResult(result);
    saveState();
    syncTimer();
    renderQuestion();
    renderResultDialog(result);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderSourceNote() {
    if (!examPattern || !dom.sourceNote || !activeCatalog) return;
    const catalog = officialSources.find((source) => source.id === "jri-cbt-examples")
        || officialSources.find((source) => source.id === "jri-exam-criteria")
        || officialSources[0];
    const sourceText = catalog
        ? `<a href="${escapeHtml(catalog.url)}" target="_blank" rel="noopener">${escapeHtml(catalog.name)}</a>`
        : "日本無線協会 試験資料";
    const subjectText = getSubjects()
        .map((subject) => `${subject.name}${subject.count || questions.filter((question) => question.subject === subject.name).length}問`)
        .join("・");
    const scoreText = getSubjects()
        .map((subject) => `${subject.name}${subjectMaxScore(subject)}点中${subjectPassingScore(subject)}点以上`)
        .join("・");
    const setText = [...new Set(questions.map((question) => question.examSet).filter(Boolean))].join("、") || "公式例題";

    const dataKind = activeCatalog.id === "1rikutoku"
        ? "公式の問題数・合格基準に合わせた学習用問題"
        : `${setText}をカード化した問題`;
    dom.sourceNote.innerHTML = `現在の問題データは <code>${escapeHtml(activeCatalog.dataFile)}</code> で管理しています。${activeCatalog.qualification}の${dataKind}として、${subjectText}の計${totalQuestionCount()}問、試験時間${examPattern.timeLimitMinutes || 60}分、${scoreText}を合格圏として表示します。参照元: ${sourceText}。`;
}

function selectChoice(question, choiceId) {
    if (state.examFinished) return;
    startTimer();
    state.selected[question.id] = choiceId;
    state.revealed[question.id] = !state.examMode;

    if (choiceId === question.answer) {
        state.correct[question.id] = true;
        delete state.missed[question.id];
    } else {
        state.missed[question.id] = true;
        delete state.correct[question.id];
    }

    saveState();
    renderQuestion();
    if (state.autoNext && !computeExamResult().allAnswered) {
        setTimeout(() => move(1), 350);
    }
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
    if (state.examFinished) {
        renderResultDialog(computeExamResult(), { skipEffect: true });
        return;
    }
    if (state.examMode && !computeExamResult().allAnswered) return;
    state.revealed[question.id] = !state.revealed[question.id];
    saveState();
    renderQuestion();
}

function toggleBookmark() {
    const question = currentQuestion();
    if (!question) return;
    if (state.examFinished) return;
    state.bookmarked[question.id] = !state.bookmarked[question.id];
    if (!state.bookmarked[question.id]) delete state.bookmarked[question.id];
    saveState();
    renderQuestion();
}

function toggleMastered() {
    const question = currentQuestion();
    if (!question) return;
    if (state.examFinished) return;
    state.mastered[question.id] = !state.mastered[question.id];
    if (!state.mastered[question.id]) delete state.mastered[question.id];
    saveState();
    renderQuestion();
}

function setFilter(filter) {
    if (state.examFinished) return;
    state.filter = filter;
    state.current = 0;
    rebuildOrder();
    renderQuestion();
}

function finishExam(fromTimer = false) {
    const result = computeExamResult();
    lockExam();
    state.resultAnnounced = true;
    if (result.allAnswered) {
        recordResult(result);
    }
    saveState();
    syncTimer();
    renderQuestion();
    renderResultDialog(result, { skipEffect: fromTimer || !result.allAnswered });
}

function resetProgress(options = {}) {
    const keepSettings = {
        filter: options.filter || state.filter,
        shuffle: state.shuffle,
        resultHistory: state.resultHistory || [],
        examMode: options.examMode ?? state.examMode,
        autoNext: state.autoNext
    };
    state = {
        ...createDefaultState(),
        filter: keepSettings.filter,
        shuffle: keepSettings.shuffle,
        resultHistory: keepSettings.resultHistory,
        examMode: keepSettings.examMode,
        autoNext: keepSettings.autoNext,
        startedAt: keepSettings.examMode ? Date.now() : null
    };
    rebuildOrder();
    syncTimer();
    renderQuestion();
}

function bindEvents() {
    document.querySelectorAll("[data-menu-action='mock']").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            openMockFromMenu(link.dataset.qualification);
        });
    });
    document.querySelector("[data-menu-action='history']")?.addEventListener("click", (event) => {
        event.preventDefault();
        showHistory({ pushHash: true });
    });
    dom.prev.addEventListener("click", () => move(-1));
    dom.next.addEventListener("click", () => move(1));
    dom.reveal.addEventListener("click", revealAnswer);
    dom.bookmark.addEventListener("click", toggleBookmark);
    dom.master.addEventListener("click", toggleMastered);
    dom.reset.addEventListener("click", resetProgress);
    dom.finish.addEventListener("click", () => finishExam(false));
    dom.resultClose.addEventListener("click", closeResultDialog);
    dom.resultRetry.addEventListener("click", () => {
        closeResultDialog();
        resetProgress({ examMode: true, filter: "all" });
    });
    dom.resultReview.addEventListener("click", () => {
        closeResultDialog();
        setFilter("missed");
    });
    dom.examMode.addEventListener("change", () => {
        state.examMode = true;
        dom.examMode.checked = true;
        startTimer();
        saveState();
        renderQuestion();
    });
    dom.autoNext.addEventListener("change", () => {
        state.autoNext = dom.autoNext.checked;
        saveState();
        renderQuestion();
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
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("popstate", handleRoute);
    document.addEventListener("keydown", (event) => {
        const tagName = event.target?.tagName;
        if (tagName === "INPUT" || tagName === "TEXTAREA") return;
        if (currentView === "exam" && event.key === "ArrowLeft") move(-1);
        if (currentView === "exam" && event.key === "ArrowRight") move(1);
        if (event.key === "Escape") closeResultDialog();
        if (currentView === "exam" && event.key.toLowerCase() === "r" && !state.examFinished) finishExam(false);
        if (currentView === "exam" && event.key === " ") {
            event.preventDefault();
            revealAnswer();
        }
    });
}

async function init() {
    bindEvents();

    try {
        await loadCatalogs();
        handleRoute();
    } catch (error) {
        dom.question.textContent = "問題データを読み込めませんでした。GitHub Pages などのWebサーバー上で開いてください。";
        dom.source.textContent = String(error.message || error);
    }
}

init();
