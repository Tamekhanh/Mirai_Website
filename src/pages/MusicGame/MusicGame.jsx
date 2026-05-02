import "./MusicGame.css";
import { useState, useEffect } from "react";

function MusicGame() {
    const [notes, setNotes] = useState([]);
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [gameActive, setGameActive] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [isGameStarted, setIsGameStarted] = useState(false);

    const LANE_WIDTH = 150;
    const GAME_HEIGHT = 600;
    const NOTE_SIZE = 40;
    const HIT_ZONE_HEIGHT = 100; // Vùng ấn dưới cùng
    const FALL_SPEED = 4; // px/frame

    // Tạo các nút nhịp điệu
    useEffect(() => {
        if (!isGameStarted) return;

        const interval = setInterval(() => {
            const newNote = {
                id: Math.random(),
                lane: Math.random() > 0.5 ? 0 : 1, // 2 lanes
                position: 0,
                hit: false,
            };
            setNotes((prev) => [...prev, newNote]);
        }, 500); // Tạo note mỗi 500ms

        return () => clearInterval(interval);
    }, [isGameStarted]);

    // Cập nhật vị trí các nút
    useEffect(() => {
        const gameLoop = setInterval(() => {
            setNotes((prev) => {
                const updated = prev
                    .map((note) => ({
                        ...note,
                        position: note.position + FALL_SPEED,
                    }))
                    .filter((note) => note.position < GAME_HEIGHT);

                return updated;
            });
        }, 30);

        return () => clearInterval(gameLoop);
    }, []);

    // Xử lý phím F và J
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key.toLowerCase() === 'f') {
                handleLaneClick(0);
            } else if (e.key.toLowerCase() === 'j') {
                handleLaneClick(1);
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [notes]);

    // Phát âm thanh khi tap
    const playTapSound = () => {
        const audio = new Audio("/Game/Tap.mp3");
        audio.volume = 0.3;
        audio.currentTime = 0;
        audio.play().catch(err => console.log("Audio play error:", err));
    };

    // Kiểm tra hit khi ấn nút
    const handleLaneClick = (lane) => {
        let hitNote = false;

        setNotes((prev) => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
                const note = updated[i];
                if (
                    note.lane === lane &&
                    !note.hit &&
                    note.position > GAME_HEIGHT - HIT_ZONE_HEIGHT - NOTE_SIZE &&
                    note.position < GAME_HEIGHT - NOTE_SIZE
                ) {
                    note.hit = true;
                    hitNote = true;
                    setScore((s) => s + 100);
                    setCombo((c) => c + 1);
                    setFeedback("Perfect! ✨");
                    playTapSound();
                    setTimeout(() => setFeedback(""), 300);
                    break;
                }
            }
            return updated;
        });

        if (!hitNote) {
            setCombo(0);
            setFeedback("Miss! ❌");
            setTimeout(() => setFeedback(""), 300);
        }
    };

    return (
        <div className="game-container">
            {!isGameStarted ? (
                <div className="start-screen">
                    <h1 className="start-title">Mirai Music Prototype</h1>
                    <div className="start-description">
                        <p>Bấm F hoặc J khi các nút đến vùng tím</p>
                        <p>Nhận điểm và tích lũy combo!</p>
                    </div>
                    <button 
                        className="play-button"
                        onClick={() => setIsGameStarted(true)}
                    >
                        ▶ PLAY
                    </button>
                </div>
            ) : (
                <>
                    <div className="game-header">
                        <h1>Mirai Music Prototype</h1>
                        <button 
                            className="stop-button"
                            onClick={() => {
                                setIsGameStarted(false);
                                setScore(0);
                                setCombo(0);
                                setNotes([]);
                                setFeedback("");
                            }}
                        >
                            ⏹ STOP
                        </button>
                    </div>
                    
                    <div className="score-info">
                        <div>Score: {score}</div>
                        <div>Combo: {combo}</div>
                    </div>

                    <div className="game-area">
                        {notes.map((note) => (
                            <div
                                key={note.id}
                                className={`note lane-${note.lane} ${note.hit ? "hit" : ""}`}
                                style={{
                                    top: `${note.position}px`,
                                    opacity: note.hit ? 0.3 : 1,
                                }}
                            />
                        ))}

                        <div className="hit-zone">
                            <div className="hit-line"></div>
                        </div>
                    </div>

                    <div className="buttons-container">
                        <button
                            className="game-button button-left"
                            onClick={() => handleLaneClick(0)}
                        >
                            F
                        </button>
                        <button
                            className="game-button button-right"
                            onClick={() => handleLaneClick(1)}
                        >
                            J
                        </button>
                    </div>

                    {feedback && <div className="feedback">{feedback}</div>}

                    <div className="controls">
                        Bấm nút hoặc phím <span className="key">F</span> và <span className="key">J</span> khi nút đến vùng tím
                    </div>
                </>
            )}
        </div>
    );
}

export default MusicGame;