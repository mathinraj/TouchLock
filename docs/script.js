document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.feature-card, .step, .install-card').forEach(el => {
    observer.observe(el);
  });

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Screenshot carousel
  const track = document.getElementById('screenshot-track');
  const dotsContainer = document.getElementById('screenshot-dots');
  const prevBtn = document.getElementById('screenshot-prev');
  const nextBtn = document.getElementById('screenshot-next');

  if (track && dotsContainer) {
    const slides = track.querySelectorAll('.screenshot-slide');
    const totalSlides = slides.length;
    let currentSlide = 0;
    let autoplayInterval;

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.classList.add('screenshot-dot');
      if (i === 0) dot.classList.add('active');
      dot.setAttribute('aria-label', `Go to screenshot ${i + 1}`);
      dot.addEventListener('click', () => goToSlide(i));
      dotsContainer.appendChild(dot);
    });

    function goToSlide(index) {
      currentSlide = ((index % totalSlides) + totalSlides) % totalSlides;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      dotsContainer.querySelectorAll('.screenshot-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
      });
    }

    prevBtn.addEventListener('click', () => {
      goToSlide(currentSlide - 1);
      resetAutoplay();
    });

    nextBtn.addEventListener('click', () => {
      goToSlide(currentSlide + 1);
      resetAutoplay();
    });

    function startAutoplay() {
      autoplayInterval = setInterval(() => goToSlide(currentSlide + 1), 4000);
    }

    function resetAutoplay() {
      clearInterval(autoplayInterval);
      startAutoplay();
    }

    startAutoplay();

    // Pause autoplay on hover
    const gallery = track.closest('.screenshot-gallery');
    gallery.addEventListener('mouseenter', () => clearInterval(autoplayInterval));
    gallery.addEventListener('mouseleave', startAutoplay);

    // Swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    gallery.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    gallery.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) goToSlide(currentSlide + 1);
        else goToSlide(currentSlide - 1);
        resetAutoplay();
      }
    }, { passive: true });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      const galleryRect = gallery.getBoundingClientRect();
      const isVisible = galleryRect.top < window.innerHeight && galleryRect.bottom > 0;
      if (!isVisible) return;

      if (e.key === 'ArrowLeft') { goToSlide(currentSlide - 1); resetAutoplay(); }
      if (e.key === 'ArrowRight') { goToSlide(currentSlide + 1); resetAutoplay(); }
    });
  }
});
