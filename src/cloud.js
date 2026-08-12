(function (root) {
    const SESSION_KEY = 'supabaseSession';
    const config = root.CFDailyConfig || {};

    function supabaseUrl() {
        return config.supabaseUrl.replace(/\/$/, '');
    }

    function configured() {
        return Boolean(config.supabaseUrl && config.supabasePublishableKey && config.apiBaseUrl);
    }

    function authHeaders() {
        return {
            apikey: config.supabasePublishableKey,
            'Content-Type': 'application/json'
        };
    }

    function displaySession(result) {
        const metadata = result.user?.user_metadata || {};
        return {
            accessToken: result.access_token,
            refreshToken: result.refresh_token,
            expiresAt: Date.now() + Number(result.expires_in) * 1000,
            uid: result.user?.id,
            displayName: metadata.full_name || result.user?.email?.split('@')[0] || 'CF-Daily user',
            email: result.user?.email || '',
            photoURL: metadata.avatar_url || ''
        };
    }

    async function authRequest(path, body) {
        const response = await fetch(`${supabaseUrl()}/auth/v1/${path}`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.msg || result.error_description || result.message || 'Supabase authentication failed');
        return result;
    }

    async function refreshSession(current) {
        const result = await authRequest('token?grant_type=refresh_token', {
            refresh_token: current.refreshToken
        });
        const refreshed = displaySession(result);
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
        if (!configured()) throw new Error('Add your Supabase settings in src/config.js first');
        const redirectTo = chrome.identity.getRedirectURL('supabase');
        const authorizeUrl = new URL(`${supabaseUrl()}/auth/v1/authorize`);
        authorizeUrl.searchParams.set('provider', 'google');
        authorizeUrl.searchParams.set('redirect_to', redirectTo);

        const callbackUrl = await chrome.identity.launchWebAuthFlow({
            url: authorizeUrl.href,
            interactive: true
        });
        if (!callbackUrl) throw new Error('Google sign-in was cancelled');

        const fragment = new URL(callbackUrl).hash.slice(1);
        const result = Object.fromEntries(new URLSearchParams(fragment));
        if (result.error_description) throw new Error(result.error_description);
        if (!result.access_token || !result.refresh_token) throw new Error('Supabase did not return a session');

        const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
            headers: {
                apikey: config.supabasePublishableKey,
                Authorization: `Bearer ${result.access_token}`
            }
        });
        const user = await response.json();
        if (!response.ok) throw new Error(user.message || 'Could not load Supabase user');
        const signedIn = displaySession({ ...result, user, expires_in: result.expires_in });
        await chrome.storage.local.set({ [SESSION_KEY]: signedIn });
        return signedIn;
    }

    async function signOut() {
        const current = await session();
        if (current) {
            await fetch(`${supabaseUrl()}/auth/v1/logout`, {
                method: 'POST',
                headers: {
                    apikey: config.supabasePublishableKey,
                    Authorization: `Bearer ${current.accessToken}`
                }
            }).catch(console.error);
        }
        await chrome.storage.local.remove(SESSION_KEY);
    }

    async function request(path, options = {}) {
        const current = await session();
        if (!current) return null;
        const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${current.accessToken}`,
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
