import { useState } from "react";
import "./Index.css";
import stageData from "../../assets/game/MiraiMusic/stage.json";
import beatmapRoPR from "../../assets/game/MiraiMusic/beatmaps/RoPR-stage1.json";
import beatmapChachihu from "../../assets/game/MiraiMusic/beatmaps/Chachihu-stage2.json";
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
			{/* <div className="bg-glow top-left"></div>
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
										onClick={() => setSelectedStage(stage)}
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
				</div>
			</div> */}

				<div className="music-game-index__coming-soon">
					<h2>Coming Soon</h2>
					<p>We're working hard to bring the music game experience to life. Stay tuned for updates!</p>
					<p>Some songs are not available yet since copyright restrictions apply.</p>
				</div>

		</div>
	);
}

export default Index;