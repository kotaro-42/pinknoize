/**
 * Pink Noise — Web Audio のみ（Max / RNBO 不要）
 * export/ の RNBO 資産は残すがランタイムでは使わない
 */
(function () {
    "use strict";

    var APP_VERSION = "9";
    var APP_READY_KEY = "pink-noise-app-ready-v1";

    var audioContext = null;
    var outputGain = null;
    var noiseSource = null;
    var noiseBuffer = null;

    var isPlaying = false;
    var appReady = false;
    var pendingVolume = 50;

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

    var useTouchPlay = "ontouchstart" in window;
    var busyTimer = null;

    function showError(message) {
        if (loadError) {
            loadError.hidden = false;
            loadError.textContent = message;
        }
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
        offlineHint.classList.toggle("is-ready", !!ready);
    }

    function markAppReady() {
        appReady = true;
        try {
            localStorage.setItem(APP_READY_KEY, "1");
        } catch (e) {}
        setOfflineHint("オフライン利用可（v" + APP_VERSION + " Web Audio）", true);
    }

    function setPatchLoading(loading) {
        if (playToggle) {
            playToggle.disabled = !!loading;
        }
        if (playLabel) {
            playLabel.textContent = loading ? "準備中…" : "再生";
        }
    }

    function beginBusyIndicator() {
        if (busyTimer) {
            clearTimeout(busyTimer);
        }
        busyTimer = setTimeout(function () {
            if (playLabel) {
                playLabel.textContent = "起動中…";
            }
            if (playToggle) {
                playToggle.classList.add("is-busy");
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

    /** Paul Kellet 系 7 段 — ループ用バッファに焼き込み */
    function createPinkNoiseBuffer(ctx) {
        var sampleRate = ctx.sampleRate;
        var length = sampleRate * 3;
        var buffer = ctx.createBuffer(1, length, sampleRate);
        var out = buffer.getChannelData(0);
        var b0 = 0;
        var b1 = 0;
        var b2 = 0;
        var b3 = 0;
        var b4 = 0;
        var b5 = 0;
        var b6 = 0;
        var i;
        var white;

        for (i = 0; i < length; i++) {
            white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.969 * b2 + white * 0.153852;
            b3 = 0.8665 * b3 + white * 0.3104856;
            b4 = 0.55 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.016898;
            b6 = white * 0.115926;
            out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        }
        return buffer;
    }

    function primeAudio() {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
            showError("このブラウザは Web Audio に対応していません。");
            return false;
        }
        if (!audioContext) {
            audioContext = new Ctx();
            outputGain = audioContext.createGain();
            outputGain.gain.value = pendingVolume / 100;
            outputGain.connect(audioContext.destination);
            noiseBuffer = createPinkNoiseBuffer(audioContext);
        }
        try {
            audioContext.resume();
        } catch (e1) {}
        return true;
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
            var p = keeperAudio.play();
            if (p && p.catch) {
                p.catch(function () {});
            }
        } catch (e2) {}
    }

    function stopKeeper() {
        if (keeperAudio) {
            keeperAudio.pause();
            keeperAudio.currentTime = 0;
        }
    }

    function stopNoiseSource() {
        if (noiseSource) {
            try {
                noiseSource.stop();
            } catch (e3) {}
            try {
                noiseSource.disconnect();
            } catch (e4) {}
            noiseSource = null;
        }
    }

    function startPlayback() {
        if (!primeAudio()) {
            return Promise.resolve(false);
        }
        beginBusyIndicator();
        stopNoiseSource();

        noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        noiseSource.connect(outputGain);
        noiseSource.start(0);

        applyVolume(pendingVolume);
        setPlaying(true);
        startKeeperAsync();
        clearBusyIndicator();
        return Promise.resolve(true);
    }

    function stopPlayback() {
        stopNoiseSource();
        stopKeeper();
        setPlaying(false);
    }

    function onPlayAction() {
        if (playToggle && playToggle.disabled) {
            return;
        }
        if (!appReady) {
            showError("まだ準備中です。");
            return;
        }
        if (isPlaying) {
            stopPlayback();
            return;
        }
        startPlayback();
    }

    function onTouchStart() {
        if (!appReady || isPlaying) {
            return;
        }
        primeAudio();
    }

    function onTouchEnd(e) {
        if (!useTouchPlay) {
            return;
        }
        e.preventDefault();
        onPlayAction();
    }

    function boot() {
        setPatchLoading(true);
        setOfflineHint("オフライン準備: 確認中…", false);

        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
            showError("Web Audio 非対応のブラウザです。");
            setOfflineHint("オフライン準備: 未対応", false);
            return;
        }

        var hadReady = false;
        try {
            hadReady = localStorage.getItem(APP_READY_KEY) === "1";
        } catch (e5) {}

        if (hadReady) {
            setOfflineHint("オフライン準備: 保存済み", false);
        }

        setPatchLoading(false);
        markAppReady();
        clearError();
        if (statusHint) {
            statusHint.textContent = "再生するには「再生」をタップしてください";
        }
        if (playLabel) {
            playLabel.textContent = "再生";
        }

        if ("serviceWorker" in navigator) {
            window.addEventListener("load", function () {
                navigator.serviceWorker
                    .register("sw.js?v=" + APP_VERSION)
                    .then(function (reg) {
                        if (reg && reg.update) {
                            reg.update();
                        }
                    })
                    .catch(function () {});
            });
        }

        if (playToggle) {
            playToggle.addEventListener("touchstart", onTouchStart, false);
            if (useTouchPlay) {
                playToggle.addEventListener("touchend", onTouchEnd, false);
            } else {
                playToggle.addEventListener("click", onPlayAction, false);
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
            if (document.visibilityState === "visible" && isPlaying) {
                primeAudio();
            }
        });
    }

    boot();
})();