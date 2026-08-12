import assert from 'node:assert/strict';
import test from 'node:test';
import { rankProfiles } from '../src/leaderboard.js';

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
