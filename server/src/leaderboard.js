export function rankProfiles(profiles, metric = 'streak') {
    return profiles.sort(metric === 'solved'
        ? (left, right) => (
            right.totalCompletions - left.totalCompletions
            || right.totalActiveDays - left.totalActiveDays
            || right.currentStreak - left.currentStreak
            || left.displayName.localeCompare(right.displayName)
        )
        : (left, right) => (
            right.currentStreak - left.currentStreak
            || right.longestStreak - left.longestStreak
            || right.totalCompletions - left.totalCompletions
            || left.displayName.localeCompare(right.displayName)
        ));
}

export function rankRatingProfiles(profiles, activity) {
    const completions = new Map();
    for (const entry of activity) {
        const current = completions.get(entry.user_id) || {
            ratingCompletions: 0,
            ratingLastCompletedAt: 0
        };
        current.ratingCompletions += 1;
        current.ratingLastCompletedAt = Math.max(current.ratingLastCompletedAt, entry.completed_at);
        completions.set(entry.user_id, current);
    }

    return profiles
        .filter(profile => completions.has(profile.uid))
        .map(profile => ({ ...profile, ...completions.get(profile.uid) }))
        .sort((left, right) => (
            right.ratingCompletions - left.ratingCompletions
            || right.ratingLastCompletedAt - left.ratingLastCompletedAt
            || left.displayName.localeCompare(right.displayName)
        ));
}
