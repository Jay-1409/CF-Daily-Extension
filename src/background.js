importScripts('config.js', 'cloud.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'cf-daily-sign-in') return false;

    CFDailyCloud.completeSignIn()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error) => {
            console.error(error);
            sendResponse({ ok: false, error: error.message });
        });

    return true;
});
