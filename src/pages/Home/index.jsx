import './index.css'

const featureCards = [
	{
		title: 'Chat with Mirai',
		description: 'Start a conversation with the VRM companion and see the avatar react in real time.',
		page: 1,
	},
	{
		title: 'Read the project story',
		description: 'Learn how the app is built, which assets it uses, and how the pieces fit together.',
		page: 2,
	},
	{
		title: 'Try the music game',
		description: 'Jump into the rhythm prototype and test the current beatmap stages.',
		page: 3,
	},
]

const Banner = [
	{
		title: 'MirAI',
		desc: 'Web-based 3D Interactive Avatar',
		link: 'https://tamek-mirai.io.vn/chat',
		banner: 1
	},
	{
		title: 'MirAI Music Game',
		desc: 'A Rhythm Game Prototype',
		link: 'https://tamek-mirai.io.vn/games',
		banner: 2
	},
	{
		title: 'Project S',
		desc: 'Card Game Prototype',
		link: 'https://www.facebook.com/share/v/1GDwqWwFaW/',
		banner: 3
	},
	
]

function Home({ onNavigate }) {
	return (
		<main className="home-page">
			<section className="home-hero">
				<div className="home-carousel">
					<div className="home-carousel__slide">
						{Banner.map((banner) => (
							<div key={banner.banner} className="home-banner">
								<h2>{banner.title}</h2>
								<p>{banner.desc}</p>
								<a href={banner.link} target="_blank" rel="noopener noreferrer">
									Learn more
								</a>
							</div>
						))}
					</div>

				</div>
				<div className="home-copy">
					<p className="home-eyebrow">MirAI interactive demo</p>
					<h2>One place for chat, avatar, and rhythm.</h2>
					<p className="home-lead">
						This index brings the main MirAI experiences together in a single hub: talk to the assistant,
						inspect the project details, or launch the music prototype.
					</p>
					<div className="home-actions">
						<button type="button" className="home-primary" onClick={() => onNavigate(1)}>
							Open chat
						</button>
						<button type="button" className="home-secondary" onClick={() => onNavigate(3)}>
							Play music game
						</button>
					</div>
				</div>
			</section>

			<section className="home-grid">
				{featureCards.map((card) => (
					<article className="home-card" key={card.title}>
						<p className="home-card-label">Quick start</p>
						<h3>{card.title}</h3>
						<p>{card.description}</p>
						<button type="button" className="home-card-button" onClick={() => onNavigate(card.page)}>
							Open section
						</button>
					</article>
				))}
			</section>
		</main>
	)
}

export default Home