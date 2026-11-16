/**
 * Sli - Slime 2D Jelly Physics & Rendering Engine
 * Soft-body spring-mass dynamics with expressive anime aesthetics.
 */

export class SlimeEntity {
  /**
   * @param {Object} options
   * @param {number} [options.x=90] Center X coordinate
   * @param {number} [options.y=90] Center Y coordinate
   * @param {number} [options.radius=50] Base circular radius
   * @param {number} [options.vertices=16] Number of perimeter spring nodes
   * @param {number} [options.stiffness=150] Spring restoration force
   * @param {number} [options.neighborStiffness=35] Neighbor smoothing force
   * @param {number} [options.damping=0.88] Velocity damping coefficient
   */
  constructor(options = {}) {
    this.x = options.x ?? 90;
    this.y = options.y ?? 90;
    this.radius = options.radius ?? 50;
    this.vertexCount = options.vertices ?? 16;
    this.stiffness = options.stiffness ?? 150;
    this.neighborStiffness = options.neighborStiffness ?? 35;
    this.damping = options.damping ?? 0.88;

    this.state = 'idle';
    this.time = 0;
    this.blinkTimer = 0;
    this.blinkDuration = 0.15;
    this.nextBlinkIn = 4 + Math.random() * 3;
    this.isBlinking = false;
    this.blinkProgress = 0;

    this.targetLook = { x: this.x, y: this.y };
    this.currentLook = { x: this.x, y: this.y };
    this.faceLag = { x: 0, y: 0 };

    this.speechAmplitude = 0;
    this.speechPhase = 0;

    this.vertices = [];
    this.initVertices();
  }

  /**
   * Initialize perimeter vertices in a circle around center
   */
  initVertices() {
    this.vertices = [];
    for (let i = 0; i < this.vertexCount; i++) {
      const angle = (i * 2 * Math.PI) / this.vertexCount;
      const x = this.x + this.radius * Math.cos(angle);
      const y = this.y + this.radius * Math.sin(angle);
      this.vertices.push({
        angle,
        x,
        y,
        vx: 0,
        vy: 0,
        restX: x,
        restY: y
      });
    }
  }

  /**
   * Set new center position for the slime
   */
  setPosition(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    this.x = x;
    this.y = y;
    for (const v of this.vertices) {
      v.x += dx;
      v.y += dy;
      v.restX += dx;
      v.restY += dy;
    }
  }

  /**
   * Deforms the slime soft body by displacing vertices and imparting velocity
   * @param {number} dx
   * @param {number} dy
   */
  drag(dx, dy) {
    for (const v of this.vertices) {
      v.x += dx;
      v.y += dy;
      v.vx += dx * 2;
      v.vy += dy * 2;
    }
  }

  /**
   * Set active slime state ('idle' | 'thinking' | 'alert' | 'speaking' | 'docked')
   */
  setState(state) {
    const valid = ['idle', 'thinking', 'alert', 'speaking', 'docked'];
    if (valid.includes(state)) {
      this.state = state;
    }
  }

  /**
   * Dock slime into top-bar compact mode
   */
  dock() {
    this.setState('docked');
  }

  /**
   * Undock slime back to floating idle mode
   */
  undock() {
    this.setState('idle');
  }

  /**
   * Look towards target coordinates
   */
  lookAt(x, y) {
    this.targetLook = { x, y };
  }

  /**
   * Update speaking audio amplitude for lip sync / mouth pulsation
   */
  setSpeechAmplitude(amplitude) {
    this.speechAmplitude = Math.max(0, Math.min(1, amplitude || 0));
  }

  /**
   * Physics and animation step
   * @param {number} dt Delta time in seconds (defaults to ~1/60s)
   */
  update(dt = 0.016) {
    this.time += dt;

    // Smooth eye look tracking
    const lookSpeed = 10 * dt;
    this.currentLook.x += (this.targetLook.x - this.currentLook.x) * lookSpeed;
    this.currentLook.y += (this.targetLook.y - this.currentLook.y) * lookSpeed;

    // Blink timer logic
    this.blinkTimer += dt;
    if (!this.isBlinking && this.blinkTimer >= this.nextBlinkIn) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.blinkProgress = 0;
    }

    if (this.isBlinking) {
      this.blinkProgress += dt / this.blinkDuration;
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkTimer = 0;
        this.nextBlinkIn = 3.5 + Math.random() * 3.5;
      }
    }

    // State-specific shape deformations
    const isDocked = this.state === 'docked';
    const isThinking = this.state === 'thinking';
    const isAlert = this.state === 'alert';
    const isSpeaking = this.state === 'speaking';

    if (isSpeaking) {
      this.speechPhase += dt * 14;
    }

    // Natural breathing / jiggle oscillation
    const breath = 1 + 0.025 * Math.sin(this.time * 2.5);

    // Update spring-mass vertices
    const N = this.vertices.length;
    for (let i = 0; i < N; i++) {
      const v = this.vertices[i];
      const prev = this.vertices[(i - 1 + N) % N];
      const next = this.vertices[(i + 1) % N];

      // Calculate state-dependent equilibrium position
      let rx = this.radius;
      let ry = this.radius;

      if (isDocked) {
        rx = this.radius * 1.35;
        ry = this.radius * 0.45;
      } else if (isAlert) {
        rx = this.radius * 0.92;
        ry = this.radius * 1.15;
      } else if (isThinking) {
        const wobble = Math.sin(this.time * 5 + v.angle * 2) * 0.08;
        rx = this.radius * (1 + wobble);
        ry = this.radius * (1 - wobble);
      } else {
        // Idle / speaking
        rx = this.radius * breath;
        ry = this.radius * (2 - breath);
        if (isSpeaking && this.speechAmplitude > 0) {
          const speakJiggle = Math.sin(this.speechPhase) * this.speechAmplitude * 0.08;
          ry *= 1 + speakJiggle;
        }
      }

      const eqX = this.x + rx * Math.cos(v.angle);
      const eqY = this.y + ry * Math.sin(v.angle);

      // Spring force to equilibrium
      const fxRestore = -this.stiffness * (v.x - eqX);
      const fyRestore = -this.stiffness * (v.y - eqY);

      // Neighbor surface tension force (Laplacian smoothing)
      const fxNeighbor = this.neighborStiffness * ((prev.x + next.x) / 2 - v.x);
      const fyNeighbor = this.neighborStiffness * ((prev.y + next.y) / 2 - v.y);

      // Integrate acceleration & velocity with damping
      v.vx = (v.vx + (fxRestore + fxNeighbor) * dt) * this.damping;
      v.vy = (v.vy + (fyRestore + fyNeighbor) * dt) * this.damping;

      v.x += v.vx * dt;
      v.y += v.vy * dt;
    }

    // Dynamic jelly inertia for facial features
    let avgVx = 0;
    let avgVy = 0;
    for (let i = 0; i < N; i++) {
      avgVx += this.vertices[i].vx;
      avgVy += this.vertices[i].vy;
    }
    avgVx /= N;
    avgVy /= N;

    // Face has subtle organic lag behind rapid body motion
    const lagFactor = 0.05;
    this.faceLag.x += ((-avgVx * lagFactor) - this.faceLag.x) * Math.min(1, 14 * dt);
    this.faceLag.y += ((-avgVy * lagFactor) - this.faceLag.y) * Math.min(1, 14 * dt);
  }

  /**
   * Calculate dynamic center of mass, scale, and tilt from soft-body vertices
   * Allows face and highlights to deform and move seamlessly with the jelly body
   */
  getCenter() {
    const N = this.vertices.length;
    if (N === 0) return { x: this.x, y: this.y, scaleX: 1, scaleY: 1, tilt: 0 };

    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < N; i++) {
      sumX += this.vertices[i].x;
      sumY += this.vertices[i].y;
    }
    const cx = sumX / N;
    const cy = sumY / N;

    // Sample top, bottom, left, right perimeter points for squish and tilt
    const topIdx = Math.round((3 * N) / 4) % N;
    const botIdx = Math.round(N / 4) % N;
    const leftIdx = Math.round(N / 2) % N;
    const rightIdx = 0;

    const topV = this.vertices[topIdx];
    const botV = this.vertices[botIdx];
    const leftV = this.vertices[leftIdx];
    const rightV = this.vertices[rightIdx];

    const currentW = Math.hypot(rightV.x - leftV.x, rightV.y - leftV.y) || (this.radius * 2);
    const currentH = Math.hypot(botV.x - topV.x, botV.y - topV.y) || (this.radius * 2);

    const scaleX = currentW / (this.radius * 2);
    const scaleY = currentH / (this.radius * 2);

    // Tilt angle from top/bottom alignment
    const tilt = Math.atan2(botV.x - topV.x, botV.y - topV.y) * -0.35;

    return {
      x: cx + this.faceLag.x,
      y: cy + this.faceLag.y,
      scaleX: Math.max(0.4, Math.min(1.8, scaleX)),
      scaleY: Math.max(0.4, Math.min(1.8, scaleY)),
      tilt
    };
  }

  /**
   * Render the Slime soft body, aura, eyes, blush and mouth onto canvas
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!ctx) return;
    ctx.save();

    // 1. Aura / Glow depending on state
    this.drawAura(ctx);

    // 2. Soft-body Slime Jelly fill
    this.drawBody(ctx);

    // 3. Specular shine / liquid highlights
    this.drawHighlights(ctx);

    // 4. Facial features (Blush, Eyes, Mouth)
    this.drawFace(ctx);

    ctx.restore();
  }

  /**
   * Draw dynamic state glow around the slime
   */
  drawAura(ctx) {
    const glowColors = {
      idle: 'rgba(224, 231, 255, 0.45)',
      thinking: 'rgba(6, 182, 212, 0.65)',
      alert: 'rgba(245, 158, 11, 0.70)',
      speaking: 'rgba(16, 185, 129, 0.65)',
      docked: 'rgba(255, 255, 255, 0.35)'
    };
    const color = glowColors[this.state] || glowColors.idle;
    const pulse = 12 + Math.sin(this.time * 4) * 4;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse;
    this.traceOutline(ctx);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Trace the smooth spline path through soft-body vertices
   */
  traceOutline(ctx) {
    const N = this.vertices.length;
    if (N < 3) return;

    ctx.beginPath();
    // Start at midpoint between last and first vertex
    const last = this.vertices[N - 1];
    const first = this.vertices[0];
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

    for (let i = 0; i < N; i++) {
      const curr = this.vertices[i];
      const next = this.vertices[(i + 1) % N];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }
    ctx.closePath();
  }

  /**
   * Draw glossy jelly gradient body with Rimuru Tempest's signature azure blue translucence
   */
  drawBody(ctx) {
    ctx.save();
    this.traceOutline(ctx);

    // Radial gradient for 3D translucent liquid volume in Rimuru azure blue
    const gradX = this.x - this.radius * 0.2;
    const gradY = this.y - this.radius * 0.25;
    const grad = ctx.createRadialGradient(
      gradX,
      gradY,
      this.radius * 0.08,
      this.x,
      this.y,
      this.radius * 1.25
    );

    // Rimuru Tempest translucent sky blue palette
    grad.addColorStop(0, 'rgba(218, 244, 255, 0.98)');
    grad.addColorStop(0.35, 'rgba(155, 218, 255, 0.96)');
    grad.addColorStop(0.72, 'rgba(110, 188, 250, 0.93)');
    grad.addColorStop(1, 'rgba(72, 162, 242, 0.90)');

    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle edge rim stroke in darker anime blue
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw anime specular highlights (Rimuru's glossy crescent liquid reflection)
   */
  drawHighlights(ctx) {
    if (this.state === 'docked') return;

    ctx.save();
    const center = this.getCenter();
    if (ctx.translate) ctx.translate(center.x, center.y);
    if (ctx.rotate) ctx.rotate(center.tilt);
    if (ctx.scale) ctx.scale(center.scaleX, center.scaleY);

    // 1. Primary glossy curved crescent reflection on top
    ctx.beginPath();
    const hx = -this.radius * 0.32;
    const hy = -this.radius * 0.40;
    ctx.ellipse(hx, hy, this.radius * 0.32, this.radius * 0.14, -Math.PI / 5.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();

    // 2. Secondary lower rim shine / translucency reflection
    ctx.beginPath();
    ctx.arc(hx - 8, hy + 14, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fill();

    // 3. Subtle bottom inner glow highlight
    ctx.beginPath();
    ctx.ellipse(this.radius * 0.2, this.radius * 0.48, this.radius * 0.35, this.radius * 0.09, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw Rimuru Tempest's facial features (iconic angled slit eyes, blush, sweatdrop, mouth)
   * The face is transformed with the dynamic center, tilt, and scale of the soft-body jelly
   */
  drawFace(ctx) {
    ctx.save();
    const center = this.getCenter();

    // Eye target tracking displacement
    const dx = this.currentLook.x - center.x;
    const dy = this.currentLook.y - center.y;
    const dist = Math.hypot(dx, dy) || 1;
    const maxLook = 6;
    const lookX = (dx / dist) * Math.min(dist * 0.08, maxLook);
    const lookY = (dy / dist) * Math.min(dist * 0.08, maxLook);

    // Transform context to dynamic body center so the face squishes, stretches,
    // tilts, and bounces in organic cohesion with the slime body
    if (ctx.translate) ctx.translate(center.x, center.y);
    if (ctx.rotate) ctx.rotate(center.tilt);
    if (ctx.scale) ctx.scale(center.scaleX, center.scaleY);

    const eyeSpacing = this.state === 'docked' ? 24 : 17;
    const eyeOffsetY = this.state === 'docked' ? -1 : -1;

    const leftEyeX = -eyeSpacing + lookX;
    const rightEyeX = eyeSpacing + lookX;
    const eyeY = eyeOffsetY + lookY;

    // 1. Blush cheeks (Rimuru pink ovals)
    this.drawBlush(ctx, leftEyeX - 6, rightEyeX + 6, eyeY + 10);

    // 2. Sweatdrop when thinking or busy (iconic anime expression)
    if (this.state === 'thinking' || this.state === 'alert') {
      this.drawSweatdrop(ctx, rightEyeX + 16, eyeY - 14);
    }

    // 3. Eyes (Rimuru signature angled line slits)
    if (this.state === 'docked') {
      this.drawHappyClosedEyes(ctx, leftEyeX, rightEyeX, eyeY);
    } else if (this.isBlinking) {
      this.drawBlinkingEyes(ctx, leftEyeX, rightEyeX, eyeY);
    } else {
      this.drawRimuruEyes(ctx, leftEyeX, rightEyeX, eyeY, lookX, lookY);
    }

    // 4. Mouth
    this.drawMouth(ctx, lookX * 0.6, eyeY + 9);

    ctx.restore();
  }

  /**
   * Draw soft pink blush on cheeks
   */
  drawBlush(ctx, lx, rx, y) {
    ctx.save();
    const blushAlpha = this.state === 'speaking' || this.state === 'alert' ? 0.65 : 0.45;
    ctx.fillStyle = `rgba(244, 114, 182, ${blushAlpha})`;

    ctx.beginPath();
    ctx.ellipse(lx, y, 7.0, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(rx, y, 7.0, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw Rimuru Tempest's signature angled line eyes (\ /) with expression tick marks
   */
  drawRimuruEyes(ctx, lx, rx, y, lookX, lookY) {
    ctx.save();
    const eyeColor = '#1e293b'; // Deep slate blue/black
    ctx.strokeStyle = eyeColor;
    ctx.fillStyle = eyeColor;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const isAlert = this.state === 'alert';
    const isThinking = this.state === 'thinking';

    // Slant geometry: \ /
    const slantW = isAlert ? 9 : 8;
    const slantH = isAlert ? 6 : 5;

    // Left eye: \ (starts higher on the left, goes down towards center)
    ctx.beginPath();
    ctx.moveTo(lx - slantW * 0.7, y - slantH * 0.6);
    ctx.lineTo(lx + slantW * 0.6, y + slantH * 0.6);
    ctx.stroke();

    // Left double tick accents (\ \)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(lx - slantW * 0.35, y - slantH * 0.9);
    ctx.lineTo(lx + slantW * 0.15, y - slantH * 0.2);
    ctx.stroke();

    // Right eye: / (starts higher on the right, goes down towards center)
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(rx + slantW * 0.7, y - slantH * 0.6);
    ctx.lineTo(rx - slantW * 0.6, y + slantH * 0.6);
    ctx.stroke();

    // Right double tick accents (/ /)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(rx + slantW * 0.35, y - slantH * 0.9);
    ctx.lineTo(rx - slantW * 0.15, y - slantH * 0.2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw iconic anime sweatdrop for thinking/overwhelmed state
   */
  drawSweatdrop(ctx, sx, sy) {
    ctx.save();
    const bob = Math.sin(this.time * 6) * 1.5;
    const y = sy + bob;

    ctx.beginPath();
    ctx.moveTo(sx, y - 6);
    ctx.bezierCurveTo(sx + 5, y - 1, sx + 5, y + 5, sx, y + 5);
    ctx.bezierCurveTo(sx - 5, y + 5, sx - 5, y - 1, sx, y - 6);
    ctx.closePath();

    ctx.fillStyle = 'rgba(96, 165, 250, 0.92)'; // Bright sky blue teardrop
    ctx.fill();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Highlight dot on sweatdrop
    ctx.beginPath();
    ctx.arc(sx - 1.2, y + 1, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw cute open glossy anime eyes
   */
  drawOpenEyes(ctx, lx, rx, y, lookX, lookY) {
    ctx.save();
    const eyeWidth = this.state === 'alert' ? 5.5 : 4.5;
    const eyeHeight = this.state === 'alert' ? 8.5 : 7.0;

    const eyeColor = '#1e1b4b';

    for (const ex of [lx, rx]) {
      // Main pupil
      ctx.beginPath();
      ctx.ellipse(ex, y, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
      ctx.fillStyle = eyeColor;
      ctx.fill();

      // Big primary shine reflection
      ctx.beginPath();
      ctx.arc(ex - 1.5, y - 2.5, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Small secondary reflection
      ctx.beginPath();
      ctx.arc(ex + 1.6, y + 2.0, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw blinking eyes (horizontal slits)
   */
  drawBlinkingEyes(ctx, lx, rx, y) {
    ctx.save();
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    for (const ex of [lx, rx]) {
      ctx.beginPath();
      ctx.moveTo(ex - 4, y);
      ctx.lineTo(ex + 4, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw happy anime closed curved eyes (^^)
   */
  drawHappyClosedEyes(ctx, lx, rx, y) {
    ctx.save();
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';

    for (const ex of [lx, rx]) {
      ctx.beginPath();
      ctx.arc(ex, y + 1, 5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw expressive mouth based on state
   */
  drawMouth(ctx, mx, my) {
    ctx.save();
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';

    if (this.state === 'speaking') {
      // Mouth oscillates open/closed with audio amplitude
      const amp = this.speechAmplitude > 0 ? this.speechAmplitude : (Math.sin(this.speechPhase) + 1) * 0.35;
      const mouthHeight = Math.max(2, amp * 9);
      const mouthWidth = 4 + amp * 3;

      ctx.beginPath();
      ctx.ellipse(mx, my + 1, mouthWidth, mouthHeight, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1e1b4b';
      ctx.fill();

      // Cute pink tongue
      if (mouthHeight > 4) {
        ctx.beginPath();
        ctx.arc(mx, my + mouthHeight - 1, mouthWidth * 0.6, 0, Math.PI);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
      }
    } else if (this.state === 'alert') {
      // Small surprise "o"
      ctx.beginPath();
      ctx.ellipse(mx, my + 2, 3.2, 4.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1e1b4b';
      ctx.fill();
    } else if (this.state === 'thinking') {
      // Tiny curious wavy line
      ctx.beginPath();
      ctx.moveTo(mx - 3.5, my + 1);
      ctx.quadraticCurveTo(mx, my + 2.5, mx + 3.5, my + 0.5);
      ctx.stroke();
    } else if (this.state === 'docked') {
      // Tiny peaceful smile
      ctx.beginPath();
      ctx.arc(mx, my - 1, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      // Idle: cute gentle cat smile
      ctx.beginPath();
      ctx.arc(mx - 2.5, my, 2.5, 0.1 * Math.PI, 0.85 * Math.PI);
      ctx.arc(mx + 2.5, my, 2.5, 0.15 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }
}
