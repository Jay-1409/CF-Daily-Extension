(function () {
    if (document.URL.includes('acmsguru')) return;

    const table = document.querySelector('table.problems');
    const tableBody = table?.tBodies[0];
    if (!tableBody) return;

    const potdRow = document.createElement('tr');
    potdRow.id = 'cf-daily-potd';
    tableBody.insertBefore(potdRow, tableBody.rows[1] || null);

    let renderVersion = 0;
    let currentHandle = 'Enter';
    let problemsetPromise;
    let acceptedSubmissionsPromise;

    function detectHandle() {
        const profileLink = document.querySelector('.lang-chooser a[href*="/profile/"]');
        if (!profileLink) return 'Enter';

        const match = profileLink.getAttribute('href')?.match(/\/profile\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : 'Enter';
    }

    function renderMessage(label, message) {
        potdRow.replaceChildren();
        potdRow.classList.remove('cf-daily-completed', 'cf-daily-previously-solved');

        const labelCell = potdRow.insertCell();
        const messageCell = potdRow.insertCell();
        labelCell.textContent = label;
        messageCell.colSpan = 4;
        messageCell.textContent = message;
    }

    function appendLink(parent, href, text, className) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = text;
        if (className) link.className = className;
        parent.append(link);
        return link;
    }

    function renderProblem(problem, statistics, submission) {
        const isCompleted = submission.completedAt !== undefined;
        potdRow.replaceChildren();
        potdRow.classList.toggle('cf-daily-completed', isCompleted);
        potdRow.classList.toggle(
            'cf-daily-previously-solved',
            !isCompleted && submission.solvedBefore
        );

        const idCell = potdRow.insertCell();
        const nameCell = potdRow.insertCell();
        const submitCell = potdRow.insertCell();
        const ratingCell = potdRow.insertCell();
        const solvedCell = potdRow.insertCell();

        const problemPath = `/problemset/problem/${problem.contestId}/${problem.index}`;
        appendLink(idCell, problemPath, isCompleted ? 'POTD ✓' : 'POTD');

        const name = document.createElement('div');
        appendLink(name, problemPath, problem.name);

        if (isCompleted || submission.solvedBefore) {
            const completed = document.createElement('span');
            completed.className = 'cf-daily-status';
            completed.textContent = isCompleted ? 'Completed today' : 'Solved before · Reattempt';
            name.append(' ', completed);
        }

        const tags = document.createElement('div');
        tags.className = 'cf-daily-tags';
        problem.tags.forEach((tag, index) => {
            appendLink(tags, `/problemset?tags=${encodeURIComponent(tag)}`, tag, 'notice');
            if (index < problem.tags.length - 1) tags.append(', ');
        });
        nameCell.append(name, tags);

        const submit = document.createElement('a');
        submit.href = `/problemset/submit/${problem.contestId}/${problem.index}`;
        const submitIcon = document.createElement('img');
        submitIcon.src = 'https://codeforces.org/s/47998/images/icons/submit-22x22.png';
        submitIcon.title = 'Submit';
        submitIcon.alt = 'Submit';
        submit.append(submitIcon);
        submitCell.append(submit);

        const rating = document.createElement('span');
        rating.className = 'ProblemRating';
        rating.title = 'Difficulty';
        rating.textContent = String(problem.rating);
        ratingCell.append(rating);

        const solvedLink = document.createElement('a');
        solvedLink.href = `/problemset/status/${problem.contestId}/problem/${problem.index}`;
        solvedLink.title = 'Participants solved the problem';
        solvedLink.className = 'cf-daily-solved';

        const userIcon = document.createElement('img');
        userIcon.src = 'https://codeforces.org/s/47998/images/icons/user.png';
        userIcon.alt = '';
        solvedLink.append(userIcon, ` x${statistics?.solvedCount ?? 0}`);
        solvedCell.append(solvedLink);
    }

    async function defaultRating(savedRating) {
        if (savedRating !== undefined) return CFDaily.normalizeRating(savedRating);
        if (currentHandle === 'Enter') return CFDaily.DEFAULT_RATING;

        try {
            const users = await CFDaily.fetchApi(`user.info?handles=${encodeURIComponent(currentHandle)}`);
            return CFDaily.normalizeRating(users[0]?.rating);
        } catch (error) {
            console.error(error);
            return CFDaily.DEFAULT_RATING;
        }
    }

    async function loadProblem(requestedRating) {
        const version = ++renderVersion;
        const rating = CFDaily.normalizeRating(requestedRating);
        renderMessage(`POTD · ${rating}`, 'Loading your daily problem…');

        try {
            problemsetPromise ||= CFDaily.fetchProblemset();
            acceptedSubmissionsPromise ||= CFDaily.fetchAcceptedSubmissions(currentHandle);

            const [{ problems, statistics }, acceptedSubmissions] = await Promise.all([
                problemsetPromise,
                acceptedSubmissionsPromise
            ]);
            if (version !== renderVersion) return;

            const day = CFDaily.dateKey();
            const assignmentKey = CFDaily.assignmentStorageKey(rating, day);
            const completionKey = CFDaily.completionStorageKey(currentHandle, rating, day);
            const stored = await chrome.storage.local.get([assignmentKey, completionKey]);
            const problem = CFDaily.getDailyProblem(
                problems,
                rating,
                day,
                stored[assignmentKey]
            );

            if (!problem) {
                renderMessage(`POTD · ${rating}`, `No ${rating} problem is available.`);
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
            if (version !== renderVersion) return;

            renderProblem(
                problem,
                statistics.get(selectedProblemKey),
                submission
            );
        } catch (error) {
            console.error(error);
            problemsetPromise = undefined;
            acceptedSubmissionsPromise = undefined;
            if (version === renderVersion) {
                renderMessage(`POTD · ${rating}`, 'Could not load the Codeforces POTD.');
            }
        }
    }

    async function initialise() {
        currentHandle = detectHandle();
        await chrome.storage.local.set({ name: currentHandle });

        const saved = await chrome.storage.local.get(['selectedRating', 'rating']);
        const selectedRating = saved.selectedRating === undefined
            ? await defaultRating(saved.rating)
            : CFDaily.normalizeRating(saved.selectedRating);

        await chrome.storage.local.set({ selectedRating });
        await loadProblem(selectedRating);
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.selectedRating) {
            loadProblem(changes.selectedRating.newValue);
        }
    });

    initialise();
}());
