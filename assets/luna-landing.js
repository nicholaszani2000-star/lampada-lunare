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
        import(url).then(resolve, reject);
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

    /** Finestra di consegna: oggi + min e oggi + max giorni lavorativi. */
    deliveryWindow: function (minDays, maxDays, now) {
      var today = dates.today(now);
      return { from: dates.addBusinessDays(today, minDays), to: dates.addBusinessDays(today, maxDays) };
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
})();
