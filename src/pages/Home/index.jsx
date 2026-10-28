import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './index.css';

const featureCards = [
    {
        title: 'Trò chuyện với Mirai',
        description: 'Bắt đầu cuộc trò chuyện và xem nhân vật 3D phản ứng, nói và đổi biểu cảm theo từng câu.',
        page: 1,
    },
    {
        title: 'Tìm hiểu về Mirai',
        description: 'Mirai là ai, được làm bằng gì và các phần ghép lại với nhau như thế nào.',
        page: 2,
    },
    {
        title: 'Chơi game nhạc',
        description: 'Thử bản prototype game nhịp điệu với các màn beatmap hiện có.',
        page: 3,
    },
];

const Banner = [
    {
        title: 'MirAI',
        desc: 'Bạn đồng hành ảo 3D chạy ngay trên trình duyệt',
        link: '/chat',
        image: '/Banner/Banner1.png',
        banner: 1
    },
    {
        title: 'MirAI Music Game',
        desc: 'Bản prototype game nhịp điệu',
        link: '/games',
        image: '/Banner/Banner2.png',
        banner: 2
    },
    {
        title: 'Project S (Prototype)',
        desc: 'Bản prototype game bài',
        link: 'https://www.facebook.com/share/v/1GDwqWwFaW/',
        image: '/Banner/Banner3.png',
        banner: 3
    },
];

function Home({ onNavigate }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const carouselRef = useRef(null);
    const [reducedMotion] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    // Tự chạy mặc định, trừ khi người dùng bật "giảm chuyển động"; luôn có nút tạm dừng (WCAG 2.2.2).
    const [isPlaying, setIsPlaying] = useState(!reducedMotion);
    const [isInteracting, setIsInteracting] = useState(false);

    // Navigate to the next slide
    const nextSlide = useCallback(() => {
        setCurrentIndex((prevIndex) => 
            prevIndex === Banner.length - 1 ? 0 : prevIndex + 1
        );
    }, []);

    // Navigate to the previous slide
    const prevSlide = () => {
        setCurrentIndex((prevIndex) => 
            prevIndex === 0 ? Banner.length - 1 : prevIndex - 1
        );
    };

    // Auto-scroll effect (changes slide every 5 seconds); paused on hover/focus or when turned off
    useEffect(() => {
        if (!isPlaying || isInteracting) {
            return undefined;
        }

        const interval = setInterval(() => {
            nextSlide();
        }, 5000);

        // Clear the interval if the component unmounts to prevent memory leaks
        return () => clearInterval(interval);
    }, [nextSlide, isPlaying, isInteracting]);

    // Scroll the container when currentIndex changes
    useEffect(() => {
        if (carouselRef.current) {
            const scrollAmount = carouselRef.current.clientWidth * currentIndex;
            carouselRef.current.scrollTo({
                left: scrollAmount,
                behavior: reducedMotion ? 'auto' : 'smooth'
            });
        }
    }, [currentIndex, reducedMotion]);

    return (
        <div className="home-page">
            <section className="home-hero">
                <div
                    className="home-carousel"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label="Dự án nổi bật"
                    onMouseEnter={() => setIsInteracting(true)}
                    onMouseLeave={() => setIsInteracting(false)}
                    onFocus={() => setIsInteracting(true)}
                    onBlur={() => setIsInteracting(false)}
                >
                    {/* Attach the ref here */}
                    <div className="home-carousel__slide" ref={carouselRef}>
                        {Banner.map((banner) => (
                            <div key={banner.banner} className="home-banner">
                                <img src={banner.image} alt={banner.title} className="home-banner-img" />
                                <div className="home-banner-content">
                                    <h2>{banner.title}</h2>
                                    <p>{banner.desc}</p>
                                    {banner.link.startsWith('/') ? (
                                        <Link to={banner.link} className="home-banner-link">
                                            Khám phá
                                        </Link>
                                    ) : (
                                        <a href={banner.link} target="_blank" rel="noopener noreferrer" className="home-banner-link">
                                            Xem thêm
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="home-carousel-btn pause"
                        onClick={() => setIsPlaying((playing) => !playing)}
                        aria-label={isPlaying ? 'Tạm dừng trình chiếu' : 'Phát trình chiếu'}
                    >
                        {isPlaying ? '\u275A\u275A' : '\u25B6'}
                    </button>

                    {/* Navigation Arrows */}
                    <button className="home-carousel-btn prev" onClick={prevSlide} aria-label="Slide trước">
                        &#10094;
                    </button>
                    <button className="home-carousel-btn next" onClick={nextSlide} aria-label="Slide sau">
                        &#10095;
                    </button>

                    {/* Navigation Dots (Optional but good for UX) */}
                    <div className="home-carousel-indicators">
                        {Banner.map((_, index) => (
                            <button 
                                key={index} 
                                className={`home-carousel-dot ${index === currentIndex ? 'active' : ''}`}
                                onClick={() => setCurrentIndex(index)}
                                aria-label={`Tới slide ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="home-copy">
                    <p className="home-eyebrow">Bạn đồng hành ảo</p>
                    <h1>Chào bạn, mình là Mirai.</h1>
                    <p className="home-lead">
                        Mình nói tiếng Việt, biết biểu cảm và sống ngay trong trình duyệt của bạn. Ghé trò chuyện,
                        xem mình được làm ra sao, hoặc thử game nhạc nhỏ của Tamek nhé.
                    </p>
                    <div className="home-actions">
                        <button type="button" className="home-primary" onClick={() => onNavigate(1)}>
                            Trò chuyện với Mirai
                        </button>
                        <button type="button" className="home-secondary" onClick={() => onNavigate(3)}>
                            Chơi game nhạc
                        </button>
                    </div>
                </div>
            </section>

            <section className="home-grid">
                {featureCards.map((card) => (
                    <article className="home-card" key={card.title}>
                        <p className="home-card-label">Bắt đầu</p>
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                        <button type="button" className="home-card-button" onClick={() => onNavigate(card.page)}>
                            Mở
                        </button>
                    </article>
                ))}
            </section>
        </div>
    );
}

export default Home;