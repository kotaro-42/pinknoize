/* eslint-disable no-restricted-globals */
var CACHE_NAME = "pink-noise-v7";

var PRECACHE_URLS = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.json",
    "./js/app.js",
    "./js/rnbo.min.js",
    "./export/Pinknoise.json",
    "./export/dependencies.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/apple-touch-icon.png",
];

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

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(function (cached) {
            var fetchPromise = fetch(request)
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
                    if (cached) {
                        return cached;
                    }
                    if (request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return cached;
                });

            return cached || fetchPromise;
        })
    );
});