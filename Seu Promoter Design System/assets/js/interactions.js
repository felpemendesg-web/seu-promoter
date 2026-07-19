document.addEventListener('DOMContentLoaded', () => {

  // 0. Mobile Nav Toggle — roda primeiro e isolado, para que uma falha em
  // qualquer outro bloco abaixo (lucide, carrossel, etc.) nunca impeça o
  // menu mobile de funcionar.
  try {
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const navLinksList = document.querySelector('.nav-links');
    if (mobileNavToggle && navLinksList) {
      mobileNavToggle.addEventListener('click', () => {
        const isOpen = navLinksList.classList.toggle('open');
        mobileNavToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // site-nav.js substitui o conteúdo de .nav-links dinamicamente — delegação
      // no elemento pai (que não muda) mantém o fechar-ao-clicar funcionando.
      navLinksList.addEventListener('click', (e) => {
        if (e.target.closest('a')) {
          navLinksList.classList.remove('open');
          mobileNavToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  } catch (err) {
    console.error('Mobile nav toggle setup falhou:', err);
  }

  // 1. Scroll Reveal Logic
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // 2. Navbar Scroll Effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.padding = '0.5rem 0';
        navbar.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      } else {
        navbar.style.padding = '1rem 0';
        navbar.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
      }
    });
  }

  // 3. Initialize Lucide Icons if available
  // Envolvido em try/catch: uma falha aqui (ícone inválido, lib não carregada
  // por bloqueio de rede, etc.) não pode travar o resto desta função.
  if (typeof lucide !== 'undefined') {
    try {
      lucide.createIcons();
    } catch (err) {
      console.error('lucide.createIcons() falhou:', err);
    }
  }

  // 4. Featured Carousel Sync & Interaction
  const container = document.querySelector('.carousel-container');
  const grid = container?.querySelector('.featured-grid');
  const cards = container?.querySelectorAll('.event-card-featured');
  const dotsContainer = container?.querySelector('.carousel-dots');
  const prevBtn = container?.querySelector('.carousel-arrow.prev');
  const nextBtn = container?.querySelector('.carousel-arrow.next');
  
  if (container && grid && cards.length > 0 && dotsContainer) {
    let isScrolling = false;
    let dots = [];

    function setupCarousel() {
      const maxScrollLeft = grid.scrollWidth - grid.clientWidth;
      
      // Hide arrows and dots if there is no overflow
      if (maxScrollLeft <= 0) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        dotsContainer.style.display = 'none';
        return;
      } else {
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        dotsContainer.style.display = 'flex';
      }

      const cardWidth = cards[0].offsetWidth;
      const gridWidth = grid.clientWidth;
      
      // Calculate how many cards are visible
      const visibleCards = Math.max(1, Math.round(gridWidth / cardWidth));
      // Pages count represents the number of discrete scrollable positions
      const pagesCount = Math.max(1, cards.length - visibleCards + 1);

      // Generate the exact number of dots dynamically
      dotsContainer.innerHTML = '';
      for (let i = 0; i < pagesCount; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        if (i === 0) dot.classList.add('active');
        dotsContainer.appendChild(dot);
      }
      dots = dotsContainer.querySelectorAll('.dot');

      // Bind click events to dynamically created dots
      dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          const maxScrollLeft = grid.scrollWidth - grid.clientWidth;
          if (maxScrollLeft <= 0) return;
          
          // Calculate scroll target for this specific index
          const targetScrollLeft = (index / (dots.length - 1)) * maxScrollLeft;
          
          grid.scrollTo({
            left: targetScrollLeft,
            behavior: 'smooth'
          });
        });
      });

      updateActiveDot();
    }

    function updateActiveDot() {
      const maxScrollLeft = grid.scrollWidth - grid.clientWidth;
      if (maxScrollLeft <= 0 || dots.length === 0) return;
      
      const scrollLeft = grid.scrollLeft;
      // Map scroll percentage to active dot
      const percentage = scrollLeft / maxScrollLeft;
      const activeIndex = Math.min(dots.length - 1, Math.max(0, Math.round(percentage * (dots.length - 1))));
      
      dots.forEach((dot, index) => {
        if (index === activeIndex) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
    
    // Add scroll event listener to update dots
    grid.addEventListener('scroll', () => {
      if (!isScrolling) {
        window.requestAnimationFrame(() => {
          updateActiveDot();
          isScrolling = false;
        });
        isScrolling = true;
      }
    });

    window.addEventListener('resize', setupCarousel);
    
    // Initial run to generate dots and set correct state
    setupCarousel();
    
    // Arrow button click events
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const gap = parseFloat(window.getComputedStyle(grid).gap) || 0;
        const cardWidth = cards[0]?.offsetWidth || 300;
        grid.scrollBy({
          left: -(cardWidth + gap),
          behavior: 'smooth'
        });
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const gap = parseFloat(window.getComputedStyle(grid).gap) || 0;
        const cardWidth = cards[0]?.offsetWidth || 300;
        grid.scrollBy({
          left: cardWidth + gap,
          behavior: 'smooth'
        });
      });
    }
  }

  // 5. Main Banner Carousel Logic
  const bannerCarousel = document.querySelector('.main-banner-carousel');
  if (bannerCarousel) {
    const track = bannerCarousel.querySelector('.main-banner-track');
    const slides = bannerCarousel.querySelectorAll('.main-banner-slide');
    const prevBtn = bannerCarousel.querySelector('.main-banner-arrow.prev');
    const nextBtn = bannerCarousel.querySelector('.main-banner-arrow.next');
    const dots = bannerCarousel.querySelectorAll('.banner-dot');
    
    let currentIndex = 0;
    const slideCount = slides.length;
    let autoplayTimer = null;

    function updateCarousel(index) {
      if (index < 0) {
        currentIndex = slideCount - 1;
      } else if (index >= slideCount) {
        currentIndex = 0;
      } else {
        currentIndex = index;
      }

      track.style.transform = `translateX(-${currentIndex * 100}%)`;

      dots.forEach((dot, idx) => {
        if (idx === currentIndex) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }

    function nextSlide() {
      updateCarousel(currentIndex + 1);
    }

    function prevSlide() {
      updateCarousel(currentIndex - 1);
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(nextSlide, 5000);
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
      }
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        startAutoplay();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        startAutoplay();
      });
    }

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        updateCarousel(idx);
        startAutoplay();
      });
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    bannerCarousel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoplay();
    }, { passive: true });

    bannerCarousel.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
      startAutoplay();
    }, { passive: true });

    function handleSwipe() {
      const swipeDistance = touchEndX - touchStartX;
      if (swipeDistance > 50) {
        prevSlide();
      } else if (swipeDistance < -50) {
        nextSlide();
      }
    }

    startAutoplay();

    bannerCarousel.addEventListener('mouseenter', stopAutoplay);
    bannerCarousel.addEventListener('mouseleave', startAutoplay);
  }
});
