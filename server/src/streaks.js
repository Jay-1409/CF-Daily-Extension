const DAY_MS = 86_400_000;

export function utcDay(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function dayNumber(day) {
    return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export function calculateStreaks(days, today = utcDay()) {
    const ordered = [...new Set(days)].sort();
    let longestStreak = 0;
    let run = 0;
    let previous;

    for (const day of ordered) {
        const current = dayNumber(day);
        run = previous !== undefined && current === previous + 1 ? run + 1 : 1;
        longestStreak = Math.max(longestStreak, run);
        previous = current;
    }

    const latest = ordered.at(-1);
    const gap = latest ? dayNumber(today) - dayNumber(latest) : Number.POSITIVE_INFINITY;
    let currentStreak = gap === 0 || gap === 1 ? 1 : 0;
    if (currentStreak) {
        for (let index = ordered.length - 2; index >= 0; index -= 1) {
            if (dayNumber(ordered[index + 1]) - dayNumber(ordered[index]) !== 1) break;
            currentStreak += 1;
        }
    }

    return {
        currentStreak,
        longestStreak,
        totalActiveDays: ordered.length
    };
}
