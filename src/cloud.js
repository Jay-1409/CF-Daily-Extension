(function (root) {
    const SESSION_KEY = 'firebaseSession';
    const config = root.CFDailyConfig || {};

    function configured() {
        return Boolean(config.firebaseApiKey && config.apiBaseUrl);
    }

    function identityToken(interactive) {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive }, token => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve(typeof token === 'string' ? token : token?.token);
            });
        });
    }

    async function exchangeGoogleToken(accessToken) {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(config.firebaseApiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestUri: chrome.identity.getRedirectURL(),
                    postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
                    returnIdpCredential: true,
                    returnSecureToken: true
                })
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Firebase sign-in failed');

        return {
            idToken: result.idToken,
            refreshToken: result.refreshToken,
            expiresAt: Date.now() + Number(result.expiresIn) * 1000,
            uid: result.localId,
            displayName: result.displayName || result.email?.split('@')[0] || 'CF-Daily user',
            email: result.email || '',
            photoURL: result.photoUrl || ''
        };
    }

    async function refreshSession(session) {
        const response = await fetch(
            `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.firebaseApiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: session.refreshToken
                })
            }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Firebase session refresh failed');

        const refreshed = {
            ...session,
            idToken: result.id_token,
            refreshToken: result.refresh_token,
            expiresAt: Date.now() + Number(result.expires_in) * 1000
        };
        await chrome.storage.local.set({ [SESSION_KEY]: refreshed });
        return refreshed;
    }

    async function session() {
        if (!configured()) return null;
        const stored = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY];
        if (!stored) return null;
        if (stored.expiresAt > Date.now() + 60_000) return stored;

        try {
            return await refreshSession(stored);
        } catch (error) {
            await chrome.storage.local.remove(SESSION_KEY);
            throw error;
        }
    }

    async function signIn() {
        if (!configured()) throw new Error('Add your Firebase API key in src/config.js first');
        const accessToken = await identityToken(true);
        const firebaseSession = await exchangeGoogleToken(accessToken);
        await chrome.storage.local.set({ [SESSION_KEY]: firebaseSession });
        return firebaseSession;
    }

    async function signOut() {
        await chrome.storage.local.remove(SESSION_KEY);
        if (chrome.identity.clearAllCachedAuthTokens) {
            await chrome.identity.clearAllCachedAuthTokens();
        }
    }

    async function request(path, options = {}) {
        const current = await session();
        if (!current) return null;
        const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${current.idToken}`,
                ...options.headers
            }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Server request failed (${response.status})`);
        return result;
    }

    function localCompletions(stored, handle) {
        const prefix = CFDaily.completionStoragePrefix(handle);
        return Object.entries(stored).flatMap(([key, value]) => {
            if (!key.startsWith(prefix)) return [];
            const suffix = key.slice(prefix.length);
            const separator = suffix.lastIndexOf(':');
            const day = suffix.slice(0, separator);
            const rating = Number(suffix.slice(separator + 1));
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !CFDaily.ratings().includes(rating)) return [];
            if (!value?.problemKey || !Number.isInteger(value.completedAt)) return [];
            return [{ day, rating, problemKey: value.problemKey, completedAt: value.completedAt }];
        });
    }

    async function syncLocalActivity(handle) {
        if (!await session()) return null;
        const stored = await chrome.storage.local.get(null);
        return request('/api/activity/sync', {
            method: 'POST',
            body: JSON.stringify({ completions: localCompletions(stored, handle) })
        });
    }

    async function dashboard(handle) {
        const me = await syncLocalActivity(handle);
        if (!me) return null;
        const leaderboard = await request('/api/leaderboard?limit=5');
        return { ...me, leaderboard: leaderboard.leaderboard };
    }

    root.CFDailyCloud = {
        configured,
        dashboard,
        session,
        signIn,
        signOut,
        syncLocalActivity
    };
}(typeof globalThis !== 'undefined' ? globalThis : this));
