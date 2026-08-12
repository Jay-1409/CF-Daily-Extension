import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { calculateStreaks, utcDay } from './streaks.js';

const RATINGS = new Set(Array.from({ length: 28 }, (_, index) => 800 + index * 100));
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROBLEM_PATTERN = /^\d+-[A-Za-z0-9]+$/;

function validateCompletion(completion) {
    const day = String(completion?.day || '');
    const rating = Number(completion?.rating);
    const problemKey = String(completion?.problemKey || '');
    const completedAt = Number(completion?.completedAt);

    if (!DAY_PATTERN.test(day) || utcDay(new Date(`${day}T00:00:00Z`)) !== day) {
        throw new Error('Invalid completion day');
    }
    if (!RATINGS.has(rating)) throw new Error('Invalid completion rating');
    if (!PROBLEM_PATTERN.test(problemKey)) throw new Error('Invalid problem key');
    if (!Number.isInteger(completedAt) || completedAt <= 0) {
        throw new Error('Invalid completion timestamp');
    }
    if (utcDay(new Date(completedAt * 1000)) !== day) {
        throw new Error('Completion timestamp must be inside its UTC day');
    }

    return { day, rating, problemKey, completedAt };
}

function publicUser(user) {
    const today = utcDay();
    const currentStreak = user.lastActiveDay && (
        user.lastActiveDay === today
        || Date.parse(`${today}T00:00:00Z`) - Date.parse(`${user.lastActiveDay}T00:00:00Z`) === 86_400_000
    ) ? user.currentStreak || 0 : 0;
    return {
        uid: user.uid,
        displayName: user.displayName || 'CF-Daily user',
        photoURL: user.photoURL || null,
        currentStreak,
        longestStreak: user.longestStreak || 0,
        totalActiveDays: user.totalActiveDays || 0,
        totalCompletions: user.totalCompletions || 0
    };
}

export async function syncUser(decodedToken) {
    const ref = db.collection('users').doc(decodedToken.uid);
    const snapshot = await ref.get();
    await ref.set({
        uid: decodedToken.uid,
        displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'CF-Daily user',
        email: decodedToken.email || null,
        photoURL: decodedToken.picture || null,
        ...snapshot.exists ? {} : {
            currentStreak: 0,
            longestStreak: 0,
            totalActiveDays: 0,
            totalCompletions: 0,
            lastActiveDay: null
        },
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return ref;
}

export async function syncActivity(decodedToken, input) {
    const completions = input.map(validateCompletion);
    if (completions.length > 500) throw new Error('A maximum of 500 completions can be synced');

    const userRef = await syncUser(decodedToken);
    await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(userRef.collection('activity'));
        const activity = new Map(snapshot.docs.map(doc => [doc.id, doc.data().ratings || {}]));

        const changedDays = new Set();
        for (const completion of completions) {
            const ratings = activity.get(completion.day) || {};
            const key = String(completion.rating);
            const existing = ratings[key];
            if (!existing || completion.completedAt < existing.completedAt) {
                ratings[key] = {
                    problemKey: completion.problemKey,
                    completedAt: completion.completedAt
                };
            }
            activity.set(completion.day, ratings);
            changedDays.add(completion.day);
        }

        for (const day of changedDays) {
            const ratings = activity.get(day);
            transaction.set(userRef.collection('activity').doc(day), {
                day,
                ratings,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        const stats = calculateStreaks([...activity.keys()]);
        const lastActiveDay = [...activity.keys()].sort().at(-1) || null;
        const totalCompletions = [...activity.values()]
            .reduce((total, ratings) => total + Object.keys(ratings).length, 0);
        transaction.set(userRef, {
            ...stats,
            lastActiveDay,
            totalCompletions,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    });

    return getUserData(decodedToken.uid);
}

export async function getUserData(uid) {
    const userRef = db.collection('users').doc(uid);
    const [userSnapshot, activitySnapshot] = await Promise.all([
        userRef.get(),
        userRef.collection('activity').orderBy('__name__', 'asc').get()
    ]);
    const user = userSnapshot.data() || { uid };
    const activity = [];

    for (const document of activitySnapshot.docs) {
        const data = document.data();
        for (const [rating, completion] of Object.entries(data.ratings || {})) {
            activity.push({ day: data.day || document.id, rating: Number(rating), ...completion });
        }
    }

    return { user: publicUser(user), activity };
}

export async function getLeaderboard(limit = 10) {
    const snapshot = await db.collection('users').get();
    return snapshot.docs
        .map(document => publicUser(document.data()))
        .sort((left, right) => (
            right.currentStreak - left.currentStreak
            || right.longestStreak - left.longestStreak
            || right.totalCompletions - left.totalCompletions
            || left.displayName.localeCompare(right.displayName)
        ))
        .slice(0, limit)
        .map((user, index) => ({ rank: index + 1, ...user }));
}
