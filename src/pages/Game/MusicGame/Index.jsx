import { useState } from "react";
import "./Index.css";
import stageData from "../../../assets/game/MiraiMusic/stage.json";
import beatmapRoPR from "../../../assets/game/MiraiMusic/beatmaps/RoPR-stage1.json";
import beatmapChachihu from "../../../assets/game/MiraiMusic/beatmaps/Chachihu-stage2.json";
import MusicGame from "./MusicGame.jsx";

const assetRegistry = {
	beatmaps: {
		"RoPR-stage1": beatmapRoPR,
		"Chachihu-stage2": beatmapChachihu,
	}
};

function resolveStage(stage) {
	return {
		...stage,
		beatmapData: assetRegistry.beatmaps[stage.beatmap],
		musicUrl: stage.music,
		coverUrl: stage.cover,
	};
}

function formatDuration(totalMs) {
	const safeTotal = Number.isFinite(totalMs) ? totalMs : 0;
	const minutes = Math.floor(safeTotal / 60000);
	const seconds = Math.floor((safeTotal % 60000) / 1000)
		.toString()
		.padStart(2, "0");

	return `${minutes}:${seconds}`;
}

function Index() {
	const stages = stageData.stages.map(resolveStage);
	const [selectedStage, setSelectedStage] = useState(null);
	const [pendingStage, setPendingStage] = useState(null);

	const requestPlay = (stage) => {
		setPendingStage(stage);
	};

	const confirmPlay = () => {
		setSelectedStage(pendingStage);
		setPendingStage(null);
	};

	const cancelPlay = () => {
		setPendingStage(null);
	};

	if (selectedStage) {
		return (
			<MusicGame
				stage={selectedStage}
				onBack={() => setSelectedStage(null)}
			/>
		);
	}

	return (
		<div className="music-game-index">
			{/* Background Decorative Elements */}
			<div className="bg-glow top-left"></div>
			<div className="bg-glow bottom-right"></div>

			<div className="music-game-index__panel">
				<header className="music-game-index__hero">
					<div className="hero-text">
						<p className="music-game-index__eyebrow">Mirai Music Experience Prototype</p>
						<h1>Song Selection</h1>
						<p className="music-game-index__lead">
							Choose a stage to test your rhythm skills! Each stage features a unique track and beatmap. Can you master them all?
						</p>
					</div>
					<div className="hero-decoration">
						<div className="deco-circle"></div>
					</div>
				</header>

				<div className="music-game-index__grid">
					{stages.map((stage) => {
						const noteCount = stage.beatmapData?.notes?.length ?? 0;
						const lastNote = stage.beatmapData?.notes?.[noteCount - 1];
						const estimatedLength =
							(lastNote?.time ?? 0) + (lastNote?.duration ?? 1200) + 1800;

						return (
							<article className="stage-card" key={stage.id}>
								<div className="stage-card__visual">
									<img src={stage.coverUrl} alt={stage.name} className="stage-card__cover" />
									<div className="stage-card__overlay">
										<span className={`stage-card__difficulty stage-card__difficulty-${stage.difficulty.toLowerCase()}`}>
											{stage.difficulty}
										</span>
									</div>
									<button
										className="stage-card__play-btn"
										onClick={() => requestPlay(stage)}
									>
										<span className="play-icon">▶</span> Play
									</button>
								</div>

								<div className="stage-card__content">
									<div className="stage-card__title-group">
										<span className="stage-card__id">STAGE {stage.id}</span>
										<h2>{stage.name}</h2>
									</div>
									<p className="stage-card__description">{stage.description}</p>

									<div className="stage-card__footer">
										<div className="stat-pill">
											<span>Notes</span>
											<strong>{noteCount}</strong>
										</div>
										<div className="stat-pill">
											<span>BPM</span>
											<strong>{stage.beatmapData?.metadata?.bpm ?? 0}</strong>
										</div>
										<div className="stat-pill">
											<span>Time</span>
											<strong>{formatDuration(estimatedLength)}</strong>
										</div>
									</div>
								</div>
							</article>
						);
					})}

					<article className="stage-card">
						<div className="stage-card__content">
							<div className="stage-card__title-group">
								<div className="music-game-index__coming-soon">
									<h2>Coming Soon</h2>
									<p>I'm working hard to bring the music game experience to life. Stay tuned for updates!</p>
									<p>Some songs are not available since copyright restrictions apply.</p>
								</div>

							</div>
						</div>
					</article>
				</div>
			</div>

			{pendingStage && (
				<div
					className="copyright-warning-overlay"
					role="dialog"
					aria-modal="true"
					aria-labelledby="copyright-warning-title"
					onClick={(e) => { if (e.target === e.currentTarget) cancelPlay(); }}
				>
					<div className="copyright-warning-modal">
						<div className="copyright-warning-modal__header">
							<span className="copyright-warning-modal__badge">⚠ Copyright Notice</span>
							<h2 id="copyright-warning-title">Before You Play</h2>
						</div>
						<div className="copyright-warning-modal__body">
							<p>
								The music featured in this game is <strong>not owned</strong> by this project.
								All rights, audio recordings, and related materials belong to their respective
								artists, composers, and copyright holders.
							</p>
							<p>
								This music game is provided strictly for <strong>educational and
									non-commercial purposes</strong> only — for learning rhythm game mechanics,
								testing, and personal study. It is not intended for commercial distribution
								or to replace official releases.
							</p>
							<p className="copyright-warning-modal__disclaimer">
								If you enjoy the music, please support the original artists and purchase
								their official work.
							</p>
						</div>
						<div className="copyright-warning-modal__actions">
							<button className="btn-secondary" onClick={cancelPlay}>Cancel</button>
							<button className="btn-primary" onClick={confirmPlay}>
								I Understand — Play
							</button>
						</div>
					</div>
				</div>
			)}

		</div>
	);
}

export default Index;