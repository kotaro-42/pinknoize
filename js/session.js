/**
 * セッション維持層（優先度 2–3 向け・ベストエフォート）
 * iOS で Web Audio を長時間維持する保証はない。
 */
const PlaybackSession = (() => {
    /** @type {HTMLAudioElement | null} */
    let keeper = null;
    let onRemoteStop = null;

    // 極小 WAV (44 bytes header + 2 samples silence) base64
    const SILENT_WAV =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA==";

    function ensureKeeperElement() {
        if (keeper) {
            return keeper;
        }
        const el = document.createElement("audio");
        el.id = "session-keeper";
        el.src = SILENT_WAV;
        el.loop = true;
        el.preload = "auto";
        el.setAttribute("playsinline", "");
        el.setAttribute("webkit-playsinline", "");
        el.style.display = "none";
        document.body.appendChild(el);
        keeper = el;
        return keeper;
    }

    function requestPlaybackAudioSession() {
        try {
            if ("audioSession" in navigator && navigator.audioSession) {
                navigator.audioSession.type = "playback";
            }
        } catch {
            /* optional */
        }
    }

    function setupMediaSession(handlers) {
        if (!("mediaSession" in navigator)) {
            return;
        }
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "Pink Noise",
                artist: "Pink Noise",
                album: "Ambient",
            });
            navigator.mediaSession.setActionHandler("play", () => handlers.onPlay?.());
            navigator.mediaSession.setActionHandler("pause", () => handlers.onPause?.());
            navigator.mediaSession.setActionHandler("stop", () => handlers.onPause?.());
        } catch (e) {
            console.warn("Media Session setup:", e);
        }
    }

    function setMediaPlaybackState(playing) {
        if ("mediaSession" in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? "playing" : "paused";
            } catch {
                /* ignore */
            }
        }
    }

    async function startKeeper() {
        requestPlaybackAudioSession();
        const el = ensureKeeperElement();
        try {
            await el.play();
        } catch (e) {
            console.warn("Session keeper play:", e);
        }
    }

    function stopKeeper() {
        if (!keeper) {
            return;
        }
        keeper.pause();
        if (keeper.currentTime > 0) {
            keeper.currentTime = 0;
        }
    }

    /**
     * フォアグラウンド復帰時の AudioContext 復旧
     * @param {() => Promise<void> | void} resumeAudio
     */
    function bindLifecycle(resumeAudio) {
        const tryResume = () => {
            if (document.visibilityState === "visible") {
                void resumeAudio();
            }
        };
        document.addEventListener("visibilitychange", tryResume);
        window.addEventListener("pageshow", tryResume);
        window.addEventListener("focus", tryResume);
    }

    return {
        setupMediaSession,
        setMediaPlaybackState,
        startKeeper,
        stopKeeper,
        requestPlaybackAudioSession,
        bindLifecycle,
    };
})();