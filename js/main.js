// Force scroll to top on page load (prevents banner being hidden by scroll restore)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// Initialize Lucide icons
lucide.createIcons();

// Scroll-triggered fade-in animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.style.animationDelay = `${i * 0.1}s`;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// Mobile menu toggle
document.querySelector('.mobile-toggle')?.addEventListener('click', () => {
  document.querySelector('.header-nav').classList.toggle('active');
});

// ═══ BEE ANIMATION SYSTEM ═══
// State machine: IDLE (at hub) → DEPARTING (flying out) → WORKING (at task) → RETURNING (flying back)

const BEE_TASKS = [
  'Answering a coaching question\u2026',
  'Building a workout plan\u2026',
  'Reviewing client progress\u2026',
  'Drafting a follow-up email\u2026',
  'Analyzing session notes\u2026',
  'Creating a meal plan\u2026',
  'Summarizing key takeaways\u2026',
  'Scheduling a check-in\u2026',
  'Writing social media content\u2026',
  'Preparing a course outline\u2026',
  'Generating accountability reminders\u2026',
  'Personalizing client feedback\u2026',
];

const STATES = { IDLE: 0, DEPARTING: 1, WORKING: 2, RETURNING: 3 };

// Cubic bezier point interpolation
function bezier(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Ease-in-out cubic
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Pick an edge destination within a specific angular sector (prevents overlap)
// sector: 0–4 for 5 bees, each gets a 72° slice
function pickSectorTarget(w, h, margin, sector, totalSectors) {
  const cx = w / 2;
  const cy = h / 2;
  const sliceSize = (Math.PI * 2) / totalSectors;
  // Random angle within this bee's sector (with small jitter into neighbor)
  const angle = sector * sliceSize + (0.15 + Math.random() * 0.7) * sliceSize;

  // Cast a ray from center at this angle, find where it hits the container edge
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const tRight = cosA > 0 ? (w - cx) / cosA : Infinity;
  const tLeft = cosA < 0 ? (-cx) / cosA : Infinity;
  const tBottom = sinA > 0 ? (h - cy) / sinA : Infinity;
  const tTop = sinA < 0 ? (-cy) / sinA : Infinity;

  const tEdge = Math.min(tRight, tLeft, tBottom, tTop);
  // Fly 85–110% of the way to edge (can go past the visible boundary)
  const dist = tEdge * (0.85 + Math.random() * 0.25);

  return { x: cx + cosA * dist, y: cy + sinA * dist };
}

class Bee {
  constructor(index, container, hub, trailSvg) {
    this.index = index;
    this.container = container;
    this.hub = hub;
    this.trailSvg = trailSvg;

    this.state = STATES.IDLE;
    this.stateStart = 0;
    this.x = 0; this.y = 0;
    this.targetX = 0; this.targetY = 0;
    // Bezier control points
    this.cp1x = 0; this.cp1y = 0;
    this.cp2x = 0; this.cp2y = 0;
    // Return path control points (different curve)
    this.rcp1x = 0; this.rcp1y = 0;
    this.rcp2x = 0; this.rcp2y = 0;

    this.currentTask = '';
    this.cycleCount = 0;
    this.idleDuration = 800 + Math.random() * 1200; // 0.8–2s at hub
    this.flightDuration = 2000 + Math.random() * 1000; // 2–3s travel
    this.workDuration = 2800 + Math.random() * 1500; // 2.8–4.3s working
    this.prevAngle = 0;

    this.buildElements();
    // Staggered start: each bee departs at a different time
    this.stateStart = performance.now() + index * 600;
  }

  buildElements() {
    this.el = document.createElement('div');
    this.el.className = 'bee';

    const flutter = document.createElement('span');
    flutter.className = 'bee-flutter';
    flutter.style.animationDelay = `${-this.index * 0.35}s`;

    const img = document.createElement('img');
    img.className = 'bee-img';
    img.src = 'public/logo.webp';
    img.alt = '';
    flutter.appendChild(img);
    this.el.appendChild(flutter);
    this.imgEl = img;

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'bee-tooltip';
    this.el.appendChild(this.tooltipEl);

    // SVG trail path
    this.trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.trailSvg.appendChild(this.trailPath);

    this.container.appendChild(this.el);

    // Start invisible at center, fade in
    setTimeout(() => this.el.classList.add('active'), 200 + this.index * 150);
  }

  getCenter() {
    const cr = this.container.getBoundingClientRect();
    const hr = this.hub.getBoundingClientRect();
    return { x: hr.left - cr.left + hr.width / 2, y: hr.top - cr.top + hr.height / 2 };
  }

  startDeparture(now) {
    const r = this.container.getBoundingClientRect();
    const center = this.getCenter();
    this.x = center.x;
    this.y = center.y;

    // Rotate sector each cycle so the same bee doesn't always go the same direction
    const sector = (this.index + this.cycleCount) % 5;
    this.cycleCount++;
    const target = pickSectorTarget(r.width, r.height, 0, sector, 5);
    this.targetX = target.x;
    this.targetY = target.y;

    // Generate curved bezier control points (perpendicular offset for arc)
    const dx = this.targetX - center.x;
    const dy = this.targetY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / dist; // perpendicular normal
    const ny = dx / dist;
    const curve = (Math.random() - 0.5) * dist * 0.6; // random curvature

    this.cp1x = center.x + dx * 0.3 + nx * curve;
    this.cp1y = center.y + dy * 0.3 + ny * curve;
    this.cp2x = center.x + dx * 0.7 + nx * curve * 0.5;
    this.cp2y = center.y + dy * 0.7 + ny * curve * 0.5;

    this.currentTask = BEE_TASKS[Math.floor(Math.random() * BEE_TASKS.length)];
    this.tooltipEl.textContent = this.currentTask;
    this.flightDuration = 1800 + Math.random() * 1200;

    // Draw trail
    this.trailPath.setAttribute('d',
      `M ${center.x} ${center.y} C ${this.cp1x} ${this.cp1y}, ${this.cp2x} ${this.cp2y}, ${this.targetX} ${this.targetY}`
    );
    this.trailPath.style.opacity = '1';

    this.state = STATES.DEPARTING;
    this.stateStart = now;

    // Ping the hub
    this.hub.classList.add('ping');
    setTimeout(() => this.hub.classList.remove('ping'), 600);
  }

  startReturn(now) {
    const center = this.getCenter();
    // Different curve for return path
    const dx = center.x - this.targetX;
    const dy = center.y - this.targetY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / dist;
    const ny = dx / dist;
    const curve = (Math.random() - 0.5) * dist * 0.5;

    this.rcp1x = this.targetX + dx * 0.3 + nx * curve;
    this.rcp1y = this.targetY + dy * 0.3 + ny * curve;
    this.rcp2x = this.targetX + dx * 0.7 + nx * curve * 0.4;
    this.rcp2y = this.targetY + dy * 0.7 + ny * curve * 0.4;

    this.flightDuration = 1600 + Math.random() * 800;
    this.state = STATES.RETURNING;
    this.stateStart = now;

    // Hide tooltip
    this.tooltipEl.classList.remove('visible');
    // Fade trail
    this.trailPath.style.opacity = '0.4';
  }

  update(now) {
    const elapsed = now - this.stateStart;
    const r = this.container.getBoundingClientRect();
    const center = this.getCenter();

    switch (this.state) {
      case STATES.IDLE: {
        this.x = center.x;
        this.y = center.y;
        this.el.style.transform = `translate(${this.x - 22}px, ${this.y - 22}px) scale(0.3)`;
        this.el.style.opacity = '0';
        this.trailPath.style.opacity = '0';
        if (elapsed > this.idleDuration) {
          this.idleDuration = 600 + Math.random() * 1400;
          this.startDeparture(now);
        }
        break;
      }

      case STATES.DEPARTING: {
        const t = Math.min(elapsed / this.flightDuration, 1);
        const et = ease(t);
        this.x = bezier(et, center.x, this.cp1x, this.cp2x, this.targetX);
        this.y = bezier(et, center.y, this.cp1y, this.cp2y, this.targetY);

        // Scale up and fade in from hub
        const scale = 0.3 + 0.7 * et;
        const opacity = Math.min(t / 0.3, 1);
        this.el.style.opacity = `${opacity}`;
        this.applyPosition(scale);
        this.applyRotation(et, center.x, this.cp1x, this.cp2x, this.targetX,
                                 center.y, this.cp1y, this.cp2y, this.targetY);

        if (t >= 1) {
          this.state = STATES.WORKING;
          this.stateStart = now;
          this.workDuration = 2500 + Math.random() * 2000;
          this.tooltipEl.classList.add('visible');
          this.positionTooltip();
        }
        break;
      }

      case STATES.WORKING: {
        // Gentle hover at destination
        const hover = Math.sin(elapsed * 0.003) * 3;
        const hoverY = Math.cos(elapsed * 0.002) * 2;
        this.x = this.targetX + hover;
        this.y = this.targetY + hoverY;
        this.applyPosition(1);
        this.positionTooltip();

        if (elapsed > this.workDuration) {
          this.startReturn(now);
        }
        break;
      }

      case STATES.RETURNING: {
        const t = Math.min(elapsed / this.flightDuration, 1);
        const et = ease(t);
        this.x = bezier(et, this.targetX, this.rcp1x, this.rcp2x, center.x);
        this.y = bezier(et, this.targetY, this.rcp1y, this.rcp2y, center.y);

        // Scale down and fade out as bee approaches hub
        const scale = 1 - 0.7 * et;
        const opacity = t > 0.6 ? 1 - ((t - 0.6) / 0.4) : 1;
        this.el.style.opacity = `${opacity}`;
        this.applyPosition(scale);
        this.applyRotation(et, this.targetX, this.rcp1x, this.rcp2x, center.x,
                                 this.targetY, this.rcp1y, this.rcp2y, center.y);

        if (t >= 1) {
          this.state = STATES.IDLE;
          this.stateStart = now;
          this.trailPath.style.opacity = '0';
          // Ping on arrival
          this.hub.classList.add('ping');
          setTimeout(() => this.hub.classList.remove('ping'), 600);
        }
        break;
      }
    }
  }

  applyPosition(scale) {
    const half = 22; // half of 44px bee size
    this.el.style.transform = `translate(${this.x - half}px, ${this.y - half}px) scale(${scale})`;
    this.el.style.opacity = '';
  }

  applyRotation(t, p0x, p1x, p2x, p3x, p0y, p1y, p2y, p3y) {
    // Derivative of bezier for direction
    const dt = 0.01;
    const t2 = Math.min(t + dt, 1);
    const fx = bezier(t2, p0x, p1x, p2x, p3x) - bezier(t, p0x, p1x, p2x, p3x);
    const fy = bezier(t2, p0y, p1y, p2y, p3y) - bezier(t, p0y, p1y, p2y, p3y);
    const angle = Math.atan2(fy, fx) * (180 / Math.PI);
    // Smooth the rotation
    this.prevAngle += (angle - this.prevAngle) * 0.15;
    this.imgEl.style.transform = `rotate(${this.prevAngle * 0.3}deg)`;
  }

  positionTooltip() {
    // Smart positioning: always keep tooltip visible within the viewport
    const containerRect = this.container.getBoundingClientRect();
    const beeScreenX = containerRect.left + this.x;
    const beeScreenY = containerRect.top + this.y;
    const tooltipW = this.tooltipEl.offsetWidth || 180;
    const tooltipH = this.tooltipEl.offsetHeight || 36;
    const gap = 14;

    // Default: above the bee, centered
    let top = -tooltipH - gap;
    let left = -tooltipW / 2 + 22;

    // If too close to top of viewport, put below
    if (beeScreenY + top - 8 < 0) {
      top = 44 + gap; // below bee
    }

    // Clamp horizontal to stay within viewport
    const screenLeft = beeScreenX + left;
    const screenRight = screenLeft + tooltipW;
    if (screenLeft < 8) {
      left += (8 - screenLeft);
    } else if (screenRight > window.innerWidth - 8) {
      left -= (screenRight - window.innerWidth + 8);
    }

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }
}

class BeeSwarm {
  constructor() {
    this.container = document.querySelector('.hero-animation');
    if (!this.container) return;

    this.bees = [];
    this.rafId = null;
    this.isVisible = false;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Build hub
    this.buildHub();

    // Build SVG layer for trails
    this.trailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.trailSvg.setAttribute('class', 'bee-trail');
    this.trailSvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    this.container.appendChild(this.trailSvg);

    this.visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isVisible) {
          this.isVisible = true;
          this.init();
        } else if (!entry.isIntersecting && this.isVisible) {
          this.isVisible = false;
          this.pause();
        }
      });
    }, { threshold: 0.05 });

    this.visibilityObserver.observe(this.container);
  }

  buildHub() {
    this.hubEl = document.createElement('div');
    this.hubEl.className = 'hive-hub';
    this.hubEl.innerHTML = `
      <div class="hive-glow"></div>
      <div class="hive-ring"></div>
      <div class="hive-ring"></div>
      <div class="hive-ring"></div>
      <img class="hive-nest" src="public/nest.png" alt="" draggable="false">
    `;
    this.container.appendChild(this.hubEl);
  }

  init() {
    if (this.bees.length === 0) {
      for (let i = 0; i < 5; i++) {
        this.bees.push(new Bee(i, this.container, this.hubEl, this.trailSvg));
      }
    }

    if (this.prefersReducedMotion) {
      // Spread bees at various positions, static with tooltips
      const r = this.container.getBoundingClientRect();
      const positions = [
        { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.15 },
        { x: 0.5, y: 0.5 }, { x: 0.15, y: 0.8 }, { x: 0.85, y: 0.75 },
      ];
      this.bees.forEach((bee, i) => {
        const p = positions[i];
        bee.x = p.x * r.width;
        bee.y = p.y * r.height;
        bee.el.style.transform = `translate(${bee.x - 22}px, ${bee.y - 22}px)`;
        bee.el.classList.add('active');
        bee.tooltipEl.textContent = BEE_TASKS[i];
        bee.tooltipEl.classList.add('visible');
        bee.positionTooltip();
      });
      return;
    }

    this.animate();
  }

  animate() {
    const loop = (now) => {
      this.bees.forEach(bee => bee.update(now));
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pause() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

new BeeSwarm();
