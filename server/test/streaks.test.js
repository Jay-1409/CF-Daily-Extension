import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateStreaks, utcDay } from '../src/streaks.js';

test('calculates current and longest streaks from unique UTC days', () => {
    assert.deepEqual(calculateStreaks([
        '2026-08-01',
        '2026-08-02',
        '2026-08-02',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07'
    ], '2026-08-08'), {
        currentStreak: 3,
        longestStreak: 3,
        totalActiveDays: 5
    });
});

test('current streak expires after a missed UTC day', () => {
    assert.equal(calculateStreaks(['2026-08-01'], '2026-08-03').currentStreak, 0);
    assert.equal(utcDay(new Date('2026-08-12T23:59:59Z')), '2026-08-12');
});
