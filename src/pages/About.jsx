import './About.css'

function About() {
	return (
		<main className="about-page">
			<section className="about-hero">
				<p className="about-eyebrow">About this project</p>
				<h1>Mirai is a VRM-powered AI companion</h1>
				<p className="about-lead">
					This app combines a React frontend, a Three.js VRM avatar, and a backend chat API to deliver a
					conversation experience that feels alive. The current build is focused on local development and
					Hugging Face deployment.
				</p>
				<div className="about-actions">
					<a className="about-button about-button-primary" href="#details">
						Project details
					</a>
					<a className="about-button about-button-secondary" href="#deploy">
						Deployment
					</a>
				</div>
			</section>

			<section id="details" className="about-grid">
				<article className="about-card">
					<p className="about-card-label">What Mirai is</p>
					<h2>Chat plus avatar, not just a textbox</h2>
					<p>
						Mirai is designed as a visual assistant: the chat window handles conversation, while the VRM
						viewer renders the character, animations, expression changes, and lip-sync feedback.
					</p>
				</article>

				<article className="about-card">
					<p className="about-card-label">Model asset</p>
					<h2>Casual Mirai VRM</h2>
					<p>
						The current avatar is loaded from <span className="about-inline-code">public/Mirai_Assets/Mirai_Model_casual.vrm</span>,
						with a startup animation and idle loop from the animation folder.
					</p>
				</article>

				<article className="about-card">
					<p className="about-card-label">Backend</p>
					<h2>Simple API surface</h2>
					<p>
						The frontend talks to <span className="about-inline-code">POST /api/chat</span>,
						<span className="about-inline-code">GET /api/health</span>, and optionally
						<span className="about-inline-code">GET /api/history</span> through the configurable
						<span className="about-inline-code">VITE_API_URL</span> setting.
					</p>
				</article>

				<article className="about-card">
					<p className="about-card-label">Current strengths</p>
					<h2>What already works well</h2>
					<ul className="about-list">
						<li>VRM loading with progress and retry state</li>
						<li>Online/offline server status indicator</li>
						<li>Audio replies and lip-sync support</li>
						<li>Blend-shape debug controls for development</li>
					</ul>
				</article>
			</section>

			<section className="about-section">
				<div className="about-section-header">
					<p className="about-card-label">System overview</p>
					<h2>How the app is structured</h2>
				</div>
				<div className="about-stack">
					<div className="about-stack-item">
						<span>Frontend</span>
						<p>React 19 with Vite, styling in plain CSS, and a single-page layout that swaps between Chat and About.</p>
					</div>
					<div className="about-stack-item">
						<span>Avatar layer</span>
						<p>Three.js and @pixiv/three-vrm handle model loading, animations, OrbitControls, and expression updates.</p>
					</div>
					<div className="about-stack-item">
						<span>Conversation layer</span>
						<p>The chat service wraps fetch with timeout and health checks so the UI can respond gracefully to failures.</p>
					</div>
				</div>
			</section>

			<section className="about-section about-qa">
				<div className='about-section-header'>
					<p className="about-card-label">Engine use for Mirai 3D Model</p>
					<h2>Created with VRoid Studio</h2>
				</div>
				<div className= "about-vroid">
					<img className="about-vroid-img" src="/About/Vroid.png" alt="Mirai 3D Model" />
					<p className= "about-vroid-description">
						Mirai's visual identity is crafted using VRoid Studio, allowing for a high-fidelity anime aesthetic with full customization. 
						By leveraging the VRM standard, the model seamlessly integrates with Three.js, enabling real-time animations, expressive blend-shapes, and fluid lip-syncing that bring the character to life in the browser.
						The VRM format also supports efficient model loading and rendering, ensuring that Mirai can deliver a smooth and engaging user experience while maintaining a rich visual presence.
					</p>
				</div>
			</section>

			<section className="about-section AI-model">
				<div className='about-section-header'>
					<p className="about-card-label">AI Model</p>
					<h2>Using Llama 3 8B - Q4 K M</h2>
				</div>
				<div className= "about-AI-model">
					<img className="about-AI-model-img" src="/About/LLama38b.png" alt="Llama 3 8B" />
					<p className= "about-AI-model-description">
						The intelligence behind Mirai is powered by Llama 3 8B, optimized with Q4_K_M quantization. 
						This specific configuration strikes the perfect balance between cognitive reasoning and inference speed, ensuring that Mirai can maintain contextually aware, natural conversations while remaining efficient enough for scalable deployment.
						
					</p>
				</div>
			</section>

			<section id="deploy" className="about-section about-section-split">
				<div>
					<p className="about-card-label">Deployment</p>
					<h2>What needs to be in place before shipping</h2>
					<ol className="about-steps">
						<li>Set <span className="about-inline-code">VITE_API_URL</span> to the deployed backend.</li>
						<li>Keep the VRM and animation files under <span className="about-inline-code">public/Mirai_Assets</span>.</li>
						<li>Build the frontend with <span className="about-inline-code">npm run build</span>.</li>
						<li>Serve the static output from your chosen host, including Hugging Face Spaces if needed.</li>
					</ol>
				</div>

				<div className="about-note">
					<p className="about-card-label">Known limits</p>
					<ul className="about-list">
						<li>The About page is informational only and does not yet expose runtime metrics.</li>
						<li>Server health is cached, so status can lag briefly after a reconnect.</li>
						<li>Debug blend-shape controls are still visible in the chat page and should be hidden for production.</li>
						<li>The backend contract is intentionally simple, so richer memory/history features are still room for growth.</li>
					</ul>
				</div>
			</section>
		</main>
	)
}

export default About