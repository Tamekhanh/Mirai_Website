import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./MusicGame.css";

const GAME_HEIGHT = 600;
const NOTE_SIZE = 50;
const APPROACH_TIME = 4000;

// --- TỐI ƯU TIMING (Đã tinh chỉnh để không bị skip note) ---
const HIT_WINDOW_PERFECT = 60;
const HIT_WINDOW_GREAT = 120;
const HIT_WINDOW_GOOD = 300;    // Mở rộng để tránh nhảy nốt khi nốt gần nhau
const MISS_WINDOW = 400;        // Cho phép note trôi qua vạch hit lâu hơn một chút trước khi tính MISS

const SPAWN_OFFSET = 100;
const TRAVEL_DISTANCE = GAME_HEIGHT - 40 - (NOTE_SIZE / 2);

function formatTime(totalMs) {
    const safeTotal = Math.max(0, Math.floor(totalMs));
    const minutes = Math.floor(safeTotal / 60000).toString().padStart(1, "0");
    const seconds = Math.floor((safeTotal % 60000) / 1000).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function MusicGame({ stage, onBack }) {
    const audioRef = useRef(null);
    const currentTimeRef = useRef(0);
    const rafRef = useRef(0);
    const feedbackTimerRef = useRef(null);
    const startTimeRef = useRef(0);
    const keysPressedRef = useRef({ 0: false, 1: false });
    const notesRef = useRef([]);

    const [gamePhase, setGamePhase] = useState("IDLE");
    const [countdown, setCountdown] = useState(3);
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [feedback, setFeedback] = useState("");
    const [notes, setNotes] = useState([]);
    const [activeLanes, setActiveLanes] = useState({ 0: false, 1: false });

    const songNotes = useMemo(() => stage?.beatmapData?.notes ?? [], [stage]);
    const totalSongLength = useMemo(() => {
        const lastNote = songNotes[songNotes.length - 1];
        return (lastNote?.time ?? 0) + (lastNote?.duration ?? 1200) + APPROACH_TIME;
    }, [songNotes]);

    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    const resetGame = useCallback(() => {
        const initialNotes = songNotes.map((note) => ({
            ...note,
            lane: note.type === "right" ? 1 : 0,
            hit: false,
            missed: false,
            holding: false,
        }));
        setNotes(initialNotes);
        setGamePhase("IDLE");
        setScore(0);
        setCombo(0);
        setBestCombo(0);
        setCurrentTime(0);
        setFeedback("");
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, [songNotes]);

    useEffect(() => {
        resetGame();
        return () => cancelAnimationFrame(rafRef.current);
    }, [resetGame]);

    const initiateStart = async () => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        setGamePhase("COUNTDOWN");
        setCountdown(3);
        await sleep(1000); setCountdown(2);
        await sleep(1000); setCountdown(1);
        await sleep(1000);
        setGamePhase("WAITING");
        startTimeRef.current = performance.now();
        await sleep(1000);
        setGamePhase("PRE_GAME");
        await sleep(3000);
        startActualGame();
    };

    const startActualGame = async () => {
        setGamePhase("PLAYING");
        if (audioRef.current) {
            try { await audioRef.current.play(); } catch (e) { console.error(e); }
        }
    };

    const showFeedback = (message) => {
        setFeedback(message);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback(""), 400);
    };

    const handleKeyDown = useCallback((lane) => {
        if (gamePhase !== "PLAYING") return;
        keysPressedRef.current[lane] = true;
        setActiveLanes(prev => ({ ...prev, [lane]: true }));

        const now = currentTimeRef.current;
        const currentNotes = notesRef.current;

        // TÌM NOTE ĐẦU TIÊN TRONG LÀN (First-Come First-Served)
        const firstAvailableNoteIdx = currentNotes.findIndex(note =>
            note.lane === lane &&
            !note.hit &&
            !note.missed &&
            !note.holding &&
            Math.abs(now - note.time) <= HIT_WINDOW_GOOD
        );

        if (firstAvailableNoteIdx !== -1) {
            const note = currentNotes[firstAvailableNoteIdx];
            const delta = Math.abs(now - note.time);

            setNotes(prev => {
                const next = [...prev];
                if (note.beatType === "hold") {
                    next[firstAvailableNoteIdx] = { ...next[firstAvailableNoteIdx], holding: true };
                } else {
                    next[firstAvailableNoteIdx] = { ...next[firstAvailableNoteIdx], hit: true };
                }
                return next;
            });

            if (note.beatType === "hold") {
                setScore(s => s + 50);
            } else {
                let rating = "GOOD";
                let points = 100;
                if (delta <= HIT_WINDOW_PERFECT) { rating = "PERFECT"; points = 200; }
                else if (delta <= HIT_WINDOW_GREAT) { rating = "GREAT"; points = 150; }

                setScore(s => s + points);
                setCombo(c => {
                    const next = c + 1;
                    setBestCombo(b => Math.max(b, next));
                    return next;
                });
                showFeedback(rating);
            }
        } else {
            setCombo(0);
            showFeedback("MISS");
        }
    }, [gamePhase]);

    const handleKeyUp = useCallback((lane) => {
        keysPressedRef.current[lane] = false;
        setActiveLanes(prev => ({ ...prev, [lane]: false }));
        const now = currentTimeRef.current;

        const currentNotes = notesRef.current;
        const holdIdx = currentNotes.findIndex(n => n.lane === lane && n.holding);

        if (holdIdx === -1) return;

        const note = currentNotes[holdIdx];
        const endTime = note.time + (note.duration || 0);
        const delta = Math.abs(now - endTime);

        if (delta <= HIT_WINDOW_GOOD) {
            setNotes(prev => {
                const next = [...prev];
                next[holdIdx] = { ...next[holdIdx], holding: false, hit: true };
                return next;
            });
            setScore(s => s + 100);
            setCombo(c => {
                const next = c + 1;
                setBestCombo(b => Math.max(b, next));
                return next;
            });
            showFeedback(delta <= HIT_WINDOW_PERFECT ? "PERFECT" : "GREAT");
        } else {
            setNotes(prev => {
                const next = [...prev];
                next[holdIdx] = { ...next[holdIdx], holding: false, missed: true };
                return next;
            });
            setCombo(0);
            showFeedback("MISS");
        }
    }, []);

    useEffect(() => {
        if (gamePhase === "IDLE" || gamePhase === "COUNTDOWN") return;

        const tick = () => {
            let now = gamePhase === "PLAYING"
                ? (audioRef.current ? audioRef.current.currentTime * 1000 : 0)
                : (performance.now() - startTimeRef.current) - 4000;

            currentTimeRef.current = now;
            setCurrentTime(now);

            setNotes(prev => {
                let missedAny = false;
                const next = prev.map(note => {
                    if (note.hit || note.missed) return note;

                    const endTime = note.time + (note.beatType === "hold" ? note.duration ?? 0 : 0);

                    // MISS: Note chỉ bị tính miss khi trôi qua hẳn vạch hit + MISS_WINDOW
                    if (now > endTime + MISS_WINDOW) {
                        missedAny = true;
                        return { ...note, missed: true };
                    }

                    if (note.holding && !keysPressedRef.current[note.lane]) {
                        missedAny = true;
                        return { ...note, holding: false, missed: true };
                    }

                    if (note.holding && now > endTime + HIT_WINDOW_GOOD) {
                        return { ...note, holding: false, hit: true };
                    }

                    return note;
                });

                if (missedAny) {
                    setTimeout(() => {
                        setCombo(0);
                        showFeedback("MISS");
                    }, 0);
                }
                return next;
            });
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [gamePhase]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.repeat) return;
            if (e.key.toLowerCase() === "f") handleKeyDown(0);
            if (e.key.toLowerCase() === "j") handleKeyDown(1);
        };
        const onKeyUp = (e) => {
            if (e.key.toLowerCase() === "f") handleKeyUp(0);
            if (e.key.toLowerCase() === "j") handleKeyUp(1);
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [gamePhase, handleKeyDown, handleKeyUp]);

    const progressRatio = totalSongLength > 0 ? Math.min(currentTime / totalSongLength, 1) : 0;

    return (
        <div className="music-game-page">
            <audio ref={audioRef} src={stage?.musicUrl ?? ""} preload="auto" />

            {gamePhase === "IDLE" && (
                <div className="music-start-screen">
                    <div className="glass-card start-card">
                        <p className="eyebrow">Mirai Music Experience</p>
                        <h1 className="glitch-text" data-text={stage?.name}>{stage?.name ?? "Mirai Music"}</h1>
                        <p className="description">{stage?.description ?? "Prepare your fingers for the rhythm."}</p>
                        <div className="stats-grid">
                            <div className="stat-item"><span>Diff</span><strong>{stage?.difficulty ?? "-"}</strong></div>
                            <div className="stat-item"><span>Notes</span><strong>{songNotes.length}</strong></div>
                            <div className="stat-item"><span>BPM</span><strong>{stage?.beatmapData?.metadata?.bpm ?? 0}</strong></div>
                        </div>
                        <div className="action-group">
                            <button className="btn-primary" onClick={initiateStart}>START GAME</button>
                            <button className="btn-secondary" onClick={onBack}>BACK</button>
                        </div>
                    </div>
                </div>
            )}

            {(gamePhase === "COUNTDOWN" || gamePhase === "WAITING") && (
                <div className="countdown-overlay">
                    {gamePhase === "COUNTDOWN" ? <div className="countdown-number">{countdown}</div> : <div className="countdown-text">GET READY...</div>}
                </div>
            )}

            {(gamePhase === "WAITING" || gamePhase === "PRE_GAME" || gamePhase === "PLAYING") && (
                <div className="game-layout">
                    <div className="game-header">
                        <div className="track-info">
                            <p className="eyebrow">Now Playing</p>
                            <h2>{stage?.name}</h2>
                            <p className="artist">{stage?.beatmapData?.metadata?.artist}</p>
                        </div>
                        <div className="game-controls">
                            <button className="btn-secondary-sm" onClick={onBack}>Menu</button>
                            <button className="btn-danger-sm" onClick={resetGame}>Stop</button>
                        </div>
                    </div>

                    <div className="game-hud">
                        <div className="hud-item score-box">
                            <span className="label">Score</span>
                            <span className="value">{score.toLocaleString()}</span>
                        </div>
                        <div className="hud-item combo-box">
                            <span className="label">Combo</span>
                            <span className="value">{combo}</span>
                            {combo > 0 && <span className="best">Best: {bestCombo}</span>}
                        </div>
                        <div className="hud-item progress-box">
                            <div className="progress-container">
                                <div className="progress-fill" style={{ width: `${progressRatio * 100}%` }} />
                            </div>
                            <span className="time-text">{formatTime(currentTime)} / {formatTime(totalSongLength)}</span>
                        </div>
                    </div>

                    <div className="game-stage">
                        <div className={`lane lane-0 ${activeLanes[0] ? 'active' : ''}`}>
                            <span className="lane-key">F</span>
                            <div className="hit-circle lane-0"></div>
                        </div>
                        <div className={`lane lane-1 ${activeLanes[1] ? 'active' : ''}`}>
                            <span className="lane-key">J</span>
                            <div className="hit-circle lane-1"></div>
                        </div>

                        {notes.filter(n => !n.hit && !n.missed).map((note) => {
                            const noteStart = note.time - APPROACH_TIME;
                            const progress = (currentTime - noteStart) / APPROACH_TIME;

                            const noteHeight = note.beatType === "hold"
                                ? NOTE_SIZE + (note.duration || 0) / 15
                                : NOTE_SIZE;
                            const hitPointTop = -SPAWN_OFFSET + progress * (TRAVEL_DISTANCE + SPAWN_OFFSET);

                            const actualTop = hitPointTop - (noteHeight - NOTE_SIZE);
                            if (actualTop + noteHeight < -SPAWN_OFFSET || actualTop > GAME_HEIGHT) {
                                return null;
                            }

                            return (
                                <div
                                    key={note.id}
                                    className={`game-note lane-${note.lane} ${note.beatType === "hold" ? "hold" : ""} ${note.holding ? "holding-active" : ""}`}
                                    style={{
                                        top: `${actualTop}px`,
                                        height: `${noteHeight}px`
                                    }}
                                >
                                    <span className="note-lyric">{note.lyric}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="footer-controls">
                        <div className="key-hint">Press <kbd>F</kbd> and <kbd>J</kbd> to the beat</div>
                    </div>
                </div>
            )}
            {feedback && <div className={`game-feedback ${feedback === 'MISS' ? 'miss' : ''}`}>{feedback}</div>}
        </div>
    );
}

export default MusicGame;