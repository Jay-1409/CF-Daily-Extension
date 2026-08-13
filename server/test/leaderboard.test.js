import assert from 'node:assert/strict';
import test from 'node:test';
import { rankProfiles, rankRatingProfiles } from '../src/leaderboard.js';

const users = [
    { displayName: 'Ada', currentStreak: 2, longestStreak: 5, totalActiveDays: 8, totalCompletions: 12 },
    { displayName: 'Linus', currentStreak: 6, longestStreak: 6, totalActiveDays: 6, totalCompletions: 6 },
    { displayName: 'Grace', currentStreak: 3, longestStreak: 4, totalActiveDays: 9, totalCompletions: 14 }
];

test('ranks the streak leaderboard by current streak', () => {
    assert.deepEqual(
        rankProfiles(structuredClone(users), 'streak').map(user => user.displayName),
        ['Linus', 'Grace', 'Ada']
    );
});

test('ranks the solved leaderboard by total completions', () => {
    assert.deepEqual(
        rankProfiles(structuredClone(users), 'solved').map(user => user.displayName),
        ['Grace', 'Ada', 'Linus']
    );
});

test('ranks a rating leaderboard independently from other ratings', () => {
    const profiles = users.map((user, index) => ({ ...user, uid: `user-${index + 1}` }));
    const activity = [
        { user_id: 'user-1', completed_at: 10 },
        { user_id: 'user-1', completed_at: 20 },
        { user_id: 'user-2', completed_at: 30 }
    ];

    assert.deepEqual(
        rankRatingProfiles(profiles, activity).map(user => [user.displayName, user.ratingCompletions]),
        [['Ada', 2], ['Linus', 1]]
    );
});
