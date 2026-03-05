// ==================== QUIZ MODE ====================
// Handles: mode detection, user registration, quiz flow, admin panel, results/charts

(function () {
    'use strict';

    // ==================== QUIZ STATE ====================
    const quizState = {
        config: null,           // { freeplay, requireUserPassword, appTitle }
        user: null,             // { id, username }
        adminToken: null,
        activeSession: null,    // session object with questions
        quizQuestions: [],       // ordered questions for current quiz
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        questionStartTime: null,
        sessionStartTime: null,
        answeredIds: new Set(),
        editingSessionId: null,
        charts: {},             // chart.js instances
    };

    // ==================== HELPERS ====================
    function $(id) { return document.getElementById(id); }
    function show(el) { if (el) el.classList.remove('hidden'); }
    function hide(el) { if (el) el.classList.add('hidden'); }

    async function api(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (quizState.adminToken) headers['X-Admin-Token'] = quizState.adminToken;
        const resp = await fetch(`/api${path}`, { ...options, headers });
        if (path.includes('/export') && resp.ok) return resp;
        return resp.json();
    }

    function showToast(message, type = 'success') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('toast-fade'); }, 2500);
        setTimeout(() => { toast.remove(); }, 3000);
    }

    function updateFreeplayButton(freeplay) {
        const btn = $('adminToggleFreeplay');
        if (btn) {
            btn.textContent = freeplay ? '🟢 Freeplay ON' : '🔴 Freeplay OFF';
            btn.className = freeplay
                ? 'btn btn-sm btn-warning'
                : 'btn btn-sm btn-secondary';
        }
    }

    // ==================== INITIALIZATION ====================
    async function initQuizMode() {
        try {
            const data = await api('/config');
            if (!data.success) return;
            quizState.config = data.config;

            // Restore admin token from sessionStorage
            const savedToken = sessionStorage.getItem('tq_admin_token');
            if (savedToken) quizState.adminToken = savedToken;

            // Restore user from sessionStorage
            const savedUser = sessionStorage.getItem('tq_user');
            if (savedUser) quizState.user = JSON.parse(savedUser);

            // Always start with quiz mode auth screen
            // If freeplay is enabled, a button on the auth screen lets users switch
            showQuizMode();
        } catch (e) {
            console.log('Quiz mode init: API unavailable, defaulting to freeplay', e);
            showFreeplayMode();
        }
    }

    function showFreeplayMode() {
        // Show all normal app elements, hide quiz-specific ones
        show($('sidebarToggle'));
        show($('sidebar'));
        hide($('quizAuthScreen'));
        hide($('quizPlayScreen'));
        hide($('quizCompleteScreen'));
        hide($('adminPanel'));
        // Show the welcome/setup screen so freeplay content is visible immediately
        show($('welcomeScreen'));
    }

    function showQuizMode() {
        // Hide freeplay elements and sidebar (sidebar only visible in freeplay/admin)
        hide($('sidebarToggle'));
        hide($('sidebar'));
        hide($('welcomeScreen'));
        hide($('gameHeader'));
        hide($('singleMode'));
        hide($('jeopardyMode'));
        hide($('gameOverScreen'));
        hide($('scoreboard'));

        // If admin is logged in, show admin panel
        if (quizState.adminToken) {
            showAdminPanel();
            return;
        }

        // If user is logged in and session is active, resume quiz
        if (quizState.user) {
            loadAndStartQuiz();
            return;
        }

        // Show auth screen
        showAuthScreen();
    }

    // ==================== AUTH SCREEN ====================
    function showAuthScreen() {
        hideAllScreens();
        show($('quizAuthScreen'));
        loadActiveSessionInfo();
        // Show password fields if required
        if (quizState.config?.requireUserPassword) {
            show($('regPasswordGroup'));
            show($('loginPasswordGroup'));
        } else {
            hide($('regPasswordGroup'));
            hide($('loginPasswordGroup'));
        }
        // Show freeplay button if freeplay is enabled
        if (quizState.config?.freeplay) {
            show($('freeplayBtn'));
        } else {
            hide($('freeplayBtn'));
        }
    }

    async function loadActiveSessionInfo() {
        try {
            const data = await api('/session/active');
            if (data.success && data.session) {
                $('quizSessionName').textContent = data.session.name || 'Quiz Available';
            } else {
                $('quizSessionName').textContent = 'No active quiz. Please wait for the admin to start one.';
            }
        } catch {
            $('quizSessionName').textContent = 'Quiz';
        }
    }

    function initAuthListeners() {
        // Tab switching
        $('authRegisterTab')?.addEventListener('click', () => {
            $('authRegisterTab').classList.add('active');
            $('authLoginTab').classList.remove('active');
            show($('registerForm'));
            hide($('loginForm'));
        });
        $('authLoginTab')?.addEventListener('click', () => {
            $('authLoginTab').classList.add('active');
            $('authRegisterTab').classList.remove('active');
            hide($('registerForm'));
            show($('loginForm'));
        });

        // Register
        $('registerBtn')?.addEventListener('click', async () => {
            const username = $('regUsername').value.trim();
            if (!username) return showError('registerError', 'Please enter a username');

            const body = { username };
            if (quizState.config?.requireUserPassword) {
                body.password = $('regPassword').value;
            }

            try {
                const data = await api('/register', { method: 'POST', body: JSON.stringify(body) });
                if (data.success) {
                    quizState.user = data.user;
                    sessionStorage.setItem('tq_user', JSON.stringify(data.user));
                    loadAndStartQuiz();
                } else {
                    showError('registerError', data.error);
                }
            } catch (e) {
                showError('registerError', 'Connection error');
            }
        });

        // Login
        $('loginBtn')?.addEventListener('click', async () => {
            const username = $('loginUsername').value.trim();
            if (!username) return showError('loginError', 'Please enter your username');

            const body = { username };
            if (quizState.config?.requireUserPassword) {
                body.password = $('loginPassword').value;
            }

            try {
                const data = await api('/login', { method: 'POST', body: JSON.stringify(body) });
                if (data.success) {
                    quizState.user = data.user;
                    sessionStorage.setItem('tq_user', JSON.stringify(data.user));
                    loadAndStartQuiz();
                } else {
                    showError('loginError', data.error);
                }
            } catch (e) {
                showError('loginError', 'Connection error');
            }
        });

        // Enter key on inputs
        $('regUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('registerBtn').click(); });
        $('loginUsername')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
        $('regPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('registerBtn').click(); });
        $('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });

        // Freeplay button
        $('freeplayBtn')?.addEventListener('click', () => showFreeplayMode());

        // Admin access (both auth screen and sidebar buttons)
        $('adminAccessBtn')?.addEventListener('click', () => show($('adminLoginModal')));
        $('sidebarAdminBtn')?.addEventListener('click', () => show($('adminLoginModal')));
        $('adminLoginCancel')?.addEventListener('click', () => hide($('adminLoginModal')));
        $('adminLoginBtn')?.addEventListener('click', adminLogin);
        $('adminPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
    }

    function showError(id, msg) {
        const el = $(id);
        if (el) { el.textContent = msg; show(el); setTimeout(() => hide(el), 4000); }
    }

    // ==================== ADMIN LOGIN ====================
    async function adminLogin() {
        const pw = $('adminPassword').value;
        if (!pw) return showError('adminLoginError', 'Password required');
        try {
            const data = await api('/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
            if (data.success) {
                quizState.adminToken = data.token;
                sessionStorage.setItem('tq_admin_token', data.token);
                hide($('adminLoginModal'));
                $('adminPassword').value = '';
                showAdminPanel();
            } else {
                showError('adminLoginError', data.error);
            }
        } catch {
            showError('adminLoginError', 'Connection error');
        }
    }

    // ==================== QUIZ PLAY ====================
    async function loadAndStartQuiz() {
        hideAllScreens();
        show($('quizPlayScreen'));

        try {
            const data = await api('/session/active');
            if (!data.success || !data.session) {
                $('quizQuestionText').textContent = 'No active quiz session. Please wait for the admin to start one.';
                $('quizNextBtn').disabled = true;
                return;
            }

            quizState.activeSession = data.session;
            quizState.quizQuestions = [...data.session.questions];

            if (data.session.randomizeQuestions) {
                shuffleArray(quizState.quizQuestions);
            }

            // Check existing progress
            const progress = await api(`/session/active/progress/${quizState.user.id}`);
            if (progress.success && progress.progress) {
                quizState.answeredIds = new Set(progress.progress.answeredQuestions);
                quizState.answeredCount = progress.progress.totalAnswered;
                quizState.correctCount = progress.progress.correctAnswers;
            }

            // Filter out already answered questions
            quizState.quizQuestions = quizState.quizQuestions.filter(q => !quizState.answeredIds.has(q.id));
            quizState.currentIndex = 0;

            $('quizPlayTitle').textContent = data.session.name;
            $('quizPlayUser').textContent = quizState.user.username;
            quizState.sessionStartTime = Date.now();

            if (quizState.quizQuestions.length === 0) {
                // All questions answered — show results
                completeQuiz();
                return;
            }

            updateQuizProgress();
            showQuizQuestion();
        } catch (e) {
            $('quizQuestionText').textContent = 'Error loading quiz. Please try again.';
            console.error(e);
        }
    }

    function showQuizQuestion() {
        const q = quizState.quizQuestions[quizState.currentIndex];
        if (!q) { completeQuiz(); return; }

        quizState.questionStartTime = Date.now();
        $('quizCategory').textContent = q.Category;
        $('quizDifficulty').textContent = q.Difficulty;
        $('quizQuestionText').textContent = q.Question;
        $('quizNextBtn').disabled = true;
        hide($('quizDescription'));

        const grid = $('quizAnswersGrid');
        grid.innerHTML = '';

        if (q.Type === 'hidden') {
            renderQuizHiddenQuestion(q, grid);
        } else if (q.Type === 'general') {
            renderQuizGeneralQuestion(q, grid);
        } else if (q.Type === 'multiple_answer') {
            renderQuizMultiAnswerQuestion(q, grid);
        } else {
            renderQuizMultipleChoiceQuestion(q, grid);
        }
    }

    function renderQuizMultipleChoiceQuestion(q, grid) {
        const allAnswers = [...q.Answers, ...q.IncorrectAnswers];
        shuffleArray(allAnswers);
        // Limit based on difficulty
        const maxChoices = 6;
        const choices = allAnswers.slice(0, Math.max(maxChoices, q.Answers.length + 1));

        choices.forEach(answer => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.textContent = answer;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                grid.querySelectorAll('.answer-btn').forEach(b => b.classList.add('disabled'));

                const isCorrect = q.Answers.map(a => a.toLowerCase()).includes(answer.toLowerCase());
                btn.classList.add(isCorrect ? 'correct' : 'wrong');

                // Show correct answer if wrong
                if (!isCorrect) {
                    grid.querySelectorAll('.answer-btn').forEach(b => {
                        if (q.Answers.map(a => a.toLowerCase()).includes(b.textContent.toLowerCase())) {
                            b.classList.add('correct');
                        }
                    });
                }

                recordAnswer(q, [answer], isCorrect);
            });
            grid.appendChild(btn);
        });
    }

    function renderQuizMultiAnswerQuestion(q, grid) {
        const allAnswers = [...q.Answers, ...q.IncorrectAnswers];
        shuffleArray(allAnswers);
        const selected = new Set();

        const hint = document.createElement('p');
        hint.className = 'multi-select-hint';
        hint.textContent = `Select ${q.Answers.length} answer(s), then submit`;
        grid.appendChild(hint);

        allAnswers.forEach(answer => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.textContent = answer;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                if (selected.has(answer)) {
                    selected.delete(answer);
                    btn.classList.remove('selected');
                } else {
                    selected.add(answer);
                    btn.classList.add('selected');
                }
            });
            grid.appendChild(btn);
        });

        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary submit-answers-btn';
        submitBtn.textContent = 'Submit Answers';
        submitBtn.addEventListener('click', () => {
            if (selected.size === 0) return;
            grid.querySelectorAll('.answer-btn').forEach(b => b.classList.add('disabled'));
            submitBtn.disabled = true;

            const correctSet = new Set(q.Answers.map(a => a.toLowerCase()));
            const selectedArr = [...selected];
            const allCorrect = selectedArr.every(a => correctSet.has(a.toLowerCase())) &&
                selectedArr.length === q.Answers.length;

            grid.querySelectorAll('.answer-btn').forEach(b => {
                if (correctSet.has(b.textContent.toLowerCase())) {
                    b.classList.add('correct');
                } else if (selected.has(b.textContent)) {
                    b.classList.add('wrong');
                }
            });

            recordAnswer(q, selectedArr, allCorrect);
        });
        grid.appendChild(submitBtn);
    }

    function renderQuizGeneralQuestion(q, grid) {
        const inputWrap = document.createElement('div');
        inputWrap.className = 'general-input-wrap';

        if (q.RegExDescription) {
            const hint = document.createElement('p');
            hint.className = 'input-hint';
            hint.textContent = q.RegExDescription;
            inputWrap.appendChild(hint);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'general-answer-input';
        input.placeholder = 'Type your answer...';
        inputWrap.appendChild(input);

        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = 'Submit';
        submitBtn.addEventListener('click', async () => {
            const val = input.value.trim();
            if (!val) return;
            input.disabled = true;
            submitBtn.disabled = true;

            let isCorrect = false;
            if (q.RegEx) {
                try {
                    const regex = new RegExp(q.RegEx, 'i');
                    isCorrect = regex.test(val);
                } catch { isCorrect = false; }
            } else {
                isCorrect = q.Answers.some(a => a.toLowerCase() === val.toLowerCase());
            }

            input.classList.add(isCorrect ? 'correct' : 'wrong');

            if (!isCorrect) {
                const correctP = document.createElement('p');
                correctP.className = 'correct-answer-reveal';
                correctP.textContent = `Correct answer: ${q.Answers.join(', ')}`;
                inputWrap.appendChild(correctP);
            }

            recordAnswer(q, [val], isCorrect);
        });
        inputWrap.appendChild(submitBtn);

        input.addEventListener('keydown', e => { if (e.key === 'Enter') submitBtn.click(); });
        grid.appendChild(inputWrap);
    }

    function renderQuizHiddenQuestion(q, grid) {
        // Hidden questions auto-submit as correct (informational)
        q.Answers.forEach(answer => {
            const spoiler = document.createElement('div');
            spoiler.className = 'spoiler-block';
            spoiler.textContent = '🔍 Click to reveal';
            spoiler.addEventListener('click', () => {
                spoiler.textContent = answer;
                spoiler.classList.add('revealed');
            });
            grid.appendChild(spoiler);
        });

        // Auto-record as viewed (correct) since there's no right/wrong
        recordAnswer(q, q.Answers, true);
    }

    async function recordAnswer(q, selectedAnswers, isCorrect) {
        const timeTaken = (Date.now() - quizState.questionStartTime) / 1000;

        if (isCorrect) quizState.correctCount++;
        quizState.answeredCount++;
        quizState.answeredIds.add(q.id);

        // Show description if available
        if (q.Description) {
            const descEl = $('quizDescription');
            descEl.textContent = q.Description;
            show(descEl);
        }

        // Post to server
        try {
            const result = await api('/answer', {
                method: 'POST',
                body: JSON.stringify({
                    userId: quizState.user.id,
                    sessionId: quizState.activeSession.id,
                    questionId: q.id,
                    selectedAnswers,
                    isCorrect,
                    timeTakenSeconds: Math.round(timeTaken * 10) / 10
                })
            });
            if (!result.success && !result.duplicate) {
                console.error('Failed to save answer:', result.error);
                showToast('Failed to save answer', 'error');
            }
        } catch (e) {
            console.error('Failed to save answer:', e);
            showToast('Connection error saving answer', 'error');
        }

        updateQuizProgress();
        $('quizNextBtn').disabled = false;
    }

    function updateQuizProgress() {
        const total = (quizState.activeSession?.totalQuestions || 0);
        const answered = quizState.answeredCount;
        $('quizProgressText').textContent = `${answered} / ${total}`;
        const pct = total > 0 ? (answered / total) * 100 : 0;
        $('quizProgressFill').style.width = `${pct}%`;
    }

    async function completeQuiz() {
        hideAllScreens();
        show($('quizCompleteScreen'));

        try {
            const data = await api('/quiz/complete', {
                method: 'POST',
                body: JSON.stringify({
                    userId: quizState.user.id,
                    sessionId: quizState.activeSession.id
                })
            });

            if (data.success) {
                const r = data.result;
                $('quizResultScore').textContent = `${r.percentage}%`;
                $('quizResultDetail').textContent = `${r.correctAnswers} / ${r.totalQuestions} correct`;
                if (r.totalTimeSeconds) {
                    const mins = Math.floor(r.totalTimeSeconds / 60);
                    const secs = Math.round(r.totalTimeSeconds % 60);
                    $('quizResultTime').textContent = `Time: ${mins}m ${secs}s`;
                }

                // Trophy based on score
                if (r.percentage >= 90) $('quizTrophy').textContent = '🏆';
                else if (r.percentage >= 70) $('quizTrophy').textContent = '🥈';
                else if (r.percentage >= 50) $('quizTrophy').textContent = '🥉';
                else $('quizTrophy').textContent = '📝';

                // Load per-question breakdown
                loadQuizBreakdown();
            }
        } catch (e) {
            console.error('Failed to complete quiz:', e);
        }
    }

    async function loadQuizBreakdown() {
        const container = $('quizResultBreakdown');
        if (!container) return;
        try {
            const data = await api(`/my-answers?userId=${quizState.user.id}&sessionId=${quizState.activeSession.id}`);
            if (!data.success || !data.answers || data.answers.length === 0) return;

            const correct = data.answers.filter(a => a.isCorrect).length;
            const wrong = data.answers.length - correct;

            container.innerHTML = `
                <div class="breakdown-summary">
                    <span class="breakdown-correct">✅ ${correct} correct</span>
                    <span class="breakdown-wrong">❌ ${wrong} wrong</span>
                </div>
                <div class="breakdown-list">
                    ${data.answers.map((a, i) => `
                        <div class="breakdown-item ${a.isCorrect ? 'bd-correct' : 'bd-wrong'}">
                            <div class="bd-num">${i + 1}</div>
                            <div class="bd-body">
                                <p class="bd-question">${escapeHtml(a.question)}</p>
                                <p class="bd-answer"><strong>Your answer:</strong> ${escapeHtml(a.selectedAnswers.join(', '))}</p>
                                ${!a.isCorrect ? `<p class="bd-correct-answer"><strong>Correct:</strong> ${escapeHtml(a.correctAnswers.join(', '))}</p>` : ''}
                                <span class="bd-meta">${escapeHtml(a.category || '')} · ${a.difficulty}${a.timeTakenSeconds ? ' · ' + a.timeTakenSeconds + 's' : ''}</span>
                            </div>
                            <div class="bd-icon">${a.isCorrect ? '✅' : '❌'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            console.error('Failed to load breakdown:', e);
        }
    }

    // ==================== ADMIN PANEL ====================
    function showAdminPanel() {
        hideAllScreens();
        show($('sidebarToggle'));
        show($('sidebar'));
        show($('adminPanel'));
        loadAdminData();
    }

    function initAdminListeners() {
        // Tabs
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
                tab.classList.add('active');
                const target = tab.dataset.adminTab;
                $(`admin${target.charAt(0).toUpperCase() + target.slice(1)}Tab`)?.classList.remove('hidden');

                if (target === 'sessions') loadSessions();
                if (target === 'results') loadResults();
                if (target === 'users') loadUsers();
            });
        });

        // Toggle freeplay
        $('adminToggleFreeplay')?.addEventListener('click', async () => {
            const data = await api('/admin/config');
            if (data.success) {
                const newVal = !data.config.freeplay;
                const updateData = await api('/admin/config', {
                    method: 'POST',
                    body: JSON.stringify({ freeplay: newVal })
                });
                if (updateData.success) {
                    quizState.config.freeplay = newVal;
                    updateFreeplayButton(newVal);
                    showToast(`Freeplay is now ${newVal ? 'ON' : 'OFF'}`);
                } else {
                    showToast('Failed to toggle freeplay', 'error');
                }
            }
        });

        // Logout
        $('adminLogoutBtn')?.addEventListener('click', () => {
            quizState.adminToken = null;
            sessionStorage.removeItem('tq_admin_token');
            quizState.config ? showQuizMode() : location.reload();
        });

        // Create session
        $('createSessionBtn')?.addEventListener('click', () => {
            quizState.editingSessionId = null;
            $('sessionFormTitle').textContent = 'Create Quiz Session';
            $('sessionName').value = '';
            $('sessionDesc').value = '';
            $('sessionTimeLimit').value = '';
            $('sessionRandomize').checked = false;
            show($('sessionFormCard'));
            loadCategoryPicker();
        });

        $('cancelSessionBtn')?.addEventListener('click', () => hide($('sessionFormCard')));
        $('saveSessionBtn')?.addEventListener('click', saveSession);

        // Export buttons
        $('exportSummaryBtn')?.addEventListener('click', () => exportResults('summary'));
        $('exportDetailedBtn')?.addEventListener('click', () => exportResults('detailed'));

        // Results session filter
        $('resultsSessionFilter')?.addEventListener('change', loadResults);

        // Quiz back / logout buttons
        const doLogout = () => {
            quizState.user = null;
            sessionStorage.removeItem('tq_user');
            quizState.answeredIds.clear();
            quizState.answeredCount = 0;
            quizState.correctCount = 0;
            quizState.currentIndex = 0;
            showAuthScreen();
        };
        $('quizBackToLogin')?.addEventListener('click', doLogout);
        $('quizLogoutBtn')?.addEventListener('click', doLogout);

        // Quiz next button
        $('quizNextBtn')?.addEventListener('click', () => {
            quizState.currentIndex++;
            if (quizState.currentIndex >= quizState.quizQuestions.length) {
                completeQuiz();
            } else {
                showQuizQuestion();
            }
        });
    }

    async function loadAdminData() {
        await loadSessions();
        await loadSessionFilter();
        // Set freeplay button state
        try {
            const configData = await api('/admin/config');
            if (configData.success) {
                updateFreeplayButton(configData.config.freeplay);
            }
        } catch (e) {
            console.error('Failed to load config for freeplay button:', e);
        }
    }

    // ==================== SESSIONS MANAGEMENT ====================
    async function loadSessions() {
        try {
            const data = await api('/admin/sessions');
            if (!data.success) return;

            const container = $('sessionsList');
            if (data.sessions.length === 0) {
                container.innerHTML = '<p class="empty-state">No sessions created yet. Click "+ New Session" to create one.</p>';
                return;
            }

            container.innerHTML = data.sessions.map(s => `
                <div class="session-card ${s.isActive ? 'active-session' : ''}">
                    <div class="session-card-header">
                        <div>
                            <h3>${escapeHtml(s.name)} ${s.isActive ? '<span class="active-badge">ACTIVE</span>' : ''}</h3>
                            <p class="session-meta">${s.categories.length} categories &bull; ${s.participantCount} participants</p>
                            ${s.description ? `<p class="session-desc">${escapeHtml(s.description)}</p>` : ''}
                        </div>
                        <div class="session-actions">
                            ${s.isActive
                    ? `<button class="btn btn-warning btn-sm" onclick="window._quizAdmin.deactivateSession(${s.id})">Deactivate</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="window._quizAdmin.activateSession(${s.id})">Activate</button>`}
                            <button class="btn btn-secondary btn-sm" onclick="window._quizAdmin.editSession(${s.id})">Edit</button>
                            <button class="btn btn-danger btn-sm" onclick="window._quizAdmin.deleteSession(${s.id})">Delete</button>
                        </div>
                    </div>
                    <div class="session-categories">
                        ${s.categories.map(c => `
                            <span class="session-cat-tag">${escapeHtml(c.categoryName)}${c.difficulty ? ` (${c.difficulty})` : ''}${c.questionLimit ? ` [max ${c.questionLimit}]` : ''}</span>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to load sessions:', e);
        }
    }

    async function loadCategoryPicker() {
        const picker = $('sessionCategoryPicker');
        try {
            const data = await api('/categories');
            if (!data.success) return;

            picker.innerHTML = data.categories.map(c => `
                <label class="category-pick-item">
                    <input type="checkbox" value="${c.id}" data-name="${escapeHtml(c.name)}" data-count="${c.questionCount}">
                    <span>${escapeHtml(c.name)} <small>(${c.questionCount} questions)</small></span>
                </label>
            `).join('');
        } catch {
            picker.innerHTML = '<p class="error-state">Failed to load categories</p>';
        }
    }

    async function saveSession() {
        const name = $('sessionName').value.trim();
        if (!name) return alert('Session name is required');

        const categories = [];
        $('sessionCategoryPicker').querySelectorAll('input:checked').forEach(cb => {
            categories.push({ categoryId: parseInt(cb.value) });
        });

        if (categories.length === 0) return alert('Select at least one category');

        const body = {
            name,
            description: $('sessionDesc').value.trim(),
            timeLimitMinutes: parseInt($('sessionTimeLimit').value) || null,
            randomizeQuestions: $('sessionRandomize').checked,
            categories
        };

        try {
            let data;
            if (quizState.editingSessionId) {
                data = await api(`/admin/sessions/${quizState.editingSessionId}`, {
                    method: 'PUT', body: JSON.stringify(body)
                });
            } else {
                data = await api('/admin/sessions', {
                    method: 'POST', body: JSON.stringify(body)
                });
            }

            if (data.success) {
                hide($('sessionFormCard'));
                showToast(quizState.editingSessionId ? 'Session updated' : 'Session created');
                await loadSessions();
                await loadSessionFilter();
            } else {
                showToast(data.error || 'Failed to save session', 'error');
            }
        } catch (e) {
            showToast('Failed to save session', 'error');
        }
    }

    // Exposed functions for onclick handlers
    window._quizAdmin = {
        activateSession: async (id) => {
            const data = await api(`/admin/sessions/${id}/activate`, { method: 'POST' });
            if (data.success) {
                showToast('Session activated');
                await loadSessions();
                await loadSessionFilter();
            } else {
                showToast(data.error || 'Failed to activate session', 'error');
            }
        },
        deactivateSession: async (id) => {
            const data = await api(`/admin/sessions/${id}/deactivate`, { method: 'POST' });
            if (data.success) {
                showToast('Session deactivated');
                await loadSessions();
                await loadSessionFilter();
            } else {
                showToast(data.error || 'Failed to deactivate session', 'error');
            }
        },
        editSession: async (id) => {
            try {
                const data = await api('/admin/sessions');
                const session = data.sessions.find(s => s.id === id);
                if (!session) return;

                quizState.editingSessionId = id;
                $('sessionFormTitle').textContent = 'Edit Quiz Session';
                $('sessionName').value = session.name;
                $('sessionDesc').value = session.description || '';
                $('sessionTimeLimit').value = session.timeLimitMinutes || '';
                $('sessionRandomize').checked = session.randomizeQuestions;

                show($('sessionFormCard'));
                await loadCategoryPicker();

                // Pre-check categories
                const catIds = session.categories.map(c => c.categoryId);
                $('sessionCategoryPicker').querySelectorAll('input').forEach(cb => {
                    cb.checked = catIds.includes(parseInt(cb.value));
                });
            } catch (e) {
                console.error(e);
            }
        },
        deleteSession: async (id) => {
            if (!confirm('Delete this session and all related results?')) return;
            const data = await api(`/admin/sessions/${id}`, { method: 'DELETE' });
            if (data.success) {
                showToast('Session deleted');
                await loadSessions();
                await loadSessionFilter();
            } else {
                showToast(data.error || 'Failed to delete session', 'error');
            }
        },
        viewUserAnswers: async (userId, sessionId, username) => {
            try {
                const data = await api(`/admin/results/${userId}/answers?sessionId=${sessionId}`);
                if (!data.success) return;

                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.id = 'userAnswersModal';
                modal.innerHTML = `
                    <div class="modal-content" style="max-width:800px;max-height:80vh;overflow-y:auto">
                        <div class="modal-header">
                            <h2>${escapeHtml(username)}'s Answers</h2>
                            <button class="btn btn-secondary btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                        </div>
                        <div class="user-answers-list">
                            ${data.answers.map((a, i) => `
                                <div class="user-answer-item ${a.isCorrect ? 'correct' : 'incorrect'}">
                                    <div class="ua-num">${i + 1}</div>
                                    <div class="ua-body">
                                        <p class="ua-question">${escapeHtml(a.question)}</p>
                                        <p class="ua-selected"><strong>Selected:</strong> ${escapeHtml(a.selectedAnswers.join(', '))}</p>
                                        <p class="ua-correct"><strong>Correct:</strong> ${escapeHtml(a.correctAnswers.join(', '))}</p>
                                        <p class="ua-meta">${a.category || ''} &bull; ${a.difficulty} &bull; ${a.timeTakenSeconds ? a.timeTakenSeconds + 's' : ''}</p>
                                    </div>
                                    <div class="ua-status">${a.isCorrect ? '✅' : '❌'}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
            } catch (e) {
                console.error(e);
            }
        }
    };

    // ==================== RESULTS & CHARTS ====================
    async function loadSessionFilter() {
        try {
            const data = await api('/admin/sessions');
            if (!data.success) return;
            const select = $('resultsSessionFilter');
            select.innerHTML = '<option value="">All Sessions</option>';
            data.sessions.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
            });
        } catch (e) { }
    }

    async function loadResults() {
        const sessionId = $('resultsSessionFilter')?.value || '';
        try {
            const [summaryData, resultsData] = await Promise.all([
                api(`/admin/results/summary${sessionId ? '?sessionId=' + sessionId : ''}`),
                api(`/admin/results${sessionId ? '?sessionId=' + sessionId : ''}`)
            ]);

            // Render charts in separate try/catch so table still renders if Chart.js fails
            if (summaryData.success) {
                try { renderCharts(summaryData.summary); } catch (chartErr) {
                    console.error('Chart rendering failed:', chartErr);
                }
            }
            if (resultsData.success) renderResultsTable(resultsData.results);

            // Also load live activity
            loadActivity();
        } catch (e) {
            console.error('Failed to load results:', e);
        }
    }

    async function loadActivity() {
        try {
            const data = await api('/admin/activity');
            const container = $('quizActivity');
            if (!container) return;

            if (!data.success || !data.activity || data.activity.length === 0) {
                container.innerHTML = '<p class="empty-state">No in-progress quizzes right now.</p>';
                return;
            }

            container.innerHTML = `
                <h4>📡 Live Quiz Activity</h4>
                <div class="activity-list">
                    ${data.activity.map(a => `
                        <div class="activity-item">
                            <div class="activity-user">
                                <strong>${escapeHtml(a.username)}</strong>
                                <span class="activity-session">${escapeHtml(a.sessionName)}</span>
                            </div>
                            <div class="activity-stats">
                                <span class="activity-answers">${a.answersCount} answered</span>
                                <span class="activity-correct">${a.correctCount} correct</span>
                                <span class="activity-time">${a.lastAnswerAt ? timeAgo(a.lastAnswerAt) : ''}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            console.error('Failed to load activity:', e);
        }
    }

    function timeAgo(dateStr) {
        const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function renderCharts(summary) {
        // Destroy existing charts
        Object.values(quizState.charts).forEach(c => c.destroy());
        quizState.charts = {};

        const colors = [
            'rgba(139,92,246,0.7)', 'rgba(59,130,246,0.7)', 'rgba(16,185,129,0.7)',
            'rgba(245,158,11,0.7)', 'rgba(239,68,68,0.7)', 'rgba(236,72,153,0.7)',
            'rgba(99,102,241,0.7)', 'rgba(20,184,166,0.7)'
        ];

        // User scores bar chart
        if (summary.userScores.length > 0) {
            quizState.charts.userScores = new Chart($('userScoresChart'), {
                type: 'bar',
                data: {
                    labels: summary.userScores.map(u => u.username),
                    datasets: [{
                        label: 'Score (%)',
                        data: summary.userScores.map(u => u.percentage),
                        backgroundColor: colors,
                        borderRadius: 6,
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#999' } }, x: { ticks: { color: '#999' } } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Category accuracy
        if (summary.categoryAccuracy.length > 0) {
            quizState.charts.category = new Chart($('categoryChart'), {
                type: 'doughnut',
                data: {
                    labels: summary.categoryAccuracy.map(c => c.category),
                    datasets: [{
                        data: summary.categoryAccuracy.map(c => c.percentage),
                        backgroundColor: colors,
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom', labels: { color: '#999' } } }
                }
            });
        }

        // Difficulty accuracy
        if (summary.difficultyAccuracy.length > 0) {
            quizState.charts.difficulty = new Chart($('difficultyChart'), {
                type: 'bar',
                data: {
                    labels: summary.difficultyAccuracy.map(d => d.difficulty),
                    datasets: [
                        {
                            label: 'Correct',
                            data: summary.difficultyAccuracy.map(d => d.correct),
                            backgroundColor: 'rgba(16,185,129,0.7)',
                            borderRadius: 6,
                        },
                        {
                            label: 'Incorrect',
                            data: summary.difficultyAccuracy.map(d => d.total - d.correct),
                            backgroundColor: 'rgba(239,68,68,0.5)',
                            borderRadius: 6,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: { stacked: true, ticks: { color: '#999' } },
                        y: { stacked: true, beginAtZero: true, ticks: { color: '#999' } }
                    },
                    plugins: { legend: { labels: { color: '#999' } } }
                }
            });
        }
    }

    function renderResultsTable(results) {
        const container = $('resultsTable');
        if (results.length === 0) {
            container.innerHTML = '<p class="empty-state">No results yet.</p>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr><th>User</th><th>Session</th><th>Score</th><th>Correct</th><th>Time</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${results.map(r => `
                        <tr>
                            <td>${escapeHtml(r.username)}</td>
                            <td>${escapeHtml(r.sessionName)}</td>
                            <td><span class="score-badge ${r.percentage >= 70 ? 'good' : r.percentage >= 50 ? 'ok' : 'low'}">${r.percentage}%</span></td>
                            <td>${r.correctAnswers}/${r.totalQuestions}</td>
                            <td>${r.totalTimeSeconds ? Math.round(r.totalTimeSeconds) + 's' : '-'}</td>
                            <td>${r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '-'}</td>
                            <td><button class="btn btn-secondary btn-sm" onclick="window._quizAdmin.viewUserAnswers(${r.userId}, ${r.sessionId}, '${escapeHtml(r.username)}')">View Answers</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function loadUsers() {
        try {
            const data = await api('/admin/users');
            if (!data.success) return;

            const container = $('usersTable');
            if (data.users.length === 0) {
                container.innerHTML = '<p class="empty-state">No users registered yet.</p>';
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr><th>Username</th><th>Quizzes Taken</th><th>Registered</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        ${data.users.map(u => `
                            <tr>
                                <td>${escapeHtml(u.username)}</td>
                                <td>${u.quizCount}</td>
                                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
                                <td><button class="btn btn-danger btn-sm" onclick="window._quizAdmin.deleteUser(${u.id})">Delete</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Failed to load users:', e);
        }
    }

    window._quizAdmin.deleteUser = async (id) => {
        if (!confirm('Delete this user and all their results?')) return;
        const data = await api(`/admin/users/${id}`, { method: 'DELETE' });
        if (data.success) {
            showToast('User deleted');
            await loadUsers();
        } else {
            showToast(data.error || 'Failed to delete user', 'error');
        }
    };

    async function exportResults(type) {
        const sessionId = $('resultsSessionFilter')?.value || '';
        const url = `/api/admin/results/export?type=${type}${sessionId ? '&sessionId=' + sessionId : ''}`;
        try {
            const resp = await fetch(url, {
                headers: { 'X-Admin-Token': quizState.adminToken }
            });
            if (!resp.ok) return showToast('Export failed', 'error');
            const blob = await resp.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = resp.headers.get('Content-Disposition')?.split('filename=')[1] || `trivia-results.csv`;
            a.click();
            showToast('Export downloaded');
        } catch (e) {
            showToast('Export failed', 'error');
        }
    }

    // ==================== UTILITIES ====================
    function hideAllScreens() {
        // Hide quiz-mode screens
        hide($('quizAuthScreen'));
        hide($('quizPlayScreen'));
        hide($('quizCompleteScreen'));
        hide($('adminPanel'));
        hide($('adminLoginModal'));
        // Hide freeplay screens
        hide($('welcomeScreen'));
        hide($('gameOverScreen'));
        hide($('gameHeader'));
        hide($('singleMode'));
        hide($('jeopardyMode'));
        hide($('scoreboard'));
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML.replace(/'/g, '&#39;');
    }

    // ==================== BOOT ====================
    // Wait for DOM and original app to initialize, then layer quiz mode on top
    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to let app.js init() complete first
        setTimeout(() => {
            initAuthListeners();
            initAdminListeners();
            initQuizMode();
        }, 100);
    });

})();
