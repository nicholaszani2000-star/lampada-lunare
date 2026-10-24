/* =====================================================================
   Lampada Lunare Levitante · luna-landing.js
   Senza dipendenze, caricato con defer dal layout luna-landing.
   - Registro dei componenti: init al DOMContentLoaded e su shopify:section:load,
     distruzione (listener, observer, requestAnimationFrame) su shopify:section:unload.
   - Comparsa allo scroll, header con luna-progresso, date in italiano,
     bus della luce 'luna:light', caricatore pigro con import(), stato di caricamento delle CTA.
   ===================================================================== */
(function () {
  'use strict';

  var Luna = (window.Luna = window.Luna || {});
  var doc = document;
  var root = doc.documentElement;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  Luna.reducedMotion = function () {
    return !!(motionQuery && motionQuery.matches);
  };

  Luna.isDesignMode = function () {
    return !!(window.Shopify && window.Shopify.designMode);
  };

  /* 1. Ambito di un componente: raccoglie tutto quello che va smontato ----- */
  function createScope() {
    var cleanups = [];
    var frames = new Set();

    return {
      on: function (target, type, handler, options) {
        target.addEventListener(type, handler, options);
        cleanups.push(function () {
          target.removeEventListener(type, handler, options);
        });
      },
      observe: function (observer) {
        cleanups.push(function () {
          observer.disconnect();
        });
        return observer;
      },
      frame: function (callback) {
        var id = requestAnimationFrame(function (time) {
          frames.delete(id);
          callback(time);
        });
        frames.add(id);
        return id;
      },
      add: function (cleanup) {
        cleanups.push(cleanup);
      },
      destroy: function () {
        frames.forEach(function (id) {
          cancelAnimationFrame(id);
        });
        frames.clear();
        while (cleanups.length) {
          try {
            cleanups.pop()();
          } catch (error) {
            console.error('[Luna] cleanup', error);
          }
        }
      },
    };
  }

  /* 2. Registro dei componenti -------------------------------------------- */
  var registry = [];
  var mounted = new Map();
  var started = false;

  function collect(container, selector) {
    var nodes = [];
    if (container.nodeType === 1 && container.matches(selector)) nodes.push(container);
    if (container.querySelectorAll) {
      container.querySelectorAll(selector).forEach(function (node) {
        nodes.push(node);
      });
    }
    return nodes;
  }

  function mount(container, entries) {
    (entries || registry).forEach(function (entry) {
      collect(container, entry.selector).forEach(function (element) {
        var list = mounted.get(element) || [];
        if (list.some(function (item) { return item.name === entry.name; })) return;
        var scope = createScope();
        try {
          entry.setup(element, scope);
        } catch (error) {
          console.error('[Luna] ' + entry.name, error);
          scope.destroy();
          return;
        }
        list.push({ name: entry.name, scope: scope });
        mounted.set(element, list);
      });
    });
  }

  function unmount(container) {
    mounted.forEach(function (list, element) {
      if (container === element || (container.contains && container.contains(element))) {
        list.forEach(function (item) {
          item.scope.destroy();
        });
        mounted.delete(element);
      }
    });
  }

  Luna.register = function (name, selector, setup) {
    var entry = { name: name, selector: selector, setup: setup };
    registry.push(entry);
    if (started) mount(doc, [entry]);
  };

  Luna.mount = function (container) {
    mount(container || doc);
  };

  Luna.unmount = function (container) {
    unmount(container || doc);
  };

  function start() {
    if (started) return;
    started = true;
    mount(doc);
  }

  if (doc.readyState === 'complete') {
    start();
  } else {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
  }

  doc.addEventListener('shopify:section:load', function (event) {
    mount(event.target);
  });

  doc.addEventListener('shopify:section:unload', function (event) {
    unmount(event.target);
  });

  /* 3. Bus della luce: hero e luna 3D restano sincronizzate ---------------- */
  var light = (Luna.light = { power: 0, color: '' });

  Luna.setLight = function (detail) {
    detail = detail || {};
    var power = Math.min(1, Math.max(0, Number(detail.power) || 0));
    var color = detail.color || light.color || getComputedStyle(root).getPropertyValue('--luna-light').trim();
    light.power = power;
    light.color = color;
    root.style.setProperty('--luna-power', String(power));
    if (detail.color) root.style.setProperty('--luna-light', detail.color);
    doc.dispatchEvent(
      new CustomEvent('luna:light', {
        detail: { power: power, color: color, source: detail.source || null },
      })
    );
  };

  Luna.onLight = function (handler, scope) {
    var listener = function (event) {
      handler(event.detail);
    };
    doc.addEventListener('luna:light', listener);
    var off = function () {
      doc.removeEventListener('luna:light', listener);
    };
    if (scope) scope.add(off);
    return off;
  };

  /* 4. Caricatore pigro: import() quando l'elemento è vicino al viewport --- */
  Luna.lazyImport = function (element, url, options) {
    options = options || {};
    var distance = options.distance == null ? 400 : options.distance;
    var observer = null;
    var cancelled = false;

    var promise = new Promise(function (resolve, reject) {
      function load() {
        if (cancelled) return;
        // import() vuole un URL assoluto (o che inizi con / ./ ../): asset_url di Shopify dà //cdn…
        import(new URL(url, document.baseURI).href).then(resolve, reject);
      }
      if (!('IntersectionObserver' in window)) {
        load();
        return;
      }
      observer = new IntersectionObserver(
        function (entries) {
          if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
          observer.disconnect();
          observer = null;
          load();
        },
        { rootMargin: distance + 'px 0px ' + distance + 'px 0px' }
      );
      observer.observe(element);
    });

    var handle = {
      promise: promise,
      cancel: function () {
        cancelled = true;
        if (observer) observer.disconnect();
        observer = null;
      },
    };
    if (options.scope) options.scope.add(handle.cancel);
    return handle;
  };

  /* 5. Date in italiano: consegna stimata, scadenza di Natale, countdown --- */
  var TIME_ZONE = 'Europe/Rome';
  var formatters = {};
  var PRESETS = {
    giorno: { weekday: 'long', day: 'numeric', month: 'long' },
    breve: { weekday: 'short', day: 'numeric', month: 'short' },
    data: { day: 'numeric', month: 'long' },
    completa: { day: 'numeric', month: 'long', year: 'numeric' },
  };

  function formatter(options) {
    var key = JSON.stringify(options);
    if (!formatters[key]) {
      formatters[key] = new Intl.DateTimeFormat('it-IT', Object.assign({ timeZone: TIME_ZONE }, options));
    }
    return formatters[key];
  }

  function zoneParts(date) {
    var parts = {};
    formatter({
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .forEach(function (part) {
        parts[part.type] = Number(part.value);
      });
    return parts;
  }

  // Un giorno del calendario come Date alle 12:00 UTC: stesso giorno anche a Roma, al riparo dall'ora legale
  function calendarDay(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function addDays(date, amount) {
    var copy = new Date(date.getTime());
    copy.setUTCDate(copy.getUTCDate() + amount);
    return copy;
  }

  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return calendarDay(year, month, day);
  }

  // Festività nazionali italiane, più il lunedì dell'Angelo
  var FIXED_HOLIDAYS = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];

  function isHoliday(date) {
    var key = String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
    if (FIXED_HOLIDAYS.indexOf(key) !== -1) return true;
    var easterMonday = addDays(easterSunday(date.getUTCFullYear()), 1);
    return easterMonday.getTime() === date.getTime();
  }

  function isBusinessDay(date) {
    var weekday = date.getUTCDay();
    return weekday !== 0 && weekday !== 6 && !isHoliday(date);
  }

  var dates = (Luna.dates = {
    timeZone: TIME_ZONE,

    /** Oggi nel calendario italiano. */
    today: function (now) {
      var parts = zoneParts(now || new Date());
      return calendarDay(parts.year, parts.month, parts.day);
    },

    /** '2026-12-03' → giorno del calendario. */
    parseDay: function (value) {
      var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
      return match ? calendarDay(Number(match[1]), Number(match[2]), Number(match[3])) : null;
    },

    /** '2026-12-18' e '23:59' in ora italiana → istante preciso (Date). */
    zonedDateTime: function (day, time) {
      var dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '').trim());
      if (!dayMatch) return null;
      var timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(time || '00:00').trim()) || [0, 0, 0];
      var wall = Date.UTC(
        Number(dayMatch[1]),
        Number(dayMatch[2]) - 1,
        Number(dayMatch[3]),
        Number(timeMatch[1]),
        Number(timeMatch[2])
      );
      var instant = wall;
      // Due passaggi bastano per trovare lo scarto giusto anche a cavallo dell'ora legale
      for (var pass = 0; pass < 2; pass++) {
        var p = zoneParts(new Date(instant));
        var shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        instant += wall - shown;
      }
      return new Date(instant);
    },

    isBusinessDay: isBusinessDay,
    isHoliday: isHoliday,

    /** Aggiunge giorni lavorativi (niente sabati, domeniche e festività nazionali). */
    addBusinessDays: function (start, amount) {
      var date = new Date(start.getTime());
      var left = Math.max(0, Math.floor(amount));
      while (left > 0) {
        date = addDays(date, 1);
        if (isBusinessDay(date)) left -= 1;
      }
      return date;
    },

    /** Giorno di spedizione: oggi se lavorativo e prima dell'ora limite, altrimenti il primo lavorativo dopo. */
    dispatchDay: function (cutoffHour, now) {
      var parts = zoneParts(now || new Date());
      var day = calendarDay(parts.year, parts.month, parts.day);
      var late = cutoffHour !== undefined && cutoffHour !== null && parts.hour >= cutoffHour;
      if (late || !isBusinessDay(day)) {
        do {
          day = addDays(day, 1);
        } while (!isBusinessDay(day));
      }
      return day;
    },

    /** Finestra di consegna: giorno di spedizione + min e + max giorni lavorativi. */
    deliveryWindow: function (minDays, maxDays, now, cutoffHour) {
      var start = dates.dispatchDay(cutoffHour, now);
      return { from: dates.addBusinessDays(start, minDays), to: dates.addBusinessDays(start, maxDays) };
    },

    /** Formatta in italiano: preset 'giorno', 'breve', 'data', 'completa' oppure opzioni di Intl. */
    format: function (date, preset) {
      var options = typeof preset === 'object' && preset ? preset : PRESETS[preset || 'data'];
      return formatter(options).format(date);
    },

    /** Tempo che manca a un istante: { total, days, hours, minutes, seconds, done }. */
    countdown: function (target, now) {
      var total = Math.max(0, target.getTime() - (now ? now.getTime() : Date.now()));
      return {
        total: total,
        days: Math.floor(total / 86400000),
        hours: Math.floor(total / 3600000) % 24,
        minutes: Math.floor(total / 60000) % 60,
        seconds: Math.floor(total / 1000) % 60,
        done: total === 0,
      };
    },

    pad: function (value) {
      return String(value).padStart(2, '0');
    },
  });

  /* 6. Comparsa allo scroll ------------------------------------------------ */
  var revealObserver = null;
  var revealStep = null;

  function getRevealObserver() {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.remove('is-pending');
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
      );
    }
    return revealObserver;
  }

  Luna.register('reveal', '.luna-reveal', function (element, scope) {
    if (!('IntersectionObserver' in window) || Luna.reducedMotion() || Luna.isDesignMode()) return;
    // Quello che è già sullo schermo resta com'è: niente sfarfallio al primo caricamento
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    if (revealStep === null) {
      revealStep = parseFloat(getComputedStyle(root).getPropertyValue('--luna-reveal-step')) || 80;
    }
    var siblings = element.parentElement
      ? Array.prototype.filter.call(element.parentElement.children, function (child) {
          return child.classList.contains('luna-reveal');
        })
      : [element];
    var index = Math.max(0, siblings.indexOf(element));
    element.style.setProperty('--luna-reveal-delay', index * revealStep + 'ms');
    element.classList.add('is-pending');

    var observer = getRevealObserver();
    observer.observe(element);
    scope.add(function () {
      observer.unobserve(element);
      element.classList.remove('is-pending');
    });
  });

  /* 7. Header: sfondo allo scroll e luna-progresso (§5) -------------------- */
  Luna.register('header', '[data-luna-header]', function (header, scope) {
    var moon = header.querySelector('[data-luna-moon-progress]');
    var shadow = moon ? moon.querySelector('[data-luna-moon-shadow]') : null;
    var centre = moon ? parseFloat(moon.getAttribute('data-centre')) || 16 : 16;
    var travel = moon ? parseFloat(moon.getAttribute('data-travel')) || 24 : 24;
    var pending = false;

    function update() {
      pending = false;
      var scrolled = window.scrollY || root.scrollTop || 0;
      header.classList.toggle('is-scrolled', scrolled > 8);
      if (!shadow) return;
      var max = root.scrollHeight - window.innerHeight;
      // La percentuale di scroll diventa una fase lunare: 0 luna nuova, 1 luna piena
      var phase = max > 0 ? Math.min(1, Math.max(0, scrolled / max)) : 1;
      shadow.setAttribute('cx', (centre - travel * phase).toFixed(2));
      moon.style.setProperty('--luna-moon-glow', phase.toFixed(3));
    }

    function request() {
      if (pending) return;
      pending = true;
      scope.frame(update);
    }

    update();
    scope.on(window, 'scroll', request, { passive: true });
    scope.on(window, 'resize', request, { passive: true });
  });

  /* 8. CTA: stato di caricamento senza bloccare l'invio (§4.5) ------------- */
  Luna.register('buy-form', 'form#luna-buy-form, form[data-luna-buy-form]', function (form, scope) {
    var labels = new Map();
    var timer = 0;

    function buttonsFor() {
      return Array.prototype.filter.call(doc.querySelectorAll('[data-luna-cta]'), function (button) {
        return button.form === form;
      });
    }

    function setBusy(button) {
      var label = button.querySelector('[data-luna-cta-label]');
      button.setAttribute('aria-busy', 'true');
      if (label && !labels.has(button)) {
        labels.set(button, label.innerHTML);
        label.textContent = button.getAttribute('data-loading-text') || label.textContent;
      }
    }

    function reset() {
      clearTimeout(timer);
      form.removeAttribute('data-luna-busy');
      labels.forEach(function (html, button) {
        var label = button.querySelector('[data-luna-cta-label]');
        if (label) label.innerHTML = html;
        button.removeAttribute('aria-busy');
      });
      labels.clear();
    }

    scope.on(form, 'submit', function (event) {
      // Un secondo tocco mentre si parte per il checkout aggiungerebbe un secondo pezzo al carrello
      if (form.hasAttribute('data-luna-busy')) {
        event.preventDefault();
        return;
      }
      var submitter = event.submitter && event.submitter.hasAttribute('data-luna-cta') ? event.submitter : null;
      var button = submitter || buttonsFor()[0];
      form.setAttribute('data-luna-busy', '');
      if (button) setBusy(button);
      setTimeout(function () {
        if (event.defaultPrevented) reset();
      }, 0);
      timer = setTimeout(reset, 10000);
    });

    // Tornando indietro dal checkout la pagina può arrivare dalla cache: bottoni di nuovo pronti
    scope.on(window, 'pageshow', function (event) {
      if (event.persisted) reset();
    });
    scope.add(reset);
  });
  /* 9. Hero: cielo stellato su canvas 2D ----------------------------------- */
  // Due strati di profondità, scintillio lento, parallasse col puntatore (desktop) e con lo scroll,
  // una stella cadente ogni 8–14 secondi. Si ferma quando il palco non si vede o la scheda è nascosta.
  function startSky(stage, scope, options) {
    var canvas = stage.querySelector('[data-luna-sky]');
    var context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!context) return null;

    var desktop = window.matchMedia('(min-width: 990px)').matches;
    var count = desktop ? 320 : 180;
    var maxRatio = desktop ? 2 : 1.5;
    var seed = 20261023;
    var random = function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    var colours = ['#F2EFE8', '#FFE9C9', '#DCE4FF'];
    var stars = [];
    for (var i = 0; i < count; i++) {
      var near = random() < 0.3;
      var tint = random();
      stars.push({
        x: random(),
        y: random(),
        size: near ? 0.7 + random() * 0.9 : 0.35 + random() * 0.55,
        alpha: near ? 0.55 + random() * 0.45 : 0.22 + random() * 0.4,
        phase: random() * Math.PI * 2,
        speed: 0.25 + random() * 0.55,
        near: near,
        colour: tint < 0.12 ? colours[1] : tint > 0.9 ? colours[2] : colours[0],
      });
    }

    var width = 0;
    var height = 0;
    var pointer = options.pointer;
    var meteor = null;
    var nextMeteor = performance.now() + 8000 + random() * 6000;
    var running = false;
    var visible = false;

    function draw(time) {
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      var scroll = options.reduced ? 0 : window.scrollY || 0;
      for (var s = 0; s < stars.length; s++) {
        var star = stars[s];
        var depth = star.near ? 1 : 0.4;
        var x = star.x * width + pointer.x * 12 * depth;
        var y = star.y * height + pointer.y * 9 * depth - scroll * (star.near ? 0.12 : 0.05);
        x = ((x % width) + width) % width;
        y = ((y % height) + height) % height;
        var twinkle = options.reduced ? 1 : 0.62 + 0.38 * Math.sin(time * 0.001 * star.speed + star.phase);
        context.globalAlpha = star.alpha * twinkle;
        context.fillStyle = star.colour;
        if (star.size > 1) {
          context.beginPath();
          context.arc(x, y, star.size, 0, 6.2832);
          context.fill();
        } else {
          context.fillRect(x - star.size, y - star.size, star.size * 2, star.size * 2);
        }
      }

      if (!options.reduced) {
        if (!meteor && time >= nextMeteor) {
          var direction = random() < 0.5 ? -1 : 1;
          var angle = 0.42 + random() * 0.3;
          meteor = {
            start: time,
            x: (0.2 + random() * 0.6) * width,
            y: random() * height * 0.35,
            dx: Math.cos(angle) * direction,
            dy: Math.sin(angle),
            distance: Math.max(width, height) * 0.45,
            length: 70 + random() * 70,
          };
        }
        if (meteor) {
          var progress = (time - meteor.start) / 900;
          if (progress >= 1) {
            meteor = null;
            nextMeteor = time + 8000 + random() * 6000;
          } else {
            var headX = meteor.x + meteor.dx * meteor.distance * progress;
            var headY = meteor.y + meteor.dy * meteor.distance * progress;
            var tailX = headX - meteor.dx * meteor.length;
            var tailY = headY - meteor.dy * meteor.length;
            var gradient = context.createLinearGradient(tailX, tailY, headX, headY);
            gradient.addColorStop(0, 'rgba(255, 244, 224, 0)');
            gradient.addColorStop(1, 'rgba(255, 244, 224, ' + (0.9 * Math.sin(Math.PI * progress)).toFixed(3) + ')');
            context.globalAlpha = 1;
            context.strokeStyle = gradient;
            context.lineWidth = 1.3;
            context.beginPath();
            context.moveTo(tailX, tailY);
            context.lineTo(headX, headY);
            context.stroke();
          }
        }
      }
      context.globalAlpha = 1;
    }

    function resize() {
      var rect = stage.getBoundingClientRect();
      var ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    }

    function frame(time) {
      if (!running) return;
      options.onFrame(time);
      draw(time);
      scope.frame(frame);
    }

    function update() {
      var shouldRun = visible && !document.hidden && !options.reduced;
      if (shouldRun && !running) {
        running = true;
        scope.frame(frame);
      } else if (!shouldRun) {
        running = false;
      }
    }

    if ('ResizeObserver' in window) {
      scope.observe(new ResizeObserver(resize)).observe(stage);
    } else {
      scope.on(window, 'resize', resize);
    }
    if ('IntersectionObserver' in window) {
      scope
        .observe(
          new IntersectionObserver(function (entries) {
            visible = entries[entries.length - 1].isIntersecting;
            update();
          }, { rootMargin: '80px 0px' })
        )
        .observe(stage);
    } else {
      visible = true;
    }
    scope.on(document, 'visibilitychange', update);
    resize();
    update();
    stage.classList.add('has-sky');
    scope.add(function () {
      running = false;
      stage.classList.remove('has-sky');
    });
    return { draw: draw };
  }

  /* 10. Hero: lampada, accensione, interruttore, tonalità -------------------- */
  // Primo frame dopo il primo paint con contenuto (First Contentful Paint); al massimo dopo 2,5 secondi
  function afterFirstPaint(scope, callback) {
    var done = false;
    var timer = 0;
    var observer = null;
    function run() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (observer) observer.disconnect();
      scope.frame(callback);
    }
    var painted = performance.getEntriesByName && performance.getEntriesByName('first-contentful-paint').length;
    if (painted) {
      run();
      return;
    }
    try {
      observer = new PerformanceObserver(function (list) {
        if (list.getEntriesByName('first-contentful-paint').length) run();
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch (error) {
      observer = null;
    }
    timer = setTimeout(run, 2500);
    scope.add(function () {
      done = true;
      clearTimeout(timer);
      if (observer) observer.disconnect();
    });
  }

  function whenLoaded(image) {
    return new Promise(function (resolve) {
      function check() {
        var source = image.currentSrc || image.src || '';
        if (image.complete && image.naturalWidth > 1 && source.indexOf('data:') !== 0) {
          (image.decode ? image.decode() : Promise.resolve()).then(resolve, resolve);
        } else {
          image.addEventListener('load', check, { once: true });
        }
      }
      image.addEventListener('error', function () {
        resolve();
      }, { once: true });
      check();
    });
  }

  Luna.register('hero-stage', '[data-luna-stage]', function (stage, scope) {
    var reduced = Luna.reducedMotion();
    var editor = stage.hasAttribute('data-luna-editor') || Luna.isDesignMode();
    var lamp = stage.querySelector('[data-luna-lamp]');
    var switchButton = stage.querySelector('[data-luna-switch]');
    var hint = stage.querySelector('[data-luna-hint]');
    var hero = stage.closest('.luna-hero') || stage.parentElement;
    var tones = Array.prototype.slice.call(hero.querySelectorAll('[data-luna-tone]'));
    var colour = tones.length ? tones[0].getAttribute('data-luna-tone') : '';
    var power = reduced || editor ? 1 : 0;
    var touched = false;
    var destroyed = false;
    var timers = [];
    var later = function (callback, delay) {
      timers.push(setTimeout(callback, delay));
    };

    function apply(value, silent) {
      power = value;
      stage.style.setProperty('--luna-power', String(value));
      stage.classList.toggle('is-on', value > 0);
      if (switchButton) switchButton.setAttribute('aria-checked', value > 0 ? 'true' : 'false');
      if (!silent) Luna.setLight({ power: value, color: colour, source: 'hero' });
    }

    function setColour(value) {
      if (!value) return;
      colour = value;
      stage.style.setProperty('--luna-light', value);
    }

    function hideHint() {
      if (!hint) return;
      hint.classList.add('is-hidden');
      hint.setAttribute('aria-hidden', 'true');
    }

    // Segnale per la luna 3D, che aspetta la lampada accesa per non togliere banda alla hero (§9)
    function markLit() {
      if (destroyed || Luna.heroLit) return;
      Luna.heroLit = true;
      doc.dispatchEvent(new CustomEvent('luna:hero-lit'));
    }

    function interact() {
      touched = true;
      hideHint();
    }

    // Stato iniziale senza animazioni
    stage.classList.add('is-instant');
    setColour(colour);
    apply(power);
    scope.frame(function () {
      stage.classList.remove('is-instant');
    });

    // L'altro stato della lampada parte al primo frame dopo il primo paint, non all'evento load
    afterFirstPaint(scope, function () {
      stage.querySelectorAll('source[data-luna-defer]').forEach(function (source) {
        var image = source.parentElement ? source.parentElement.querySelector('img') : null;
        if (image) image.setAttribute('fetchpriority', 'low');
        source.remove();
      });
    });

    // Accensione al caricamento: immagini accese decodificate e almeno 600 ms dall'apertura
    var onImages = Array.prototype.slice.call(stage.querySelectorAll('img[data-luna-layer$="-on"]'));
    if (!reduced && !editor) {
      Promise.all(onImages.map(whenLoaded)).then(function () {
        if (destroyed || touched) return;
        later(function () {
          if (destroyed || touched) return;
          stage.classList.add('is-igniting');
          apply(1);
          markLit();
          later(function () {
            stage.classList.remove('is-igniting');
          }, 1300);
        }, Math.max(0, 600 - performance.now()));
      });
    } else {
      // Accesa da subito (movimento ridotto, editor): conta come accesa quando le sue immagini sono arrivate
      Promise.all(onImages.map(whenLoaded)).then(markLit);
    }

    if (switchButton) {
      scope.on(switchButton, 'click', function () {
        interact();
        stage.classList.remove('is-igniting');
        if (navigator.vibrate) {
          try {
            navigator.vibrate(8);
          } catch (error) {
            /* alcuni browser lo vietano senza gesto: va bene così */
          }
        }
        apply(power > 0 ? 0 : 1);
      });
    }

    // Tonalità (blocchi della sezione): con un solo blocco il selettore resta nascosto
    function selectTone(button) {
      interact();
      tones.forEach(function (tone) {
        tone.setAttribute('aria-checked', tone === button ? 'true' : 'false');
        tone.tabIndex = tone === button ? 0 : -1;
      });
      setColour(button.getAttribute('data-luna-tone'));
      apply(1);
    }
    tones.forEach(function (tone, index) {
      tone.tabIndex = index === 0 ? 0 : -1;
      scope.on(tone, 'click', function () {
        selectTone(tone);
      });
      scope.on(tone, 'keydown', function (event) {
        var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var next = tones[(index + step + tones.length) % tones.length];
        next.focus();
        selectTone(next);
      });
    });

    // Sincronia con la luna 3D (step 4) e con chiunque emetta 'luna:light'
    Luna.onLight(function (detail) {
      if (detail.source === 'hero') return;
      interact();
      if (detail.color) setColour(detail.color);
      apply(detail.power, true);
    }, scope);

    // Puntatore: parallasse delle stelle e inclinazione del palco (max 6°), solo su desktop
    var pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    var desktop = window.matchMedia('(min-width: 990px) and (hover: hover) and (pointer: fine)').matches;
    if (desktop && !reduced) {
      scope.on(stage, 'pointermove', function (event) {
        var rect = stage.getBoundingClientRect();
        pointer.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        pointer.targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      });
      scope.on(stage, 'pointerleave', function () {
        pointer.targetX = 0;
        pointer.targetY = 0;
      });
    }

    startSky(stage, scope, {
      reduced: reduced,
      pointer: pointer,
      onFrame: function () {
        pointer.x += (pointer.targetX - pointer.x) * 0.06;
        pointer.y += (pointer.targetY - pointer.y) * 0.06;
        if (desktop && lamp && !reduced) {
          lamp.style.transform = 'rotateX(' + (-pointer.y * 6).toFixed(2) + 'deg) rotateY(' + (pointer.x * 6).toFixed(2) + 'deg)';
        }
      },
    });

    scope.add(function () {
      destroyed = true;
      timers.forEach(clearTimeout);
      if (lamp) lamp.style.transform = '';
    });
  });

  /* 11. Consegna stimata: ricalcolata con l'ora di Roma --------------------- */
  Luna.register('delivery', '[data-luna-delivery]', function (element) {
    var min = parseInt(element.getAttribute('data-min'), 10) || 0;
    var max = parseInt(element.getAttribute('data-max'), 10) || 0;
    var cutoff = parseInt(element.getAttribute('data-cutoff'), 10);
    if (max <= 0) {
      element.hidden = true;
      return;
    }
    var range = dates.deliveryWindow(min, Math.max(min, max), new Date(), Number.isNaN(cutoff) ? null : cutoff);
    var from = element.querySelector('[data-luna-date-from]');
    var to = element.querySelector('[data-luna-date-to]');
    if (from) from.textContent = dates.format(range.from, 'breve');
    if (to) to.textContent = dates.format(range.to, 'breve');
  });

  /* 12. Varianti: aggiornano id, prezzi, disponibilità e scorte ------------- */
  function fillTemplate(element, template, token, value, html) {
    element.textContent = '';
    var parts = template.split(token);
    parts.forEach(function (part, index) {
      if (part) element.appendChild(doc.createTextNode(part));
      if (index < parts.length - 1) {
        if (html) {
          var span = doc.createElement('span');
          span.className = html.className || '';
          span.setAttribute(html.attribute, '');
          span.textContent = value;
          element.appendChild(span);
        } else {
          element.appendChild(doc.createTextNode(value));
        }
      }
    });
  }

  Luna.applyVariant = function (variant) {
    var form = doc.getElementById('luna-buy-form');
    if (form && form.elements.id) form.elements.id.value = variant.id;
    var sale = Boolean(variant.compare);

    doc.querySelectorAll('[data-luna-price-block]').forEach(function (block) {
      block.classList.toggle('is-on-sale', sale);
      block.querySelectorAll('[data-luna-sale-part]').forEach(function (part) {
        part.hidden = !sale;
      });
      block.querySelectorAll('[data-luna-compare], [data-luna-omnibus]').forEach(function (element) {
        element.textContent = variant.compare || '';
      });
      var badge = block.querySelector('[data-luna-pct]');
      if (badge) badge.textContent = sale ? (badge.getAttribute('data-template') || '').replace('{pct}', variant.pct) : '';
      var save = block.querySelector('[data-luna-save-line]');
      if (save) {
        if (sale) fillTemplate(save, save.getAttribute('data-template') || '', '{importo}', variant.save, { attribute: 'data-luna-save' });
        else save.textContent = '';
      }
    });
    doc.querySelectorAll('[data-luna-price]').forEach(function (element) {
      element.textContent = variant.price;
    });

    doc.querySelectorAll('[data-luna-cta]').forEach(function (button) {
      var label = button.querySelector('[data-luna-cta-label]');
      button.disabled = !variant.available;
      if (!label) return;
      if (variant.available) {
        fillTemplate(label, button.getAttribute('data-label-template') || '', '{prezzo}', variant.price, {
          className: 'luna-cta__price',
          attribute: 'data-luna-price',
        });
      } else {
        label.textContent = button.getAttribute('data-sold-out-text') || '';
      }
    });
    doc.querySelectorAll('[data-luna-express]').forEach(function (element) {
      element.hidden = !variant.available;
    });
    doc.querySelectorAll('[data-luna-stock]').forEach(function (element) {
      var template = element.getAttribute('data-template') || '';
      element.hidden = !variant.stock || !template;
      element.textContent = variant.stock ? template.replace('{n}', variant.stock) : '';
    });

    if (window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState(window.history.state, '', url.toString());
    }
  };

  Luna.register('variants', '[data-luna-variants]', function (picker, scope) {
    var data = picker.querySelector('[data-luna-variants-json]');
    var variants = data ? JSON.parse(data.textContent) : [];
    scope.on(picker, 'change', function () {
      var chosen = Array.prototype.map.call(picker.querySelectorAll('fieldset'), function (fieldset) {
        var input = fieldset.querySelector('input:checked');
        return input ? input.value : null;
      });
      var match = variants.find(function (variant) {
        return variant.options.every(function (value, index) {
          return value === chosen[index];
        });
      });
      if (match) Luna.applyVariant(match);
    });
  });

  /* 13. Barra sticky: fuori la CTA della hero, dentro quella finale --------- */
  Luna.register('sticky', '[data-luna-sticky]', function (bar, scope) {
    var heroCta = doc.querySelector('[data-luna-hero-cta]');
    if (!heroCta || !('IntersectionObserver' in window)) {
      bar.classList.add('is-visible');
      return;
    }
    var heroVisible = true;
    var finals = new Set();

    function update() {
      bar.classList.toggle('is-visible', !heroVisible && finals.size === 0);
    }

    scope
      .observe(
        new IntersectionObserver(function (entries) {
          heroVisible = entries[entries.length - 1].isIntersecting;
          update();
        })
      )
      .observe(heroCta);

    var finalButtons = doc.querySelectorAll('[data-luna-final-cta]');
    if (finalButtons.length) {
      var finalObserver = scope.observe(
        new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) finals.add(entry.target);
            else finals.delete(entry.target);
          });
          update();
        })
      );
      finalButtons.forEach(function (button) {
        finalObserver.observe(button);
      });
    }
    scope.add(function () {
      bar.classList.remove('is-visible');
    });
  });

  /* 14. Luna 3D: interruttore, tonalità e caricamento pigro del modulo ------ */
  function webglAvailable() {
    try {
      var probe = doc.createElement('canvas');
      var gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return false;
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Three.js e le texture partono solo dopo che la lampada della hero si è accesa, anche su desktop con la sezione
  // già vicina, per non togliere banda all'immagine LCP. Ripiego (lampada toccata prima dell'accensione o hero
  // assente): appena il browser è libero, entro 1,5 s, ma sempre dopo che le immagini della hero sono arrivate.
  function afterHeroLight(scope, callback) {
    var done = false;
    var idle = 0;
    var timer = 0;
    function stop() {
      doc.removeEventListener('luna:hero-lit', run);
      if (idle && window.cancelIdleCallback) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    }
    function run() {
      if (done) return;
      done = true;
      stop();
      callback();
    }
    scope.add(function () {
      done = true;
      stop();
    });
    if (Luna.heroLit) {
      run();
      return;
    }
    doc.addEventListener('luna:hero-lit', run);
    var images = Array.prototype.slice.call(doc.querySelectorAll('[data-luna-stage] img[data-luna-layer]'));
    Promise.all(images.map(whenLoaded)).then(function () {
      if (done) return;
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(run, { timeout: 1500 });
      else timer = setTimeout(run, 1500);
    });
  }

  Luna.register('moon3d', '[data-luna-moon3d]', function (section, scope) {
    var stage = section.querySelector('[data-luna-moon3d-stage]');
    var toggle = section.querySelector('[data-luna-moon3d-switch]');
    var tones = Array.prototype.slice.call(section.querySelectorAll('[data-luna-tone]'));
    var colour = light.color || (tones[0] && tones[0].getAttribute('data-luna-tone')) || (stage && stage.getAttribute('data-light')) || '';
    var power = light.power;
    var view = null;
    var destroyed = false;
    if (!stage) return;

    function apply(value, nextColour, silent) {
      power = value;
      if (nextColour) colour = nextColour;
      section.style.setProperty('--luna-power', String(value));
      if (colour) section.style.setProperty('--luna-light', colour);
      if (toggle) toggle.setAttribute('aria-checked', value > 0 ? 'true' : 'false');
      tones.forEach(function (tone) {
        var selected = (tone.getAttribute('data-luna-tone') || '').toLowerCase() === (colour || '').toLowerCase();
        tone.setAttribute('aria-checked', selected ? 'true' : 'false');
        tone.tabIndex = selected ? 0 : -1;
      });
      if (!silent) Luna.setLight({ power: value, color: colour, source: 'moon3d' });
    }

    apply(power, colour, true);
    if (toggle) {
      scope.on(toggle, 'click', function () {
        apply(power > 0 ? 0 : 1);
      });
    }
    tones.forEach(function (tone, index) {
      scope.on(tone, 'click', function () {
        apply(1, tone.getAttribute('data-luna-tone'));
      });
      scope.on(tone, 'keydown', function (event) {
        var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var next = tones[(index + step + tones.length) % tones.length];
        next.focus();
        apply(1, next.getAttribute('data-luna-tone'));
      });
    });
    Luna.onLight(function (detail) {
      if (detail.source === 'moon3d') return;
      apply(detail.power, detail.color, true);
    }, scope);

    // Ripiego: senza WebGL o con ?luna3d=0 resta l'immagine con l'alone CSS (e sparisce «Trascina per farla ruotare»)
    function fallback() {
      stage.classList.add('is-fallback');
      section.classList.add('is-fallback');
    }
    var params = new URLSearchParams(window.location.search);
    if (params.get('luna3d') === '0' || !webglAvailable() || !('IntersectionObserver' in window)) {
      fallback();
      return;
    }

    // Mai prima del primo paint né prima che la hero si accenda; poi a 400 px dal viewport (§9)
    afterFirstPaint(scope, function () {
      afterHeroLight(scope, load);
    });

    function load() {
      var mobile = window.matchMedia('(max-width: 989px)').matches;
      var handle = Luna.lazyImport(stage, stage.getAttribute('data-module-url'), { distance: 400, scope: scope });
      handle.promise
        .then(function (module) {
          if (destroyed) return null;
          return module.mount(stage, {
            threeUrl: stage.getAttribute('data-three-url'),
            textures: {
              colour: stage.getAttribute(mobile ? 'data-colour-1k' : 'data-colour-2k'),
              bump: stage.getAttribute('data-bump'),
            },
            power: power,
            colour: colour,
            autoRotate: stage.getAttribute('data-auto-rotate') === 'true',
            reducedMotion: Luna.reducedMotion(),
            mobile: mobile,
          });
        })
        .then(function (instance) {
          if (!instance) return;
          if (destroyed) {
            instance.destroy();
            return;
          }
          view = instance;
          stage.classList.add('is-3d');
        })
        .catch(function (error) {
          console.warn('[Luna] luna 3D non disponibile, resta l\'immagine:', error && error.message);
          fallback();
        });
    }

    scope.add(function () {
      destroyed = true;
      if (view) view.destroy();
      view = null;
      stage.classList.remove('is-3d', 'is-fallback');
      section.classList.remove('is-fallback');
    });
  });

})();
