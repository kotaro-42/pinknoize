/* Pink Noise — 単一スクリプト（iOS 13.4+ 想定、ES5 互換） */
(function () {
    "use strict";

    var PATCH_PATH = "export/Pinknoise.json";
    var PATCH_LS_KEY = "pink-noise-patch-v1";

    var audioContext = null;
    var outputGain = null;
    var device = null;
    var patchVolumeParam = null;
    var patcherCache = null;
    var audioInitPromise = null;
    var busyTimer = null;

    var isPlaying = false;
    var patchReady = false;
    var pendingVolume = 50;
    var useTouchPlay = "ontouchstart" in window;

    var keeperAudio = null;
    var SILENT_WAV =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA==";

    var playToggle = document.getElementById("play-toggle");
    var playLabel = document.getElementById("play-label");
    var volumeSlider = document.getElementById("volume-slider");
    var volumeReadout = document.getElementById("volume-readout");
    var statusHint = document.getElementById("status-hint");
    var offlineHint = document.getElementById("offline-hint");
    var loadError = document.getElementById("load-error");
    var appEl = document.getElementById("app");

    function assetUrl(relativePath) {
        var link = document.createElement("a");
        link.href = relativePath;
        return link.href;
    }

    function errMsg(err) {
        return err && err.message ? err.message : String(err);
    }

    function showError(message) {
        if (loadError) {
            loadError.hidden = false;
            loadError.textContent = message;
        }
        console.error(message);
    }

    function clearError() {
        if (loadError) {
            loadError.hidden = true;
            loadError.textContent = "";
        }
    }

    function setOfflineHint(text, ready) {
        if (!offlineHint) {
            return;
        }
        offlineHint.textContent = text;
        if (ready) {
            offlineHint.classList.add("is-ready");
        } else {
            offlineHint.classList.remove("is-ready");
        }
    }

    function savePatchText(text) {
        try {
            localStorage.setItem(PATCH_LS_KEY, text);
            return true;
        } catch (e) {
            return false;
        }
    }

    function loadPatchText() {
        try {
            return localStorage.getItem(PATCH_LS_KEY);
        } catch (e) {
            return null;
        }
    }

    function fetchPatcher() {
        return fetch(assetUrl(PATCH_PATH))
            .then(function (res) {
                if (!res.ok) {
                    throw new Error("HTTP " + res.status);
                }
                return res.text();
            })
            .then(function (text) {
                savePatchText(text);
                return JSON.parse(text);
            })
            .catch(function (netErr) {
                var saved = loadPatchText();
                if (saved) {
                    return JSON.parse(saved);
                }
                throw netErr;
            });
    }

    function setPatchLoading(loading) {
        if (playToggle) {
            playToggle.disabled = !!loading;
        }
        if (playLabel) {
            playLabel.textContent = loading ? "読み込み中…" : "再生";
        }
    }

    function beginBusyIndicator() {
        clearBusyIndicator();
        busyTimer = setTimeout(function () {
            if (playToggle) {
                playToggle.classList.add("is-busy");
            }
            if (playLabel) {
                playLabel.textContent = "起動中…";
            }
        }, 350);
    }

    function clearBusyIndicator() {
        if (busyTimer) {
            clearTimeout(busyTimer);
            busyTimer = null;
        }
        if (playToggle) {
            playToggle.classList.remove("is-busy");
        }
        if (playLabel && !isPlaying) {
            playLabel.textContent = "再生";
        }
    }

    function setPlaying(playing) {
        isPlaying = playing;
        if (appEl) {
            appEl.classList.toggle("is-playing", playing);
        }
        if (playToggle) {
            playToggle.setAttribute("aria-pressed", playing ? "true" : "false");
        }
        if (playLabel) {
            playLabel.textContent = playing ? "停止" : "再生";
        }
        if (statusHint) {
            statusHint.textContent = playing
                ? "再生中"
                : "再生するには「再生」をタップしてください";
        }
    }

    function applyVolume(percent) {
        pendingVolume = Math.max(0, Math.min(100, percent));
        if (volumeReadout) {
            volumeReadout.textContent = Math.round(pendingVolume) + "%";
            volumeReadout.classList.toggle("is-muted", pendingVolume === 0);
        }
        if (volumeSlider) {
            volumeSlider.setAttribute("aria-valuenow", String(Math.round(pendingVolume)));
        }
        if (outputGain && audioContext) {
            outputGain.gain.setTargetAtTime(
                pendingVolume / 100,
                audioContext.currentTime,
                0.02
            );
        }
    }

    function getVolumeParam() {
        if (!device || device.numParameters < 1) {
            return null;
        }
        return device.parameters[0];
    }

    function primeAudio() {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!audioContext) {
            audioContext = new Ctx();
            outputGain = audioContext.createGain();
            outputGain.gain.value = pendingVolume / 100;
            outputGain.connect(audioContext.destination);
        }
        try {
            audioContext.resume();
        } catch (e1) {}
    }

    function startKeeperAsync() {
        try {
            if (!keeperAudio) {
                keeperAudio = document.createElement("audio");
                keeperAudio.src = SILENT_WAV;
                keeperAudio.loop = true;
                keeperAudio.setAttribute("playsinline", "");
                keeperAudio.setAttribute("webkit-playsinline", "");
                keeperAudio.style.display = "none";
                document.body.appendChild(keeperAudio);
            }
            var playP = keeperAudio.play();
            if (playP && playP.catch) {
                playP.catch(function () {});
            }
        } catch (e2) {}
    }

    function stopKeeper() {
        if (!keeperAudio) {
            return;
        }
        keeperAudio.pause();
        keeperAudio.currentTime = 0;
    }

    /** dependencies.json は空のため fetch せず即 createDevice（iOS のジェスチャ維持） */
    function buildEngine() {
        if (device) {
            return Promise.resolve(true);
        }
        if (!window.RNBO || !audioContext || !outputGain || !patcherCache) {
            return Promise.resolve(false);
        }

        return RNBO.createDevice({
            context: audioContext,
            patcher: patcherCache,
        })
            .then(function (dev) {
                device = dev;
                device.node.connect(outputGain);
                patchVolumeParam = getVolumeParam();
                if (patchVolumeParam) {
                    patchVolumeParam.value = 0;
                }
                applyVolume(pendingVolume);
                return true;
            })
            .catch(function (err) {
                showError("RNBO の起動に失敗: " + errMsg(err));
                device = null;
                audioInitPromise = null;
                return false;
            });
    }

    function ensureEnginePromise() {
        if (device) {
            return Promise.resolve(true);
        }
        if (!audioInitPromise) {
            audioInitPromise = buildEngine();
        }
        return audioInitPromise;
    }

    function beginEngineFromGesture() {
        if (!patchReady || isPlaying) {
            return;
        }
        primeAudio();
        if (!device && !audioInitPromise) {
            audioInitPromise = buildEngine();
        }
    }

    function startPlayback() {
        primeAudio();
        if (device) {
            var volFast = patchVolumeParam || getVolumeParam();
            if (volFast) {
                volFast.value = 1;
                patchVolumeParam = volFast;
            }
            applyVolume(pendingVolume);
            setPlaying(true);
            startKeeperAsync();
            return Promise.resolve(true);
        }

        beginBusyIndicator();
        return ensureEnginePromise().then(function (ok) {
            if (!ok || !device || !audioContext) {
                return false;
            }
            try {
                audioContext.resume();
            } catch (e3) {}

            var vol = patchVolumeParam || getVolumeParam();
            if (vol) {
                vol.value = 1;
                patchVolumeParam = vol;
            }
            applyVolume(pendingVolume);
            setPlaying(true);
            startKeeperAsync();
            return true;
        });
    }

    function stopPlayback() {
        if (patchVolumeParam) {
            patchVolumeParam.value = 0;
        }
        stopKeeper();
        setPlaying(false);
    }

    function onPlayAction() {
        if (playToggle && playToggle.disabled) {
            return;
        }
        if (isPlaying) {
            stopPlayback();
            clearBusyIndicator();
            return;
        }
        if (!patchReady) {
            showError("まだ読み込み中です。");
            return;
        }

        startPlayback()
            .then(function (started) {
                if (!started) {
                    setPlaying(false);
                }
            })
            .catch(function () {
                setPlaying(false);
            })
            .then(function () {
                clearBusyIndicator();
            });
    }

    function onTouchStart(e) {
        beginEngineFromGesture();
    }

    function onTouchEnd(e) {
        if (!useTouchPlay) {
            return;
        }
        e.preventDefault();
        onPlayAction();
    }

    function onMouseClick() {
        if (useTouchPlay) {
            return;
        }
        onPlayAction();
    }

    function boot() {
        setPatchLoading(true);
        setOfflineHint("オフライン準備: 読み込み中…", false);

        if (!window.RNBO) {
            showError("音声ライブラリが読み込めていません（iOS 13.4 以上を推奨）。");
            setOfflineHint("オフライン準備: ライブラリ未読込", false);
            return;
        }

        fetchPatcher()
            .then(function (patcher) {
                patcherCache = patcher;
                patchReady = true;
                clearError();
                setPatchLoading(false);
                setOfflineHint("オフライン利用可", true);
                if (statusHint) {
                    statusHint.textContent =
                        "再生をタップ（初回だけ十数秒かかることがあります）";
                }
            })
            .catch(function () {
                showError("パッチ読み込み失敗。Wi-Fi で開き直してください。");
                setOfflineHint("オフライン準備: 失敗", false);
            });

        if ("serviceWorker" in navigator) {
            window.addEventListener("load", function () {
                navigator.serviceWorker.register("sw.js").catch(function () {});
            });
        }

        if (playToggle) {
            playToggle.addEventListener("touchstart", onTouchStart, false);
            if (useTouchPlay) {
                playToggle.addEventListener("touchend", onTouchEnd, false);
            } else {
                playToggle.addEventListener("click", onMouseClick, false);
            }
        }

        if (volumeSlider) {
            volumeSlider.addEventListener("input", function () {
                applyVolume(Number(volumeSlider.value));
            });
        }

        pendingVolume = volumeSlider ? Number(volumeSlider.value) : 50;
        if (isNaN(pendingVolume)) {
            pendingVolume = 50;
        }
        applyVolume(pendingVolume);

        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible" && isPlaying && audioContext) {
                primeAudio();
            }
        });
    }

    boot();
})();