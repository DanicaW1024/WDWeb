/* ─────────────────────────────────────────────────────────────
   DAN WANG — PORTFOLIO
   Minimal interface behaviour, navigation and intro choreography.
──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SESSION_KEY = 'dw-intro-complete';
  var logoSrc = window.WD_LOGO_DATA_URI || 'assets/wd-logo@3x.png';
  var prefersReduced = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var intro = document.getElementById('intro');
  var introBg = document.getElementById('introBg');
  var introCanvas = document.getElementById('introCanvas');
  var skipIntroButton = document.getElementById('skipIntro');
  var heroCanvas = document.getElementById('heroCanvas');
  var heroVisual = document.querySelector('.hero__visual');
  var logoStage = document.getElementById('logoStage');
  var siteHeader = document.getElementById('siteHeader');
  var mobileMenu = document.getElementById('mobileMenu');
  var menuToggle = document.getElementById('menuToggle');
  var toast = document.getElementById('toast');
  var toastText = document.getElementById('toastText');
  var localTime = document.getElementById('localTime');

  var introEngine = null;
  var heroEngine = null;
  var introTimeline = null;
  var introStarted = false;
  var introFinished = false;
  var heroStarted = false;
  var heroRevealed = false;
  var toastTimer = null;
  var toastResetTimer = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeSessionGet() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (error) { return null; }
  }

  function safeSessionSet() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (error) { /* no-op */ }
  }

  function wait(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  /* ───────────────────────────── Navigation ─────────────────────── */
  function initNavigation() {
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
    var ticking = false;

    function update() {
      var y = window.scrollY || window.pageYOffset;
      var marker = y + window.innerHeight * 0.35;
      var activeId = sections.length ? sections[0].id : 'home';

      for (var i = 0; i < sections.length; i += 1) {
        if (sections[i].offsetTop <= marker) activeId = sections[i].id;
      }
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0 && y >= maxScroll - 4) activeId = 'contact';

      navLinks.forEach(function (link) {
        var active = link.getAttribute('data-section') === activeId;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function closeMobileMenu() {
    if (!mobileMenu.classList.contains('is-open')) return;
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
  }

  function openMobileMenu() {
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
  }

  function initMobileMenu() {
    menuToggle.addEventListener('click', function () {
      if (mobileMenu.classList.contains('is-open')) closeMobileMenu();
      else openMobileMenu();
    });

    document.querySelectorAll('[data-mobile-link]').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1040) closeMobileMenu();
    }, { passive: true });
  }

  function initSmoothScroll() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      closeMobileMenu();
      target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
      try {
        if (history.replaceState) history.replaceState(null, '', hash);
      } catch (error) { /* file:// URLs can reject history updates. */ }
    });
  }

  /* ───────────────────────────── Reveals ─────────────────────────── */
  function initRevealObserver() {
    var elements = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (element) { element.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    elements.forEach(function (element) { observer.observe(element); });
  }

  /* ─────────────────────────── Hero copy ─────────────────────────── */
  function animateHeroCopy(delay) {
    if (heroRevealed) return;
    heroRevealed = true;
    var elements = document.querySelectorAll('.hero__grid [data-hero-reveal]');
    if (!elements.length) return;

    if (prefersReduced || !window.gsap) {
      elements.forEach(function (element) {
        element.style.opacity = '1';
        element.style.transform = 'none';
      });
      return;
    }

    gsap.fromTo(elements, {
      opacity: 0,
      y: 22
    }, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.075,
      delay: typeof delay === 'number' ? delay : 0.1,
      clearProps: 'transform'
    });
  }

  /* ─────────────────────────── Particle logo ─────────────────────── */
  function initHeroParticles() {
    if (!window.WDParticleLogo || !heroCanvas) {
      document.body.classList.add('no-webgl');
      return;
    }

    var mobile = window.innerWidth < 700;
    heroEngine = new WDParticleLogo(heroCanvas, {
      src: logoSrc,
      count: mobile ? 4400 : 18000,
      widthRatio: 1,
      heightRatio: 1,
      maxWidth: mobile ? 450 : 980,
      sizeScale: 1.15,
      intensity: 1.18,
      dprCap: 1.75,
      seed: 8192,
      startFormed: true,
      active: false,
      interactive: true,
      onReady: function () {
        if (introFinished || !introStarted) activateHeroEngine();
      }
    });

    if (!heroEngine || !heroEngine.supported) {
      document.body.classList.add('no-webgl');
      return;
    }

    heroEngine.readyPromise.catch(function () {
      document.body.classList.add('no-webgl');
    });

    if (window.IntersectionObserver) {
      var visibility = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          heroEngine.setInView(entry.isIntersecting);
        });
      }, { threshold: 0.02 });
      visibility.observe(logoStage);
    }

    logoStage.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      heroEngine.setPointer(event.clientX, event.clientY);
    }, { passive: true });

    logoStage.addEventListener('pointerleave', function () {
      heroEngine.clearPointer();
    });

    logoStage.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'touch') return;
      heroEngine.setPointer(event.clientX, event.clientY);
      if (heroEngine.pointer.over) heroEngine.burst();
    }, { passive: true });
  }

  function activateHeroEngine() {
    if (heroVisual) heroVisual.classList.add('is-visible');
    if (!heroEngine || heroStarted) return;
    heroStarted = true;
    heroEngine.setActive(true);
    heroCanvas.classList.add('is-live');
  }

  /* ───────────────────────────── Intro ───────────────────────────── */
  function revealSite(delay) {
    document.body.classList.add('site-ready');
    animateHeroCopy(delay);
  }

  function flyIntroLogoToHero() {
    if (!introEngine || !heroEngine || !window.gsap) return;
    if (window.innerWidth < 861) return;

    var rect = logoStage.getBoundingClientRect();
    var targetX = rect.left + rect.width / 2 - window.innerWidth / 2;
    var targetY = -(rect.top + rect.height / 2 - window.innerHeight / 2);
    var targetWidth = Math.min(
      rect.width * heroEngine.config.widthRatio,
      rect.height * heroEngine.config.heightRatio * introEngine.logoAspect,
      heroEngine.config.maxWidth
    );
    var targetScale = clamp(targetWidth / introEngine.logoWidth, 0.3, 1.8);

    gsap.to(introEngine.offset, {
      x: targetX,
      y: targetY,
      scale: targetScale,
      duration: 1.65,
      ease: 'power3.inOut'
    });
  }

  function finishIntro(immediate) {
    if (introFinished) return;
    introFinished = true;
    document.body.classList.remove('intro-active');
    revealSite();
    activateHeroEngine();

    intro.setAttribute('aria-hidden', 'true');
    intro.classList.add('is-finished');
    document.documentElement.dataset.intro = 'played';

    if (introEngine) introEngine.setActive(false);
    if (immediate) {
      intro.style.display = 'none';
    }

    window.setTimeout(function () {
      if (introEngine) {
        introEngine.destroy();
        introEngine = null;
      }
      if (!immediate) intro.style.display = 'none';
    }, 1000);
  }

  function skipIntro() {
    if (introFinished) return;
    if (introTimeline) introTimeline.kill();
    revealSite(0.05);
    activateHeroEngine();

    if (window.gsap) {
      gsap.to(intro, { opacity: 0, duration: 0.35, ease: 'power2.out' });
      window.setTimeout(function () { finishIntro(false); }, 360);
    } else {
      finishIntro(true);
    }
  }

  function playIntro() {
    if (!window.WDParticleLogo || !window.gsap || !introCanvas) {
      finishIntro(true);
      return;
    }
    if (prefersReduced || safeSessionGet() === '1') {
      finishIntro(true);
      return;
    }

    safeSessionSet();
    introStarted = true;
    var mobile = window.innerWidth < 700;

    try {
      introEngine = new WDParticleLogo(introCanvas, {
        src: logoSrc,
        count: mobile ? 4200 : 7200,
        widthRatio: mobile ? 0.82 : 0.56,
        heightRatio: 0.64,
        maxWidth: mobile ? 400 : 640,
        dprCap: 1.8,
        seed: 12021,
        startFormed: false,
        active: false,
        interactive: false
      });

      if (!introEngine.supported) {
        finishIntro(true);
        return;
      }

      Promise.race([
        introEngine.readyPromise,
        wait(5000).then(function () { throw new Error('Particle engine timed out'); })
      ]).then(function () {
        if (!introFinished) startIntroTimeline();
      }).catch(function () {
        finishIntro(true);
      });
    } catch (error) {
      finishIntro(true);
    }
  }

  function startIntroTimeline() {
    introEngine.setActive(true);
    introEngine.setReveal(0.008);

    var reveal = { value: 0.008 };

    introTimeline = gsap.timeline({
      onComplete: function () { finishIntro(false); }
    });

    // A quiet cloud appears around the final mark.
    introTimeline.to(reveal, {
      value: 1,
      duration: 1.1,
      ease: 'power1.inOut',
      onUpdate: function () {
        introEngine.setReveal(reveal.value);
      }
    }, 0.15);

    // Gather smoothly, then hold for half a second.
    introTimeline.call(function () {
      introEngine.formLogo();
    }, null, 1.5);

    // Move the finished mark right while the page is revealed behind it.
    introTimeline.call(function () {
      flyIntroLogoToHero();
    }, null, 3.5);

    introTimeline.to(introBg, {
      opacity: 0,
      duration: 1.15,
      ease: 'power2.inOut'
    }, 3.55);

    introTimeline.to('.intro-vignette', {
      opacity: 0,
      duration: 1,
      ease: 'power2.inOut'
    }, 3.55);

    introTimeline.call(function () {
      revealSite(0.35);
    }, null, 3.65);

    if (window.innerWidth < 861) {
      introTimeline.to(introCanvas, {
        opacity: 0,
        duration: 1,
        ease: 'power2.inOut'
      }, 3.65);
    }

    introTimeline.call(function () {
      activateHeroEngine();
    }, null, 5.0);

    introTimeline.to(intro, {
      opacity: 0,
      duration: 0.8,
      ease: 'power2.inOut'
    }, 5.2);
  }

  /* ─────────────────────────── Copy buttons ─────────────────────── */
  function showToast(message) {
    if (!toast) return;
    toastText.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    var success = false;
    try { success = document.execCommand('copy'); } catch (error) { success = false; }
    document.body.removeChild(textarea);
    return success;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function initCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(function (button) {
      button.addEventListener('click', function () {
        copyText(button.getAttribute('data-copy')).then(function (success) {
          if (!success) {
            showToast('Copy unavailable — select the text manually');
            return;
          }
          showToast('Copied to clipboard');
          var original = button.textContent;
          button.textContent = 'Copied';
          button.classList.add('is-copied');
          window.clearTimeout(toastResetTimer);
          toastResetTimer = window.setTimeout(function () {
            button.textContent = original;
            button.classList.remove('is-copied');
          }, 1800);
        });
      });
    });
  }

  /* ───────────────────────────── Clock ──────────────────────────── */
  function initClock() {
    var formatter;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Hong_Kong',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      formatter = null;
    }

    function tick() {
      if (!localTime) return;
      var now = new Date();
      localTime.textContent = formatter ? formatter.format(now) : now.toTimeString().slice(0, 8);
    }
    tick();
    window.setInterval(tick, 1000);

    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* ───────────────────────────── Boot ───────────────────────────── */
  function init() {
    document.body.classList.add('intro-active');
    initNavigation();
    initMobileMenu();
    initSmoothScroll();
    initRevealObserver();
    initCopyButtons();
    initClock();
    initHeroParticles();

    if (window.gsap && !prefersReduced) {
      gsap.set('[data-hero-reveal]', { opacity: 0, y: 22 });
    }

    skipIntroButton.addEventListener('click', skipIntro);
    intro.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      skipIntro();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (mobileMenu.classList.contains('is-open')) {
          closeMobileMenu();
          menuToggle.focus();
        } else if (!introFinished) {
          skipIntro();
        }
      }
    });

    if (prefersReduced || safeSessionGet() === '1') {
      finishIntro(true);
      return;
    }

    playIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
