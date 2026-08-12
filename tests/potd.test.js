const assert = require('node:assert/strict');
const test = require('node:test');
const CFdaily = require('../src/potd.js');

const problems = [
    { contestId: 1, index: 'A', name: 'Easy one', rating: 800 },
    { contestId: 2, index: 'A', name: 'Easy two', rating: 800 },
    { contestId: 3, index: 'B', name: 'Harder', rating: 900 }
];

test('daily assignments are globally stable and isolated by rating', () => {
    const firstPick = CFdaily.pickDailyProblem(problems, 800, '2026-08-10');
    const repeatedPick = CFdaily.pickDailyProblem([...problems].reverse(), 800, '2026-08-10');

    assert.equal(firstPick.rating, 800);
    assert.equal(CFdaily.problemKey(firstPick), CFdaily.problemKey(repeatedPick));
    assert.equal(
        CFdaily.problemKey(CFdaily.getDailyProblem(
            problems,
            800,
            '2026-08-10',
            CFdaily.problemKey(firstPick)
        )),
        CFdaily.problemKey(firstPick)
    );
    assert.notEqual(
        CFdaily.assignmentStorageKey(800, '2026-08-10'),
        CFdaily.assignmentStorageKey(900, '2026-08-10')
    );
    assert.notEqual(
        CFdaily.assignmentStorageKey(800, '2026-08-10'),
        CFdaily.assignmentStorageKey(800, '2026-08-11')
    );
    assert.equal(
        CFdaily.assignmentStorageKey(800, '2026-08-10'),
        'potdAssignment:global:2026-08-10:800'
    );
    assert.notEqual(
        CFdaily.completionStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.completionStorageKey('Tourist', 900, '2026-08-10')
    );
    assert.equal(
        CFdaily.completionStorageKey('Tourist', 800, '2026-08-10'),
        'potdCompletion:tourist:2026-08-10:800'
    );
    assert.equal(CFdaily.pickDailyProblem(problems, 1000, '2026-08-10'), null);
    assert.deepEqual(CFdaily.ratings(), Array.from({ length: 28 }, (_, index) => 800 + index * 100));
});

test('the global POTD day changes at midnight UTC', () => {
    assert.equal(CFdaily.dateKey(new Date('2026-08-10T23:59:59Z')), '2026-08-10');
    assert.equal(CFdaily.dateKey(new Date('2026-08-11T00:00:00Z')), '2026-08-11');
    assert.equal(CFdaily.dateKey(new Date('2026-08-10T20:00:00-05:00')), '2026-08-11');
});

test('accepted submissions only complete the POTD on their submission day', async t => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            status: 'OK',
            result: [
                { verdict: 'OK', creationTimeSeconds: 20, problem: problems[0] },
                { verdict: 'OK', creationTimeSeconds: 10, problem: problems[0] },
                { verdict: 'WRONG_ANSWER', problem: problems[1] }
            ]
        })
    });

    assert.deepEqual(
        [...await CFdaily.fetchAcceptedSubmissions('test-handle')],
        [['1-A', [10, 20]]]
    );

    const completionTime = Date.parse('2026-08-10T08:00:00') / 1000;
    const accepted = new Map([['1-A', [completionTime]]]);
    assert.equal(
        CFdaily.acceptedOnDay(
            accepted,
            '1-A',
            CFdaily.dateKey(new Date(completionTime * 1000))
        ),
        completionTime
    );
    assert.equal(CFdaily.acceptedOnDay(accepted, '1-A', '1999-01-01'), undefined);

    assert.deepEqual(CFdaily.submissionStatus(accepted, '1-A', '2026-08-11'), {
        completedAt: undefined,
        solvedBefore: true
    });
    assert.deepEqual(CFdaily.submissionStatus(accepted, '1-A', '2026-08-10'), {
        completedAt: completionTime,
        solvedBefore: false
    });
});
