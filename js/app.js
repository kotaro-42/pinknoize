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
let pendingVolume = 50;

const appEl = document.getElementById("app");
const playToggle = document.getElementById("play-toggle");
const playLabel = document.getElementById("play-label");
const volumeSlider = document.getElementById("volume-slider");
const volumeReadout = document.getElementById("volume-readout");
const statusHint = document.getElementById("status-hint");
const loadError = document.getElementById("load-error");

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

function setPlayButtonState({ disabled, label }) {
    if (playToggle) {
        playToggle.disabled = disabled;
    }
    if (playLabel && label !== undefined) {
        playLabel.textContent = label;
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
    if (playLabel && !playToggle?.disabled) {
        playLabel.textContent = playing ? "停止" : "再生";
    }
    if (statusHint) {
        statusHint.textContent = playing
            ? "再生中"
            : patchReady
              ? "再生するには「再生」をタップしてください"
              : "読み込み中…";
    }
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

function findPatchVolumeParam() {
    if (!device) {
        return null;
    }
    return (
        device.parameters.find((p) => p.id === RNBO_PATCH_VOLUME_PARAM) ||
        device.parameters.find((p) => p.name === RNBO_PATCH_VOLUME_PARAM) ||
        device.parameters[0] ||
        null
    );
}

/** iOS: AudioContext 作成と resume はユーザー操作の直後・await 前に行う */
function primeAudioContextFromGesture() {
    const WAContext = window.AudioContext || window.webkitAudioContext;
    if (!audioContext) {
        audioContext = new WAContext();
        outputGain = audioContext.createGain();
        outputGain.gain.value = pendingVolume / 100;
        outputGain.connect(audioContext.destination);
    }
    void audioContext.resume();
}

async function ensureAudioEngine() {
    if (device) {
        await audioContext?.resume();
        return true;
    }
    if (audioInitPromise) {
        return audioInitPromise;
    }

    audioInitPromise = (async () => {
        clearLoadError();

        if (!window.RNBO) {
            showLoadError(
                "RNBO ライブラリが見つかりません。オフラインの場合は一度オンラインで開いてください。"
            );
            return false;
        }

        if (!patcherCache) {
            showLoadError("パッチがまだ読み込まれていません。しばらく待ってから再度タップしてください。");
            return false;
        }

        primeAudioContextFromGesture();
        if (!audioContext || !outputGain) {
            showLoadError("音声の初期化に失敗しました。");
            return false;
        }

        await audioContext.resume();

        let dependencies = [];
        try {
            const dependenciesResponse = await fetch("export/dependencies.json");
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
                `RNBO の起動に失敗しました。ページを再読み込みして、もう一度「再生」をタップしてください。（${err?.message || err}）`
            );
            device = null;
            audioInitPromise = null;
            return false;
        }

        if (dependencies.length) {
            await device.loadDataBufferDependencies(dependencies);
        }

        device.node.connect(outputGain);
        patchVolumeParam = findPatchVolumeParam();

        if (patchVolumeParam) {
            patchVolumeParam.value = 0;
        }

        applyOutputGain(pendingVolume);
        return true;
    })();

    return audioInitPromise;
}

async function startPlayback() {
    const ready = await ensureAudioEngine();
    if (!ready || !device || !patchVolumeParam || !audioContext) {
        return false;
    }
    await audioContext.resume();
    patchVolumeParam.value = 1;
    setUiPlaying(true);
    return true;
}

async function stopPlayback() {
    if (patchVolumeParam) {
        patchVolumeParam.value = 0;
    }
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

    setPlayButtonState({ disabled: true, label: "起動中…" });
    try {
        primeAudioContextFromGesture();
        const started = await startPlayback();
        if (!started) {
            setUiPlaying(false);
        }
    } finally {
        if (patchReady) {
            setPlayButtonState({ disabled: false, label: isPlaying ? "停止" : "再生" });
        }
    }
}

async function prefetchPatcher() {
    setPlayButtonState({ disabled: true, label: "読み込み中…" });
    setUiPlaying(false);

    if (!window.RNBO) {
        showLoadError(
            "RNBO ライブラリが見つかりません。オフラインの場合は一度オンラインで開いてください。"
        );
        return;
    }

    let response;
    try {
        response = await fetch(PATCH_EXPORT_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        patcherCache = await response.json();
        patchReady = true;
        clearLoadError();
        setPlayButtonState({ disabled: false, label: "再生" });
        if (statusHint) {
            statusHint.textContent = "再生するには「再生」をタップしてください";
        }
    } catch (err) {
        console.error(err);
        showLoadError(
            "パッチの読み込みに失敗しました。ネットワークを確認してページを再読み込みしてください。"
        );
        setPlayButtonState({ disabled: true, label: "読み込み失敗" });
    }
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("./sw.js", { scope: "./" })
            .catch((err) => console.warn("Service Worker registration failed:", err));
    });
}

function bindUi() {
    playToggle?.addEventListener(
        "click",
        () => {
            void handlePlayToggle();
        },
        { passive: true }
    );

    volumeSlider?.addEventListener("input", () => {
        applyOutputGain(Number(volumeSlider.value));
    });

    pendingVolume = Number(volumeSlider?.value ?? 50);
    applyOutputGain(pendingVolume);
}

registerServiceWorker();
bindUi();
prefetchPatcher();