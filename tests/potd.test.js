const assert = require('node:assert/strict');
const test = require('node:test');
const CFdaily = require('../src/potd.js');

const problems = [
    { contestId: 1, index: 'A', name: 'Easy one', rating: 800 },
    { contestId: 2, index: 'A', name: 'Easy two', rating: 800 },
    { contestId: 3, index: 'B', name: 'Harder', rating: 900 }
];

test('daily assignments are stable, unsolved, and isolated', () => {
    const firstPick = CFdaily.pickDailyProblem(problems, 800, '2026-08-10');
    const repeatedPick = CFdaily.pickDailyProblem([...problems].reverse(), 800, '2026-08-10');
    const solved = new Set([CFdaily.problemKey(firstPick)]);

    assert.equal(firstPick.rating, 800);
    assert.equal(CFdaily.problemKey(firstPick), CFdaily.problemKey(repeatedPick));
    assert.notEqual(
        CFdaily.problemKey(CFdaily.pickDailyProblem(problems, 800, '2026-08-10', solved)),
        CFdaily.problemKey(firstPick)
    );
    assert.equal(
        CFdaily.problemKey(CFdaily.getDailyProblem(
            problems,
            800,
            '2026-08-10',
            solved,
            CFdaily.problemKey(firstPick)
        )),
        CFdaily.problemKey(firstPick)
    );
    assert.notEqual(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('Tourist', 900, '2026-08-10')
    );
    assert.notEqual(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-11')
    );
    assert.equal(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('tourist', 800, '2026-08-10')
    );
    assert.equal(CFdaily.pickDailyProblem(problems, 1000, '2026-08-10'), null);
    assert.deepEqual(CFdaily.ratings(), Array.from({ length: 28 }, (_, index) => 800 + index * 100));
});

test('only accepted submissions count as solved', async t => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            status: 'OK',
            result: [
                { verdict: 'OK', problem: problems[0] },
                { verdict: 'WRONG_ANSWER', problem: problems[1] }
            ]
        })
    });

    assert.deepEqual([...await CFdaily.fetchSolvedProblemKeys('test-handle')], ['1-A']);
});
