const ratingSelect = document.getElementById('ratingSelect');
const output = document.getElementById('output');
const userNote = document.getElementById('userNote');

let handle = 'Enter';
let loadVersion = 0;
let problemsetPromise;
let solvedProblemsPromise;

function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
    return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function setStatus(message) {
    output.replaceChildren();
    output.classList.remove('completed');
    const status = document.createElement('p');
    status.className = 'status';
    status.textContent = message;
    output.append(status);
}

function renderProblem(problem, isCompleted) {
    output.replaceChildren();
    output.classList.toggle('completed', isCompleted);

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = isCompleted
        ? `COMPLETED · ${problem.rating}`
        : `TODAY · ${problem.rating}`;

    const title = document.createElement('a');
    title.className = 'problem-title';
    title.href = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
    title.target = '_blank';
    title.textContent = problem.name;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${problem.contestId}${problem.index}`;

    const solve = document.createElement('a');
    solve.className = 'solve-button';
    solve.href = title.href;
    solve.target = '_blank';
    solve.textContent = isCompleted ? 'View completed problem' : 'Solve on Codeforces';

    output.append(eyebrow, title, meta, solve);
}

async function loadProblem() {
    const version = ++loadVersion;
    const rating = CFDaily.normalizeRating(ratingSelect.value);
    setStatus(`Finding today's ${rating} problem…`);

    try {
        problemsetPromise ||= CFDaily.fetchProblemset();
        solvedProblemsPromise ||= CFDaily.fetchSolvedProblemKeys(handle);

        const [{ problems }, solvedProblems] = await Promise.all([
            problemsetPromise,
            solvedProblemsPromise
        ]);
        if (version !== loadVersion) return;

        const day = CFDaily.dateKey();
        const assignmentKey = CFDaily.assignmentStorageKey(handle, rating, day);
        const assignment = await storageGet(assignmentKey);
        const problem = CFDaily.getDailyProblem(
            problems,
            rating,
            day,
            solvedProblems,
            assignment[assignmentKey]
        );

        if (!problem) {
            setStatus(`No unsolved ${rating} problem is available.`);
            return;
        }

        const selectedProblemKey = CFDaily.problemKey(problem);
        if (assignment[assignmentKey] !== selectedProblemKey) {
            await storageSet({ [assignmentKey]: selectedProblemKey });
        }
        if (version !== loadVersion) return;

        renderProblem(problem, solvedProblems.has(selectedProblemKey));
    } catch (error) {
        console.error(error);
        problemsetPromise = undefined;
        solvedProblemsPromise = undefined;
        if (version === loadVersion) setStatus('Could not load Codeforces. Please try again.');
    }
}

async function initialise() {
    for (const rating of CFDaily.ratings()) {
        const option = document.createElement('option');
        option.value = String(rating);
        option.textContent = String(rating);
        ratingSelect.append(option);
    }

    const saved = await storageGet(['selectedRating', 'rating', 'name']);
    handle = saved.name || 'Enter';
    const selectedRating = CFDaily.normalizeRating(saved.selectedRating ?? saved.rating);
    ratingSelect.value = String(selectedRating);
    await storageSet({ selectedRating });

    userNote.textContent = handle === 'Enter'
        ? 'Sign in on Codeforces to exclude solved problems.'
        : 'Accepted Codeforces submissions are excluded.';

    await loadProblem();
}

ratingSelect.addEventListener('change', async () => {
    const selectedRating = CFDaily.normalizeRating(ratingSelect.value);
    await storageSet({ selectedRating });
    await loadProblem();
});

initialise();
