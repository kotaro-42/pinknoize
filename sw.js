const CACHE_NAME = "pink-noise-v4";

const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.json",
    "./js/app.js?v=4",
    "./js/offline.js",
    "./js/session.js",
    "./js/guardrails.js",
    "./js/rnbo.min.js",
    "./export/Pinknoise.json",
    "./export/dependencies.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png",
];

/** オンライン時のみネットワーク優先（更新しやすい） */
function preferNetworkWhenOnline(url) {
    const target = url.pathname + url.search;
    return (
        target.includes("/js/app.js") ||
        target.includes("/js/offline.js") ||
        target.includes("/js/session.js") ||
        url.pathname.endsWith("/sw.js")
    );
}

async function cacheMatchAny(cache, request) {
    let match = await cache.match(request);
    if (match) {
        return match;
    }
    match = await cache.match(request, { ignoreSearch: true });
    if (match) {
        return match;
    }
    return caches.match(request, { ignoreSearch: true });
}

async function serveOfflineFirst(request) {
    const cached =
        (await caches.match(request)) ||
        (await caches.match(request, { ignoreSearch: true }));
    if (cached) {
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const index = await caches.match("./index.html");
        if (index && request.mode === "navigate") {
            return index;
        }
        return Response.error();
    }
}

async function serveOnline(request, url) {
    const cache = await caches.open(CACHE_NAME);
    const useNetworkFirst = preferNetworkWhenOnline(url) || request.mode === "navigate";

    if (useNetworkFirst) {
        try {
            const response = await fetch(request);
            if (response && response.status === 200) {
                cache.put(request, response.clone());
            }
            return response;
        } catch {
            const fallback = await cacheMatchAny(cache, request);
            if (fallback) {
                return fallback;
            }
            if (request.mode === "navigate") {
                return (await caches.match("./index.html")) || Response.error();
            }
            throw new Error("offline");
        }
    }

    const cached = await cacheMatchAny(cache, request);
    if (cached) {
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return Response.error();
    }
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            serveOnline(request, url).catch(() =>
                serveOfflineFirst(request)
            )
        );
        return;
    }

    event.respondWith(
        serveOnline(request, url).catch(() => serveOfflineFirst(request))
    );
});