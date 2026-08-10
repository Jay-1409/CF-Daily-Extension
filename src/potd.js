(function (root) {
    const MIN_RATING = 800;
    const MAX_RATING = 3500;
    const RATING_STEP = 100;
    const DEFAULT_RATING = 800;

    function ratings() {
        const values = [];
        for (let rating = MIN_RATING; rating <= MAX_RATING; rating += RATING_STEP) {
            values.push(rating);
        }
        return values;
    }

    function normalizeRating(value, fallback = DEFAULT_RATING) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return fallback;

        const rounded = Math.round(numericValue / RATING_STEP) * RATING_STEP;
        return Math.min(MAX_RATING, Math.max(MIN_RATING, rounded));
    }

    function dateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function problemKey(problem) {
        return `${problem.contestId}-${problem.index}`;
    }

    function assignmentStorageKey(handle, rating, day = dateKey()) {
        const owner = handle && handle !== 'Enter' ? handle.toLowerCase() : 'guest';
        return `potdAssignment:${encodeURIComponent(owner)}:${day}:${normalizeRating(rating)}`;
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

    function pickDailyProblem(problems, rating, day = dateKey(), solvedKeys = new Set()) {
        const normalizedRating = normalizeRating(rating);
        let selected = null;
        let selectedScore = Number.POSITIVE_INFINITY;
        let selectedKey = '';

        for (const problem of problems) {
            if (!problem.contestId || !problem.index || problem.rating !== normalizedRating) continue;

            const key = problemKey(problem);
            if (solvedKeys.has(key)) continue;

            const score = hash(`${day}:${normalizedRating}:${key}`);
            if (score < selectedScore || (score === selectedScore && key < selectedKey)) {
                selected = problem;
                selectedScore = score;
                selectedKey = key;
            }
        }

        return selected;
    }

    function getDailyProblem(problems, rating, day = dateKey(), solvedKeys = new Set(), assignedKey) {
        const normalizedRating = normalizeRating(rating);

        if (assignedKey) {
            const assignedProblem = problems.find(problem => (
                problem.rating === normalizedRating && problemKey(problem) === assignedKey
            ));
            if (assignedProblem) return assignedProblem;
        }

        return pickDailyProblem(problems, normalizedRating, day, solvedKeys);
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
        const statistics = new Map();

        result.problems.forEach((problem, index) => {
            statistics.set(problemKey(problem), result.problemStatistics[index]);
        });

        return { problems: result.problems, statistics };
    }

    async function fetchSolvedProblemKeys(handle) {
        if (!handle || handle === 'Enter') return new Set();

        const submissions = await fetchApi(`user.status?handle=${encodeURIComponent(handle)}`);
        const solved = new Set();

        for (const submission of submissions) {
            if (submission.verdict === 'OK' && submission.problem) {
                solved.add(problemKey(submission.problem));
            }
        }

        return solved;
    }

    const api = {
        DEFAULT_RATING,
        MAX_RATING,
        MIN_RATING,
        assignmentStorageKey,
        dateKey,
        fetchApi,
        fetchProblemset,
        fetchSolvedProblemKeys,
        getDailyProblem,
        normalizeRating,
        pickDailyProblem,
        problemKey,
        ratings
    };

    root.CFDaily = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
