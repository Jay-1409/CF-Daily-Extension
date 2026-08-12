(function () {
    const profileMatch = location.pathname.match(/^\/profile\/([^/?#]+)/);
    const profileLink = document.querySelector('.lang-chooser a[href*="/profile/"]');
    const signedInMatch = profileLink?.getAttribute('href')?.match(/\/profile\/([^/?#]+)/);
    if (!profileMatch || !signedInMatch) return;

    const profileHandle = decodeURIComponent(profileMatch[1]);
    const signedInHandle = decodeURIComponent(signedInMatch[1]);
    if (profileHandle.toLowerCase() !== signedInHandle.toLowerCase()) return;

    function parseDatedRatingKey(key, prefix) {
        if (!key.startsWith(prefix)) return null;
        const suffix = key.slice(prefix.length);
        const separator = suffix.lastIndexOf(':');
        const day = suffix.slice(0, separator);
        const rating = Number(suffix.slice(separator + 1));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !CFDaily.ratings().includes(rating)) return null;
        return { day, rating };
    }

    function createPanel(records, savedView) {
        const panel = document.createElement('section');
        panel.className = 'roundbox cf-daily-activity';

        const toolbar = document.createElement('div');
        toolbar.className = 'cf-daily-activity-toolbar';

        const heading = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = 'CF-Daily Activity';
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Daily POTDs completed in the last 365 days';
        heading.append(title, subtitle);

        const viewSelect = document.createElement('select');
        viewSelect.setAttribute('aria-label', 'Choose a CF-Daily activity heatmap');
        const combinedOption = document.createElement('option');
        combinedOption.value = 'combined';
        combinedOption.textContent = 'Combined ratings';
        viewSelect.append(combinedOption);
        for (const rating of CFDaily.ratings()) {
            const option = document.createElement('option');
            option.value = String(rating);
            option.textContent = `${rating} rating`;
            viewSelect.append(option);
        }
        viewSelect.value = savedView === 'combined' || CFDaily.ratings().includes(Number(savedView))
            ? String(savedView)
            : 'combined';
        toolbar.append(heading, viewSelect);

        const summary = document.createElement('p');
        summary.className = 'cf-daily-activity-summary';
        const grid = document.createElement('div');
        grid.className = 'cf-daily-heatmap-grid';
        grid.setAttribute('role', 'img');

        const legend = document.createElement('div');
        legend.className = 'cf-daily-heatmap-legend';
        legend.append('Less');
        for (let level = 0; level <= 4; level += 1) {
            const cell = document.createElement('span');
            cell.className = `cf-daily-heatmap-cell level-${level}`;
            legend.append(cell);
        }
        legend.append('More');

        function render(view) {
            grid.replaceChildren();
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const firstDay = new Date(today);
            firstDay.setUTCDate(today.getUTCDate() - 364);
            const visibleDays = new Set();

            for (let index = 0; index < firstDay.getUTCDay(); index += 1) {
                const spacer = document.createElement('span');
                spacer.className = 'cf-daily-heatmap-spacer';
                grid.append(spacer);
            }

            const counts = new Map();
            for (const record of records) {
                if (view !== 'combined' && record.rating !== Number(view)) continue;
                counts.set(record.day, (counts.get(record.day) || 0) + 1);
            }

            for (let offset = 0; offset < 365; offset += 1) {
                const date = new Date(firstDay);
                date.setUTCDate(firstDay.getUTCDate() + offset);
                const day = CFDaily.dateKey(date);
                const count = counts.get(day) || 0;
                visibleDays.add(day);

                const cell = document.createElement('span');
                const level = count === 0 ? 0 : view === 'combined' ? Math.min(4, count) : 4;
                cell.className = `cf-daily-heatmap-cell level-${level}`;
                const readableDate = date.toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
                });
                cell.title = view === 'combined'
                    ? `${readableDate}: ${count} POTD${count === 1 ? '' : 's'} completed`
                    : `${readableDate}: ${count ? `${view} POTD completed` : 'No POTD completed'}`;
                grid.append(cell);
            }

            const visibleRecords = records.filter(record => (
                visibleDays.has(record.day) && (view === 'combined' || record.rating === Number(view))
            ));
            const activeDays = new Set(visibleRecords.map(record => record.day)).size;
            summary.textContent = `${visibleRecords.length} POTD${visibleRecords.length === 1 ? '' : 's'} across ${activeDays} active day${activeDays === 1 ? '' : 's'}`;
            grid.setAttribute('aria-label', summary.textContent);
        }

        viewSelect.addEventListener('change', async () => {
            await chrome.storage.local.set({ heatmapView: viewSelect.value });
            render(viewSelect.value);
        });

        panel.append(toolbar, summary, grid, legend);
        render(viewSelect.value);
        return panel;
    }

    async function initialise() {
        const pageContent = document.getElementById('pageContent');
        if (!pageContent) return;

        await chrome.storage.local.set({ name: signedInHandle });
        const stored = await chrome.storage.local.get(null);
        const assignmentPrefix = CFDaily.assignmentStoragePrefix();
        const completionPrefix = CFDaily.completionStoragePrefix(signedInHandle);
        const updates = {};

        try {
            const accepted = await CFDaily.fetchAcceptedSubmissions(signedInHandle);
            for (const [key, problem] of Object.entries(stored)) {
                const assignment = parseDatedRatingKey(key, assignmentPrefix);
                if (!assignment) continue;

                const completedAt = CFDaily.acceptedOnDay(accepted, problem, assignment.day);
                if (completedAt === undefined) continue;

                const completionKey = CFDaily.completionStorageKey(
                    signedInHandle,
                    assignment.rating,
                    assignment.day
                );
                if (!stored[completionKey]) {
                    updates[completionKey] = {
                        problemKey: problem,
                        completedAt
                    };
                }
            }
            if (Object.keys(updates).length) await chrome.storage.local.set(updates);
        } catch (error) {
            console.error(error);
        }

        const activity = { ...stored, ...updates };
        const records = Object.keys(activity)
            .map(key => parseDatedRatingKey(key, completionPrefix))
            .filter(Boolean);
        pageContent.append(createPanel(records, stored.heatmapView || 'combined'));
    }

    initialise();
}());
