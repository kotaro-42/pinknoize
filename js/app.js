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
let isPlaying = false;

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
            : "再生するには「再生」をタップしてください";
    }
}

function applyOutputGain(percent) {
    if (!outputGain || !audioContext) {
        return;
    }
    const linear = Math.max(0, Math.min(100, percent)) / 100;
    outputGain.gain.setTargetAtTime(linear, audioContext.currentTime, 0.02);
    if (volumeReadout) {
        volumeReadout.textContent = `${Math.round(percent)}%`;
        volumeReadout.classList.toggle("is-muted", percent === 0);
    }
    if (volumeSlider) {
        volumeSlider.setAttribute("aria-valuenow", String(Math.round(percent)));
    }
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

async function ensureAudioRunning() {
    if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
    }
}

async function startPlayback() {
    if (!device || !patchVolumeParam) {
        return;
    }
    await ensureAudioRunning();
    patchVolumeParam.value = 1;
    setUiPlaying(true);
}

async function stopPlayback() {
    if (!device || !patchVolumeParam) {
        return;
    }
    patchVolumeParam.value = 0;
    setUiPlaying(false);
}

async function togglePlayback() {
    if (isPlaying) {
        await stopPlayback();
    } else {
        await startPlayback();
    }
}

async function setup() {
    const WAContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new WAContext();

    outputGain = audioContext.createGain();
    outputGain.gain.value = Number(volumeSlider?.value ?? 50) / 100;
    outputGain.connect(audioContext.destination);

    let response;
    let patcher;
    try {
        response = await fetch(PATCH_EXPORT_URL);
        patcher = await response.json();
    } catch (err) {
        const errorContext = { error: err };
        if (response && (response.status < 200 || response.status >= 300)) {
            errorContext.header = "パッチの読み込みに失敗しました";
            errorContext.description = `「${PATCH_EXPORT_URL}」を確認してください。`;
        }
        if (typeof guardrails === "function") {
            guardrails(errorContext);
        }
        showLoadError("音声エンジンの読み込みに失敗しました。ページを再読み込みしてください。");
        return;
    }

    if (!window.RNBO) {
        showLoadError(
            "RNBO ライブラリが見つかりません。オフライン利用の場合は一度オンラインで開いてください。"
        );
        return;
    }

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
        device = await RNBO.createDevice({ context: audioContext, patcher });
    } catch (err) {
        if (typeof guardrails === "function") {
            guardrails({ error: err });
        }
        showLoadError("RNBO デバイスの作成に失敗しました。");
        return;
    }

    if (dependencies.length) {
        await device.loadDataBufferDependencies(dependencies);
    }

    device.node.connect(outputGain);
    patchVolumeParam = findPatchVolumeParam();

    if (patchVolumeParam) {
        patchVolumeParam.value = 0;
    }

    playToggle?.addEventListener("click", () => {
        togglePlayback();
    });

    volumeSlider?.addEventListener("input", () => {
        const value = Number(volumeSlider.value);
        applyOutputGain(value);
    });

    applyOutputGain(Number(volumeSlider?.value ?? 50));
    setUiPlaying(false);

    if (typeof guardrails === "function") {
        guardrails();
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

registerServiceWorker();
setup();