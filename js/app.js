const PATCH_EXPORT_URL = "export/Pinknoise.json";
const RNBO_PATCH_VOLUME_PARAM = "volume";

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {GainNode | null} */
let outputGain = null;
/** @type {import('rnbo').Device | null} */
let device = null;
/** @type {import('rnbo').Parameter | null} */
let patchVolumeParam = null;
/** @type {object | null} */
let patcherCache = null;
/** @type {Promise<boolean> | null} */
let audioInitPromise = null;

let isPlaying = false;
let patchReady = false;
let offlineReady = false;
let pendingVolume = 50;
let engineReady = false;

const appEl = document.getElementById("app");
const playToggle = document.getElementById("play-toggle");
const playLabel = document.getElementById("play-label");
const volumeSlider = document.getElementById("volume-slider");
const volumeReadout = document.getElementById("volume-readout");
const statusHint = document.getElementById("status-hint");
const offlineHint = document.getElementById("offline-hint");
const loadError = document.getElementById("load-error");

function resolveAssetUrl(relativePath) {
    return new URL(relativePath, document.baseURI).href;
}

function showLoadError(message) {
    if (loadError) {
        loadError.hidden = false;
        loadError.textContent = message;
    }
    console.error(message);
}

function clearLoadError() {
    if (loadError) {
        loadError.hidden = true;
        loadError.textContent = "";
    }
}

function setOfflineReady(ready, source) {
    offlineReady = ready;
    if (offlineHint) {
        if (!ready) {
            offlineHint.textContent = "オフライン準備: 未完了";
            offlineHint.classList.remove("is-ready");
        } else {
            const via = source === "idb" ? "（保存済みデータ）" : "";
            offlineHint.textContent = `オフライン利用可${via}`;
            offlineHint.classList.add("is-ready");
        }
    }
}

function setPlayBusy(busy) {
    if (playToggle) {
        playToggle.classList.toggle("is-busy", busy);
        playToggle.setAttribute("aria-busy", busy ? "true" : "false");
    }
    if (playLabel) {
        if (busy) {
            playLabel.textContent = "起動中…";
        } else if (!isPlaying) {
            playLabel.textContent = patchReady ? "再生" : "読み込み中…";
        } else {
            playLabel.textContent = "停止";
        }
    }
}

function setPatchLoading(loading) {
    if (playToggle) {
        playToggle.disabled = loading;
    }
    if (playLabel && loading) {
        playLabel.textContent = "読み込み中…";
    }
}

function setUiPlaying(playing) {
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
            : patchReady
              ? "再生するには「再生」をタップしてください"
              : "読み込み中…";
    }
    PlaybackSession.setMediaPlaybackState(playing);
}

function applyOutputGain(percent) {
    pendingVolume = Math.max(0, Math.min(100, percent));
    if (volumeReadout) {
        volumeReadout.textContent = `${Math.round(pendingVolume)}%`;
        volumeReadout.classList.toggle("is-muted", pendingVolume === 0);
    }
    if (volumeSlider) {
        volumeSlider.setAttribute("aria-valuenow", String(Math.round(pendingVolume)));
    }
    if (!outputGain || !audioContext) {
        return;
    }
    const linear = pendingVolume / 100;
    outputGain.gain.setTargetAtTime(linear, audioContext.currentTime, 0.02);
}

function getPatchVolumeParam() {
    if (!device) {
        return null;
    }
    if (device.numParameters > 0) {
        return device.parameters[0];
    }
    return (
        device.parameters.find((p) => p.id === RNBO_PATCH_VOLUME_PARAM) ||
        device.parameters.find((p) => p.name === RNBO_PATCH_VOLUME_PARAM) ||
        null
    );
}

function primeAudioContextFromGesture() {
    const WAContext = window.AudioContext || window.webkitAudioContext;
    if (!audioContext) {
        audioContext = new WAContext();
        outputGain = audioContext.createGain();
        outputGain.gain.value = pendingVolume / 100;
        outputGain.connect(audioContext.destination);
    }
    const resumeResult = audioContext.resume();
    if (resumeResult && typeof resumeResult.catch === "function") {
        resumeResult.catch((err) => console.warn("AudioContext resume:", err));
    }
    PlaybackSession.requestPlaybackAudioSession();
}

function startAudioEngineInitFromGesture() {
    if (device || audioInitPromise || !patchReady || !patcherCache) {
        return;
    }
    primeAudioContextFromGesture();
    audioInitPromise = buildAudioEngine();
}

async function buildAudioEngine() {
    clearLoadError();

    if (!window.RNBO) {
        showLoadError(
            "RNBO ライブラリが見つかりません。オフラインの場合は一度オンラインで開いてください。"
        );
        return false;
    }

    if (!audioContext || !outputGain) {
        showLoadError("音声の初期化に失敗しました。");
        return false;
    }

    let dependencies = [];
    try {
        const dependenciesResponse = await fetch(resolveAssetUrl("export/dependencies.json"));
        dependencies = await dependenciesResponse.json();
        dependencies = dependencies.map((d) =>
            d.file ? { ...d, file: "export/" + d.file } : d
        );
    } catch {
        /* empty dependencies are fine */
    }

    try {
        device = await RNBO.createDevice({
            context: audioContext,
            patcher: patcherCache,
        });
    } catch (err) {
        console.error(err);
        showLoadError(
            `RNBO の起動に失敗しました。（${err?.message || err}）`
        );
        device = null;
        audioInitPromise = null;
        engineReady = false;
        return false;
    }

    if (dependencies.length) {
        await device.loadDataBufferDependencies(dependencies);
    }

    device.node.connect(outputGain);
    patchVolumeParam = getPatchVolumeParam();

    if (patchVolumeParam) {
        patchVolumeParam.value = 0;
    }

    applyOutputGain(pendingVolume);
    engineReady = true;
    return true;
}

async function waitForAudioEngine() {
    if (device && engineReady) {
        return true;
    }
    if (!audioInitPromise) {
        startAudioEngineInitFromGesture();
    }
    if (!audioInitPromise) {
        showLoadError("音声エンジンの準備ができていません。");
        return false;
    }
    return audioInitPromise;
}

async function resumeIfWasPlaying() {
    if (!isPlaying || !audioContext) {
        return;
    }
    try {
        await audioContext.resume();
        await PlaybackSession.startKeeper();
    } catch (e) {
        console.warn("Resume after visibility:", e);
    }
}

async function startPlayback() {
    primeAudioContextFromGesture();
    const ready = await waitForAudioEngine();
    if (!ready || !device || !audioContext) {
        return false;
    }
    await audioContext.resume();

    const vol = patchVolumeParam || getPatchVolumeParam();
    if (vol) {
        vol.value = 1;
        patchVolumeParam = vol;
    }

    applyOutputGain(pendingVolume);
    await PlaybackSession.startKeeper();
    setUiPlaying(true);
    return true;
}

async function stopPlayback() {
    if (patchVolumeParam) {
        patchVolumeParam.value = 0;
    }
    PlaybackSession.stopKeeper();
    setUiPlaying(false);
}

async function handlePlayToggle() {
    if (playToggle?.disabled) {
        return;
    }

    if (isPlaying) {
        await stopPlayback();
        return;
    }

    if (!patchReady) {
        showLoadError("パッチを読み込み中です。少し待ってから再度タップしてください。");
        return;
    }

    setPlayBusy(true);
    try {
        const started = await startPlayback();
        if (!started) {
            setUiPlaying(false);
        }
    } finally {
        setPlayBusy(false);
    }
}

async function prefetchPatcher() {
    setPatchLoading(true);
    setUiPlaying(false);
    setOfflineReady(false);

    if (!window.RNBO) {
        showLoadError(
            "RNBO ライブラリが見つかりません。オフラインの場合は一度オンラインで開いてください。"
        );
        return;
    }

    try {
        const { patcher, source } = await OfflineStore.fetchPatcher(resolveAssetUrl(PATCH_EXPORT_URL));
        patcherCache = patcher;
        patchReady = true;
        setOfflineReady(true, source);
        clearLoadError();
        setPatchLoading(false);
        if (statusHint) {
            statusHint.textContent = "再生するには「再生」をタップしてください";
        }
        if (playLabel) {
            playLabel.textContent = "再生";
        }
    } catch (err) {
        console.error(err);
        showLoadError(
            "パッチの読み込みに失敗しました。一度オンラインで開くか、ページを再読み込みしてください。"
        );
        if (playLabel) {
            playLabel.textContent = "読み込み失敗";
        }
    }
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        if (offlineHint) {
            offlineHint.textContent = "Service Worker 非対応（オフライン制限あり）";
        }
        return;
    }
    const swUrl = new URL("sw.js", window.location.href);
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register(swUrl, { scope: new URL("./", window.location.href).href })
            .then(() => {
                if (!offlineReady && offlineHint) {
                    offlineHint.textContent = "オフライン準備: キャッシュ更新中…";
                }
            })
            .catch((err) => console.warn("Service Worker registration failed:", err));
    });
}

function bindUi() {
    const beginGesture = () => {
        if (!patchReady || isPlaying) {
            return;
        }
        startAudioEngineInitFromGesture();
    };

    playToggle?.addEventListener("pointerdown", beginGesture, { passive: true });
    playToggle?.addEventListener("touchstart", beginGesture, { passive: true });
    playToggle?.addEventListener("click", () => {
        void handlePlayToggle();
    });

    volumeSlider?.addEventListener("input", () => {
        applyOutputGain(Number(volumeSlider.value));
    });

    pendingVolume = Number(volumeSlider?.value ?? 50);
    applyOutputGain(pendingVolume);

    PlaybackSession.setupMediaSession({
        onPlay: () => {
            if (!isPlaying) {
                void startPlayback();
            }
        },
        onPause: () => {
            if (isPlaying) {
                void stopPlayback();
            }
        },
    });

    PlaybackSession.bindLifecycle(resumeIfWasPlaying);
}

registerServiceWorker();
bindUi();
prefetchPatcher();