const ratingSelect = document.getElementById('ratingSelect');
const output = document.getElementById('output');
const userNote = document.getElementById('userNote');
const accountPanel = document.getElementById('accountPanel');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');
const accountContent = document.getElementById('accountContent');
const accountAvatar = document.getElementById('accountAvatar');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const currentStreak = document.getElementById('currentStreak');
const longestStreak = document.getElementById('longestStreak');
const leaderboardPanel = document.getElementById('leaderboardPanel');
const leaderboardList = document.getElementById('leaderboardList');
const leaderboardDescription = document.getElementById('leaderboardDescription');
const leaderboardStatus = document.getElementById('leaderboardStatus');
const leaderboardStatusText = document.getElementById('leaderboardStatusText');
const leaderboardButtons = [...document.querySelectorAll('[data-leaderboard-metric]')];
const cloudStatus = document.getElementById('cloudStatus');

let handle = 'Enter';
let loadVersion = 0;
let problemsetPromise;
let acceptedSubmissionsPromise;
let leaderboards = { streak: [], solved: [], rating: [] };
let leaderboardMetric = 'streak';
let ratingLeaderboardVersion = 0;

function setSignedIn(isSignedIn) {
    signInButton.hidden = isSignedIn;
    accountContent.hidden = !isSignedIn;
    leaderboardPanel.hidden = !isSignedIn;
    document.documentElement.classList.toggle('signed-in', isSignedIn);
}

function setCloudStatus(message, isError = false) {
    cloudStatus.textContent = message;
    cloudStatus.classList.toggle('error', isError);
}

function setLeaderboardStatus(message = '', isError = false) {
    const isLoading = Boolean(message) && !isError;
    leaderboardStatus.hidden = !message;
    leaderboardStatus.classList.toggle('error', isError);
    leaderboardStatus.classList.toggle('loading', isLoading);
    leaderboardStatusText.textContent = message;
    leaderboardList.hidden = Boolean(message);
    leaderboardPanel.setAttribute('aria-busy', String(isLoading));
    for (const button of leaderboardButtons) button.disabled = isLoading;
}

function renderLeaderboard() {
    const entries = leaderboards[leaderboardMetric] || [];
    const selectedRating = CFDaily.normalizeRating(ratingSelect.value);
    leaderboardDescription.textContent = leaderboardMetric === 'solved'
        ? 'All rating-specific POTDs completed'
        : leaderboardMetric === 'rating'
            ? `${selectedRating}-rated POTDs completed`
            : 'Consecutive active days';
    leaderboardList.replaceChildren();
    if (!entries.length) {
        const item = document.createElement('li');
        item.className = 'leaderboard-empty';
        item.textContent = leaderboardMetric === 'rating'
            ? `No ${selectedRating}-rated completions yet.`
            : 'No leaderboard entries yet.';
        leaderboardList.append(item);
        return;
    }
    for (const entry of entries) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        const score = document.createElement('strong');
        name.textContent = `${entry.rank}. ${entry.displayName}`;
        score.textContent = leaderboardMetric === 'solved' || leaderboardMetric === 'rating'
            ? `${leaderboardMetric === 'rating' ? entry.ratingCompletions : entry.totalCompletions} solved`
            : `${entry.currentStreak} day${entry.currentStreak === 1 ? '' : 's'}`;
        item.append(name, score);
        leaderboardList.append(item);
    }
}

function selectLeaderboardMetric(metric) {
    leaderboardMetric = metric;
    for (const button of leaderboardButtons) {
        button.setAttribute('aria-selected', String(button.dataset.leaderboardMetric === metric));
    }
}

async function loadRatingLeaderboard() {
    if (leaderboardPanel.hidden) return;
    const version = ++ratingLeaderboardVersion;
    const rating = CFDaily.normalizeRating(ratingSelect.value);
    selectLeaderboardMetric('rating');
    renderLeaderboard();
    setLeaderboardStatus(`Loading ${rating} leaderboard…`);
    try {
        const entries = await CFDailyCloud.ratingLeaderboard(rating);
        if (version !== ratingLeaderboardVersion) return;
        leaderboards.rating = entries;
        renderLeaderboard();
        setLeaderboardStatus();
    } catch (error) {
        console.error(error);
        if (version === ratingLeaderboardVersion) {
            setLeaderboardStatus(`Could not load the ${rating} leaderboard.`, true);
        }
    }
}

async function loadAccount() {
    if (!CFDailyCloud.configured()) {
        signInButton.disabled = true;
        setCloudStatus('Add Supabase configuration to enable cloud sync.');
        return;
    }

    try {
        const session = await CFDailyCloud.session();
        setSignedIn(Boolean(session));
        if (!session) {
            userNote.textContent = 'Sign in to sync daily completions.';
            setCloudStatus('Sign in to sync activity across devices.');
            return;
        }

        accountAvatar.src = session.photoURL || '../icons/icon48.png';
        accountName.textContent = session.displayName;
        accountEmail.textContent = session.email;
        setLeaderboardStatus('Loading leaderboard…');
        setCloudStatus('Syncing activity…');
        const dashboard = await CFDailyCloud.dashboard(handle);
        currentStreak.textContent = String(dashboard.user.currentStreak);
        longestStreak.textContent = String(dashboard.user.longestStreak);
        leaderboards = dashboard.leaderboards;
        renderLeaderboard();
        setLeaderboardStatus();
        userNote.textContent = 'Daily completions sync across your devices.';
        setCloudStatus('Activity synced with Supabase.');
    } catch (error) {
        console.error(error);
        if (!leaderboardPanel.hidden) setLeaderboardStatus('Could not load leaderboard.', true);
        setCloudStatus(error.message, true);
    }
}

function setStatus(message, isLoading = true) {
    output.replaceChildren();
    output.classList.remove('completed', 'previously-solved');
    output.setAttribute('aria-busy', String(isLoading));
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = message;
    if (isLoading) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        loading.append(spinner);
    }
    loading.append(status);
    output.append(loading);
}

function renderProblem(problem, submission) {
    const isCompleted = submission.completedAt !== undefined;
    output.replaceChildren();
    output.classList.toggle('completed', isCompleted);
    output.classList.toggle('previously-solved', !isCompleted && submission.solvedBefore);
    output.setAttribute('aria-busy', 'false');

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = isCompleted
        ? `COMPLETED TODAY · ${problem.rating}`
        : submission.solvedBefore
            ? `SOLVED BEFORE · ${problem.rating}`
            : `TODAY · ${problem.rating}`;

    const title = document.createElement('a');
    title.className = 'problem-title';
    title.href = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
    title.target = '_blank';
    title.rel = 'noreferrer';
    title.textContent = problem.name;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${problem.contestId}${problem.index}`;

    const solve = document.createElement('a');
    solve.className = 'solve-button';
    solve.href = title.href;
    solve.target = '_blank';
    solve.rel = 'noreferrer';
    solve.textContent = isCompleted || submission.solvedBefore
        ? 'Reattempt on Codeforces'
        : 'Solve on Codeforces';

    output.append(eyebrow, title, meta, solve);
}

async function loadProblem() {
    const version = ++loadVersion;
    const rating = CFDaily.normalizeRating(ratingSelect.value);
    setStatus(`Finding today's ${rating} problem…`);

    try {
        problemsetPromise ||= CFDaily.fetchProblemset();
        acceptedSubmissionsPromise ||= CFDaily.fetchAcceptedSubmissions(handle);

        const [{ problems }, acceptedSubmissions] = await Promise.all([
            problemsetPromise,
            acceptedSubmissionsPromise
        ]);
        if (version !== loadVersion) return;

        const day = CFDaily.dateKey();
        const assignmentKey = CFDaily.assignmentStorageKey(rating, day);
        const completionKey = CFDaily.completionStorageKey(handle, rating, day);
        const stored = await chrome.storage.local.get([assignmentKey, completionKey]);
        const problem = CFDaily.getDailyProblem(
            problems,
            rating,
            day,
            stored[assignmentKey]
        );

        if (!problem) {
            setStatus(`No ${rating} problem is available.`, false);
            return;
        }

        const selectedProblemKey = CFDaily.problemKey(problem);
        if (stored[assignmentKey] !== selectedProblemKey) {
            await chrome.storage.local.set({ [assignmentKey]: selectedProblemKey });
        }
        const submission = CFDaily.submissionStatus(
            acceptedSubmissions,
            selectedProblemKey,
            day
        );
        if (submission.completedAt !== undefined && !stored[completionKey]) {
            await chrome.storage.local.set({
                [completionKey]: {
                    problemKey: selectedProblemKey,
                    completedAt: submission.completedAt
                }
            });
        }
        if (version !== loadVersion) return;

        renderProblem(problem, submission);
    } catch (error) {
        console.error(error);
        problemsetPromise = undefined;
        acceptedSubmissionsPromise = undefined;
        if (version === loadVersion) {
            setStatus('Could not load Codeforces. Please try again.', false);
        }
    }
}

async function initialise() {
    for (const rating of CFDaily.ratings()) {
        const option = document.createElement('option');
        option.value = String(rating);
        option.textContent = String(rating);
        ratingSelect.append(option);
    }

    const saved = await chrome.storage.local.get(['selectedRating', 'rating', 'name']);
    handle = saved.name || 'Enter';
    const selectedRating = CFDaily.normalizeRating(saved.selectedRating ?? saved.rating);
    ratingSelect.value = String(selectedRating);
    await chrome.storage.local.set({ selectedRating });

    userNote.textContent = handle === 'Enter'
        ? 'Sign in to sync daily completions.'
        : 'Today’s accepted submission updates your activity.';

    await loadProblem();
    await loadAccount();
}

ratingSelect.addEventListener('change', async () => {
    const selectedRating = CFDaily.normalizeRating(ratingSelect.value);
    await chrome.storage.local.set({ selectedRating });
    await Promise.all([loadProblem(), loadRatingLeaderboard()]);
});

for (const button of leaderboardButtons) {
    button.addEventListener('click', async () => {
        if (button.dataset.leaderboardMetric === 'rating') {
            await loadRatingLeaderboard();
            return;
        }
        ratingLeaderboardVersion += 1;
        selectLeaderboardMetric(button.dataset.leaderboardMetric);
        setLeaderboardStatus();
        renderLeaderboard();
    });
}

signInButton.addEventListener('click', async () => {
    signInButton.disabled = true;
    setCloudStatus('Opening Google sign-in…');
    try {
        await CFDailyCloud.signIn();
        await loadAccount();
    } catch (error) {
        console.error(error);
        setCloudStatus(error.message, true);
    } finally {
        signInButton.disabled = false;
    }
});

signOutButton.addEventListener('click', async () => {
    await CFDailyCloud.signOut();
    await loadAccount();
});

initialise();
