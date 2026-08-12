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
