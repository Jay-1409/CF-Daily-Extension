const ratingSelect = document.getElementById('ratingSelect');
const output = document.getElementById('output');
const userNote = document.getElementById('userNote');

let handle = 'Enter';
let loadVersion = 0;
let problemsetPromise;
let acceptedSubmissionsPromise;

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
}

ratingSelect.addEventListener('change', async () => {
    const selectedRating = CFDaily.normalizeRating(ratingSelect.value);
    await chrome.storage.local.set({ selectedRating });
    await loadProblem();
});

initialise();
