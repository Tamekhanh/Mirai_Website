import { Link } from 'react-router-dom'
import './About.css'

const EXPRESSIONS = ['Bình thường', 'Vui', 'Giận', 'Buồn', 'Thư giãn', 'Ngạc nhiên']

const FLOW = [
	{
		step: '1',
		name: 'Trình duyệt',
		detail: 'React 19 + Vite. Three.js và @pixiv/three-vrm dựng nhân vật, biểu cảm và khẩu hình.',
	},
	{
		step: '2',
		name: 'Cloudflare Worker',
		detail: 'Nhận /chat, /tts, /health rồi chuyển tiếp. Khoá truy cập nằm trong secret của Worker, không lộ ra phía trình duyệt.',
	},
	{
		step: '3',
		name: 'Hugging Face Space',
		detail: 'Llama 3 8B đã tinh chỉnh, lượng tử hoá Q4_K_M, chạy bằng CPU trên backend FastAPI.',
	},
	{
		step: '4',
		name: 'Giọng nói',
		detail: 'Giọng tiếng Việt do edge-tts tạo ra, kèm dữ liệu hình miệng theo nguyên âm để nhép môi.',
	},
]

function About() {
	return (
		<div className="about-page">
			<section className="about-hero">
				<p className="about-eyebrow">Giới thiệu</p>
				<h1>Mirai là ai?</h1>
				<p className="about-lead">
					Mirai (未来) trong tiếng Nhật nghĩa là “tương lai”. Đây là một người bạn đồng hành ảo nói tiếng Việt: dịu dàng,
					hay hỏi han và thỉnh thoảng trêu bạn một chút. Mirai là dự án cá nhân của <strong>Tamek</strong>, chạy hoàn toàn
					trên trình duyệt.
				</p>
				<div className="about-actions">
					<Link className="about-button about-button-primary" to="/chat">
						Trò chuyện với Mirai
					</Link>
					<a className="about-button about-button-secondary" href="#how">
						Mirai hoạt động thế nào
					</a>
				</div>
			</section>

			<section id="meet" className="about-section">
				<div className="about-section-header">
					<p className="about-card-label">Gặp Mirai</p>
					<h2>Không chỉ là một ô chat</h2>
				</div>
				<div className="about-grid">
					<article className="about-card">
						<h3>Tính cách</h3>
						<p>
							Mirai nói chuyện như một người bạn: xưng “mình”, gọi bạn là “bạn”, trả lời ngắn gọn vài câu và hay hỏi lại.
							Nếu không biết, Mirai nói thẳng là không biết thay vì bịa ra.
						</p>
					</article>
					<article className="about-card">
						<h3>Biểu cảm</h3>
						<p>Mỗi câu trả lời kèm một cảm xúc, và gương mặt nhân vật đổi theo:</p>
						<ul className="about-chips" aria-label="Các biểu cảm">
							{EXPRESSIONS.map((name) => (
								<li key={name}>{name}</li>
							))}
						</ul>
					</article>
					<article className="about-card">
						<h3>Giọng nói và khẩu hình</h3>
						<p>
							Chữ hiện ra trước, giọng nói tải ngay sau đó. Hình miệng được tính từ nguyên âm tiếng Việt nên môi
							nhép khớp với lời nói.
						</p>
					</article>
					<article className="about-card">
						<h3>Trí nhớ</h3>
						<p>
							Mirai nhớ 6 lượt hỏi đáp gần nhất trong cuộc trò chuyện. Lịch sử chỉ lưu trong trình duyệt của bạn
							và có thể xoá bất cứ lúc nào.
						</p>
					</article>
				</div>
			</section>

			<section id="how" className="about-section">
				<div className="about-section-header">
					<p className="about-card-label">Cách hoạt động</p>
					<h2>Từ câu hỏi của bạn đến giọng nói của Mirai</h2>
				</div>
				<ol className="about-flow">
					{FLOW.map((item) => (
						<li key={item.step} className="about-flow-item">
							<span className="about-flow-step" aria-hidden="true">{item.step}</span>
							<h3>{item.name}</h3>
							<p>{item.detail}</p>
						</li>
					))}
				</ol>
			</section>

			<section className="about-section">
				<div className="about-section-header">
					<p className="about-card-label">Mô hình 3D</p>
					<h2>Được tạo bằng VRoid Studio</h2>
				</div>
				<div className="about-media">
					<img className="about-media-img" src="/About/Vroid.png" alt="Mirai trong VRoid Studio" width="1200" height="630" loading="lazy" decoding="async" />
					<p>
						Nhân vật được dựng bằng VRoid Studio và xuất ra định dạng VRM. Nhờ chuẩn VRM, trình duyệt có thể tải
						mô hình, chạy hoạt ảnh nghỉ và đổi blendshape cho biểu cảm cũng như khẩu hình theo thời gian thực.
					</p>
				</div>
			</section>

			<section className="about-section">
				<div className="about-section-header">
					<p className="about-card-label">Mô hình ngôn ngữ</p>
					<h2>Llama 3 8B, tinh chỉnh cho Mirai</h2>
				</div>
				<div className="about-media">
					<img className="about-media-img about-media-img-sm" src="/About/LLama38b.png" alt="Llama 3 8B" width="300" height="168" loading="lazy" decoding="async" />
					<p>
						Bộ não của Mirai là Llama 3 8B, tinh chỉnh theo tính cách của Mirai và lượng tử hoá Q4_K_M để đủ nhẹ chạy
						trên CPU. Đổi lại, mô hình nhỏ nên đôi lúc trả lời chưa hoàn hảo.
					</p>
				</div>
			</section>

			<section className="about-section about-section-split">
				<div className="about-note">
					<p className="about-card-label">Giới hạn hiện tại</p>
					<ul className="about-list">
						<li>Trên Space CPU miễn phí, một câu trả lời mất khoảng 10–30 giây, và lâu hơn khi máy chủ vừa thức dậy.</li>
						<li>Trạng thái máy chủ được lưu đệm nên có thể trễ một chút sau khi kết nối lại.</li>
						<li>Game nhạc mới là bản prototype. Toàn bộ bài hát thuộc về nghệ sĩ gốc.</li>
					</ul>
				</div>
				<div className="about-note">
					<p className="about-card-label">Dự án khác</p>
					<ul className="about-list">
						<li><Link className="about-link" to="/games">Mirai Music Game</Link> – game nhịp điệu</li>
						<li>
							<a className="about-link" href="https://www.facebook.com/share/v/1GDwqWwFaW/" target="_blank" rel="noopener noreferrer">
								Project S
							</a>{' '}
							– game bài (prototype)
						</li>
					</ul>
				</div>
			</section>

			<details id="deploy" className="about-section about-dev">
				<summary>Dành cho developer: triển khai</summary>
				<ol className="about-steps">
					<li>Triển khai Space backend trước, sau đó Worker để <span className="about-inline-code">/chat</span>, <span className="about-inline-code">/tts</span> và <span className="about-inline-code">/health</span> chuyển tiếp tới Space.</li>
					<li>Lưu khoá upstream bằng <span className="about-inline-code">wrangler secret put SPACE_API_KEY</span>.</li>
					<li>Giữ file VRM và hoạt ảnh trong <span className="about-inline-code">public/Mirai_Assets</span>.</li>
					<li>Build frontend bằng <span className="about-inline-code">npm run build</span>, rồi <span className="about-inline-code">npm run deploy</span>.</li>
				</ol>
			</details>
		</div>
	)
}

export default About
