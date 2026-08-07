import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

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
];

const Banner = [
    {
        title: 'MirAI',
        desc: 'Web-based 3D Interactive Avatar',
        link: 'https://tamek-mirai.io.vn/chat',
        image: '/Banner/Banner1.png',
        banner: 1
    },
    {
        title: 'MirAI Music Game',
        desc: 'A Rhythm Game Prototype',
        link: 'https://tamek-mirai.io.vn/games',
        image: '/Banner/Banner2.png',
        banner: 2
    },
    {
        title: 'Project S (Prototype)',
        desc: 'Card Game Prototype',
        link: 'https://www.facebook.com/share/v/1GDwqWwFaW/',
        image: '/Banner/Banner3.png',
        banner: 3
    },
];

function Home({ onNavigate }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const carouselRef = useRef(null);

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

    // Auto-scroll effect (changes slide every 5 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            nextSlide();
        }, 5000); 

        // Clear the interval if the component unmounts to prevent memory leaks
        return () => clearInterval(interval);
    }, [nextSlide]);

    // Scroll the container when currentIndex changes
    useEffect(() => {
        if (carouselRef.current) {
            const scrollAmount = carouselRef.current.clientWidth * currentIndex;
            carouselRef.current.scrollTo({
                left: scrollAmount,
                behavior: 'smooth'
            });
        }
    }, [currentIndex]);

    return (
        <main className="home-page">
            <section className="home-hero">
                <div className="home-carousel">
                    {/* Attach the ref here */}
                    <div className="home-carousel__slide" ref={carouselRef}>
                        {Banner.map((banner) => (
                            <div key={banner.banner} className="home-banner">
                                <img src={banner.image} alt={banner.title} className="home-banner-img" />
                                <div className="home-banner-content">
                                    <h2>{banner.title}</h2>
                                    <p>{banner.desc}</p>
                                    <a href={banner.link} target="_blank" rel="noopener noreferrer" className="home-banner-link">
                                        Learn more
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Navigation Arrows */}
                    <button className="home-carousel-btn prev" onClick={prevSlide} aria-label="Previous slide">
                        &#10094;
                    </button>
                    <button className="home-carousel-btn next" onClick={nextSlide} aria-label="Next slide">
                        &#10095;
                    </button>

                    {/* Navigation Dots (Optional but good for UX) */}
                    <div className="home-carousel-indicators">
                        {Banner.map((_, index) => (
                            <button 
                                key={index} 
                                className={`home-carousel-dot ${index === currentIndex ? 'active' : ''}`}
                                onClick={() => setCurrentIndex(index)}
                                aria-label={`Go to slide ${index + 1}`}
                            />
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
    );
}

export default Home;