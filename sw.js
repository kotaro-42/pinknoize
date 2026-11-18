var CACHE_NAME = "pink-noise-v9";

var PRECACHE_URLS = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.json",
    "./js/app.js?v=9",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png",
];

function networkFirst(request) {
    return fetch(request)
        .then(function (response) {
            if (response && response.status === 200) {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, copy);
                });
            }
            return response;
        })
        .catch(function () {
            return caches.match(request, { ignoreSearch: true });
        });
}

function cacheFirst(request) {
    return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) {
            return cached;
        }
        return networkFirst(request);
    });
}

function isHtmlOrAppJs(url) {
    var p = url.pathname;
    return (
        p.indexOf("index.html") >= 0 ||
        p.indexOf("/js/app.js") >= 0 ||
        p === "/pinknoize/" ||
        p === "/pinknoize"
    );
}

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then(function (cache) {
                return cache.addAll(PRECACHE_URLS);
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (key) {
                        return key !== CACHE_NAME;
                    })
                    .map(function (key) {
                        return caches.delete(key);
                    })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener("fetch", function (event) {
    var request = event.request;
    if (request.method !== "GET") {
        return;
    }

    var url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate" || isHtmlOrAppJs(url)) {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(cacheFirst(request));
});