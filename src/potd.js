(function (root) {
    const MIN_RATING = 800;
    const MAX_RATING = 3500;
    const RATING_STEP = 100;
    const DEFAULT_RATING = 800;

    function ratings() {
        return Array.from(
            { length: (MAX_RATING - MIN_RATING) / RATING_STEP + 1 },
            (_, index) => MIN_RATING + index * RATING_STEP
        );
    }

    function normalizeRating(value, fallback = DEFAULT_RATING) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return fallback;

        const rounded = Math.round(numericValue / RATING_STEP) * RATING_STEP;
        return Math.min(MAX_RATING, Math.max(MIN_RATING, rounded));
    }

    function dateKey(date = new Date()) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function problemKey(problem) {
        return `${problem.contestId}-${problem.index}`;
    }

    function storageOwner(handle) {
        const owner = handle && handle !== 'Enter' ? handle.toLowerCase() : 'guest';
        return encodeURIComponent(owner);
    }

    function assignmentStoragePrefix() {
        return 'potdAssignment:global:';
    }

    function assignmentStorageKey(rating, day = dateKey()) {
        return `${assignmentStoragePrefix()}${day}:${normalizeRating(rating)}`;
    }

    function completionStoragePrefix(handle) {
        return `potdCompletion:${storageOwner(handle)}:`;
    }

    function completionStorageKey(handle, rating, day = dateKey()) {
        return `${completionStoragePrefix(handle)}${day}:${normalizeRating(rating)}`;
    }

    // FNV-1a gives every problem a stable daily rank without relying on API order.
    function hash(value) {
        let result = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            result ^= value.charCodeAt(index);
            result = Math.imul(result, 16777619);
        }
        return result >>> 0;
    }

    function pickDailyProblem(problems, rating, day = dateKey()) {
        const normalizedRating = normalizeRating(rating);
        let selected = null;
        let selectedScore = Number.POSITIVE_INFINITY;
        let selectedKey = '';

        for (const problem of problems) {
            if (!problem.contestId || !problem.index || problem.rating !== normalizedRating) continue;

            const key = problemKey(problem);
            const score = hash(`${day}:${normalizedRating}:${key}`);
            if (score < selectedScore || (score === selectedScore && key < selectedKey)) {
                selected = problem;
                selectedScore = score;
                selectedKey = key;
            }
        }

        return selected;
    }

    function getDailyProblem(problems, rating, day = dateKey(), assignedKey) {
        const normalizedRating = normalizeRating(rating);

        if (assignedKey) {
            const assignedProblem = problems.find(problem => (
                problem.rating === normalizedRating && problemKey(problem) === assignedKey
            ));
            if (assignedProblem) return assignedProblem;
        }

        return pickDailyProblem(problems, normalizedRating, day);
    }

    async function fetchApi(path) {
        const response = await fetch(`https://codeforces.com/api/${path}`);
        if (!response.ok) throw new Error(`Codeforces request failed (${response.status})`);

        const data = await response.json();
        if (data.status !== 'OK') throw new Error(data.comment || 'Codeforces API request failed');
        return data.result;
    }

    async function fetchProblemset() {
        const result = await fetchApi('problemset.problems');
        const statistics = new Map(
            result.problemStatistics.map(statistic => [problemKey(statistic), statistic])
        );

        return { problems: result.problems, statistics };
    }

    async function fetchAcceptedSubmissions(handle) {
        if (!handle || handle === 'Enter') return new Map();

        const submissions = await fetchApi(`user.status?handle=${encodeURIComponent(handle)}`);
        const accepted = new Map();

        for (const submission of submissions) {
            if (submission.verdict === 'OK' && submission.problem) {
                const key = problemKey(submission.problem);
                const completedAt = submission.creationTimeSeconds || 0;
                const timestamps = accepted.get(key) || [];
                timestamps.push(completedAt);
                accepted.set(key, timestamps);
            }
        }

        for (const timestamps of accepted.values()) timestamps.sort((a, b) => a - b);
        return accepted;
    }

    function acceptedOnDay(acceptedSubmissions, key, day) {
        return acceptedSubmissions.get(key)?.find(timestamp => (
            dateKey(new Date(timestamp * 1000)) === day
        ));
    }

    function submissionStatus(acceptedSubmissions, key, day = dateKey()) {
        const timestamps = acceptedSubmissions.get(key) || [];
        return {
            completedAt: acceptedOnDay(acceptedSubmissions, key, day),
            solvedBefore: timestamps.some(timestamp => (
                dateKey(new Date(timestamp * 1000)) < day
            ))
        };
    }

    const api = {
        DEFAULT_RATING,
        acceptedOnDay,
        assignmentStoragePrefix,
        assignmentStorageKey,
        completionStoragePrefix,
        completionStorageKey,
        dateKey,
        fetchAcceptedSubmissions,
        fetchApi,
        fetchProblemset,
        getDailyProblem,
        normalizeRating,
        pickDailyProblem,
        problemKey,
        ratings,
        submissionStatus
    };

    root.CFDaily = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
