import express from 'express';
import { auth } from './firebase.js';
import { getLeaderboard, getUserData, syncActivity, syncUser } from './activity.js';

export const app = express();

app.use(express.json({ limit: '128kb' }));
app.use((request, response, next) => {
    const origin = request.get('origin');
    if (origin?.startsWith('chrome-extension://') || origin?.startsWith('moz-extension://')) {
        response.set('Access-Control-Allow-Origin', origin);
        response.set('Vary', 'Origin');
        response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
});

async function requireAuth(request, response, next) {
    const match = request.get('authorization')?.match(/^Bearer (.+)$/);
    if (!match) return response.status(401).json({ error: 'Authentication required' });

    try {
        request.user = await auth.verifyIdToken(match[1]);
        next();
    } catch {
        response.status(401).json({ error: 'Invalid or expired Firebase token' });
    }
}

app.get('/health', (request, response) => response.json({ ok: true }));

app.post('/api/session', requireAuth, async (request, response, next) => {
    try {
        await syncUser(request.user);
        response.json(await getUserData(request.user.uid));
    } catch (error) {
        next(error);
    }
});

app.get('/api/me', requireAuth, async (request, response, next) => {
    try {
        await syncUser(request.user);
        response.json(await getUserData(request.user.uid));
    } catch (error) {
        next(error);
    }
});

app.post('/api/activity/sync', requireAuth, async (request, response, next) => {
    try {
        if (!Array.isArray(request.body?.completions)) {
            return response.status(400).json({ error: 'completions must be an array' });
        }
        response.json(await syncActivity(request.user, request.body.completions));
    } catch (error) {
        if (error.message.startsWith('Invalid') || error.message.startsWith('A maximum')) {
            return response.status(400).json({ error: error.message });
        }
        next(error);
    }
});

app.get('/api/leaderboard', requireAuth, async (request, response, next) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));
        response.json({ leaderboard: await getLeaderboard(limit) });
    } catch (error) {
        next(error);
    }
});

app.use((error, request, response, next) => {
    console.error(error);
    if (response.headersSent) return next(error);
    response.status(500).json({ error: 'Internal server error' });
});
