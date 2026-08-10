const assert = require('node:assert/strict');
const CFdaily = require('../src/potd.js');

const problems = [
    { contestId: 1, index: 'A', name: 'Easy one', rating: 800 },
    { contestId: 2, index: 'A', name: 'Easy two', rating: 800 },
    { contestId: 3, index: 'B', name: 'Harder', rating: 900 }
];

async function run() {
    const firstPick = CFdaily.pickDailyProblem(problems, 800, '2026-08-10');
    const repeatedPick = CFdaily.pickDailyProblem([...problems].reverse(), 800, '2026-08-10');

    assert.equal(firstPick.rating, 800, 'selects only the requested rating');
    assert.equal(
        CFdaily.problemKey(firstPick),
        CFdaily.problemKey(repeatedPick),
        'selection does not depend on Codeforces API ordering'
    );

    const solved = new Set([CFdaily.problemKey(firstPick)]);
    const unsolvedPick = CFdaily.pickDailyProblem(problems, 800, '2026-08-10', solved);
    assert.notEqual(CFdaily.problemKey(unsolvedPick), CFdaily.problemKey(firstPick), 'excludes solved problems');

    const fixedPick = CFdaily.getDailyProblem(
        problems,
        800,
        '2026-08-10',
        solved,
        CFdaily.problemKey(firstPick)
    );
    assert.equal(
        CFdaily.problemKey(fixedPick),
        CFdaily.problemKey(firstPick),
        'keeps an assigned POTD after it is solved'
    );

    assert.notEqual(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('Tourist', 900, '2026-08-10'),
        'ratings have independent assignments'
    );
    assert.notEqual(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-11'),
        'dates have independent assignments'
    );
    assert.equal(
        CFdaily.assignmentStorageKey('Tourist', 800, '2026-08-10'),
        CFdaily.assignmentStorageKey('tourist', 800, '2026-08-10'),
        'handle casing cannot create duplicate assignments'
    );
    assert.equal(CFdaily.pickDailyProblem(problems, 1000, '2026-08-10'), null, 'returns null for an empty rating');
    assert.deepEqual(CFdaily.ratings(), Array.from({ length: 28 }, (_, index) => 800 + index * 100));

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
    const acceptedProblems = await CFdaily.fetchSolvedProblemKeys('test-handle');
    assert.deepEqual([...acceptedProblems], ['1-A'], 'only accepted submissions count as solved');

    console.log('POTD selection tests passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
