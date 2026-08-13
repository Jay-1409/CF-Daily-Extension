import { supabase } from './supabase.js';
import { rankProfiles, rankRatingProfiles } from './leaderboard.js';
import { utcDay } from './streaks.js';

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

    return { day, rating, problem_key: problemKey, completed_at: completedAt };
}

function publicUser(profile) {
    const today = utcDay();
    const currentStreak = profile.last_active_day && (
        profile.last_active_day === today
        || Date.parse(`${today}T00:00:00Z`) - Date.parse(`${profile.last_active_day}T00:00:00Z`) === 86_400_000
    ) ? profile.current_streak || 0 : 0;

    return {
        uid: profile.id,
        displayName: profile.display_name || 'CF-Daily user',
        photoURL: profile.photo_url || null,
        currentStreak,
        longestStreak: profile.longest_streak || 0,
        totalActiveDays: profile.total_active_days || 0,
        totalCompletions: profile.total_completions || 0
    };
}

function check(result) {
    if (result.error) throw result.error;
    return result.data;
}

export async function syncUser(user) {
    check(await supabase.from('profiles').upsert({
        id: user.id,
        display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'CF-Daily user',
        photo_url: user.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString()
    }, { onConflict: 'id' }));
}

export async function syncActivity(user, input) {
    const completions = input.map(validateCompletion);
    if (completions.length > 500) throw new Error('A maximum of 500 completions can be synced');

    await syncUser(user);
    check(await supabase.rpc('sync_activity', {
        p_user_id: user.id,
        p_completions: completions
    }));
    return getUserData(user.id);
}

export async function getUserData(uid) {
    const [profileResult, activityResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('activity').select('day, rating, problem_key, completed_at')
            .eq('user_id', uid).order('day', { ascending: true })
    ]);
    const profile = check(profileResult);
    const activity = check(activityResult).map(completion => ({
        day: completion.day,
        rating: completion.rating,
        problemKey: completion.problem_key,
        completedAt: completion.completed_at
    }));
    return { user: publicUser(profile), activity };
}

export async function getLeaderboard(limit = 10, metric = 'streak') {
    const profiles = check(await supabase.from('profiles').select('*')).map(publicUser);
    return rankProfiles(profiles, metric)
        .slice(0, limit)
        .map((user, index) => ({ rank: index + 1, ...user }));
}

export async function getRatingLeaderboard(rating, limit = 10) {
    const [profilesResult, activityResult] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('activity').select('user_id, completed_at').eq('rating', rating)
    ]);
    const profiles = check(profilesResult).map(publicUser);
    return rankRatingProfiles(profiles, check(activityResult))
        .slice(0, limit)
        .map((user, index) => ({ rank: index + 1, ...user }));
}
