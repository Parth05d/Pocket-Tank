import { generateTerrain } from "../../server/shared/physics.js";

export class GameRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.terrainMap = null;
    this.terrainEffects = [];
    this.players = [];
    this.projectilePath = null;
    this.projectileIndex = 0;
    this.explosion = null;
    this.smokeParticles = [];
    this.damageTexts = [];
    this.pendingDamageSequences = [];
    this.isDamageTextAnimating = false;
    this.particles = [];
    this.screenShake = 0;

    // Load Photorealistic Assets
    this.imgTankChassis = new Image();
    this.imgTankChassis.src = "/assets/tank_chassis.png";
    this.imgTankTurret = new Image();
    this.imgTankTurret.src = "/assets/tank_turret.png";
    this.imgDirt = new Image();
    this.imgDirt.src = "/assets/dirt_texture.png";
    this.imgBg = new Image();
    this.imgBg.src = "/assets/night_sky_bg.png";
  }

  initTerrain(seed, effects = []) {
    this.terrainMap = generateTerrain(seed, this.width, this.height);
    this.terrainEffects = effects;
  }

  applyDamage(terrainChanges, newEffects) {
    if (this.terrainMap && terrainChanges) {
      for (const change of terrainChanges) {
        this.terrainMap[change.x] = change.y;
      }
    }
    if (newEffects) {
      this.terrainEffects = newEffects;
    }
  }

  setPlayers(players) {
    for (let p of players) {
      const existing = this.players.find(
        (oldP) => oldP.socketId === p.socketId,
      );
      if (existing) {
        if (existing.angle !== undefined) p.angle = existing.angle;
        p.renderX =
          existing.renderX !== undefined ? existing.renderX : p.position.x;
        p.renderY =
          existing.renderY !== undefined ? existing.renderY : p.position.y;
        p.vy = existing.vy || 0;
      } else {
        if (p.angle === undefined) p.angle = 45;
        p.renderX = p.position.x;
        p.renderY = p.position.y;
        p.vy = 0;
      }
    }
    this.players = players;
  }

  animateProjectile(
    path,
    hit,
    terrainChanges,
    damageEvents,
    newPlayers,
    onComplete,
  ) {
    this.projectilePath = path;
    this.projectileIndex = 0;
    this.smokeParticles = [];

    const animate = () => {
      if (!this.projectilePath) return; // Prevent crash if multiple animations overlap

      // Advance projectile 1 step per frame instead of 3 to make it trackable by human eye
      this.projectileIndex += 1;

      // add smoke
      if (this.projectileIndex < this.projectilePath.length) {
        const p = this.projectilePath[this.projectileIndex];
        this.smokeParticles.push({ x: p.x, y: p.y, life: 1.0 });
      }

      // update smoke
      for (let s of this.smokeParticles) {
        s.life -= 0.02;
        s.radius = (1 - s.life) * 10;
      }
      this.smokeParticles = this.smokeParticles.filter((s) => s.life > 0);

      if (this.projectileIndex >= this.projectilePath.length) {
        this.projectilePath = null;

        if (hit.radius > 0 || hit.hasEffects) {
          this.explosion = {
            x: hit.x,
            y: hit.y,
            radius: 0,
            maxRadius: hit.radius || 40,
            alpha: 1,
            weapon: hit.weapon,
          };

          this.screenShake = hit.weapon === "napalm" ? 25 : 15;

          // Spawn realistic particles
          const numParticles = hit.weapon === "napalm" ? 100 : 50;
          for (let i = 0; i < numParticles; i++) {
            this.particles.push({
              x: hit.x,
              y: hit.y,
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 1) * 15,
              life: 1.0 + Math.random() * 0.5,
              color: Math.random() > 0.5 ? "#facc15" : "#ef4444", // sparks
            });
          }

          // Apply crater and tank movement IMMEDIATELY so it happens simultaneously with the blast
          this.applyDamage(terrainChanges, hit.newEffects);
          this.setPlayers(newPlayers);

          this.animateExplosion(damageEvents, onComplete);
        } else {
          this.setPlayers(newPlayers);
          onComplete();
        }
      } else {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  animateExplosion(damageEvents, onComplete) {
    this.pendingDamageSequences = [];
    if (damageEvents && damageEvents.length > 0) {
      const instantEvents = damageEvents.filter((e) => !e.sequence);
      this.pendingDamageSequences = damageEvents
        .filter((e) => e.sequence)
        .map((e) => ({
          sequence: [...e.sequence],
          x: e.x,
          y: e.y,
          timer: 0,
        }));

      this.damageTexts = instantEvents.map((evt) => ({
        text: `-${evt.damage}`,
        x: evt.x,
        y: evt.y,
        life: 1.0,
      }));
      if (this.damageTexts.length > 0) {
        this.startDamageTextAnimation();
      }
    }

    const isNapalm = this.explosion && this.explosion.weapon === "napalm";

    const animate = () => {
      let keepAnimating = false;

      // Process pending sequences
      if (
        this.pendingDamageSequences &&
        this.pendingDamageSequences.length > 0
      ) {
        keepAnimating = true;
        this.pendingDamageSequences.forEach((seq) => {
          seq.timer++;
          if (seq.timer % 30 === 0 && seq.sequence.length > 0) {
            const dmg = seq.sequence.shift();
            this.damageTexts.push({
              text: `-${dmg}`,
              x: seq.x + (Math.random() * 20 - 10), // slight jitter
              y: seq.y,
              life: 1.0,
            });
            this.startDamageTextAnimation();
          }
        });
        this.pendingDamageSequences = this.pendingDamageSequences.filter(
          (s) => s.sequence.length > 0,
        );
      }

      if (this.explosion) {
        keepAnimating = true;
        // Explode slower
        this.explosion.radius += isNapalm ? 0.5 : 1;
        this.explosion.alpha -= isNapalm ? 0.005 : 0.02; // Napalm lasts longer

        // update smoke
        for (let s of this.smokeParticles) {
          s.life -= 0.05;
          s.radius = (1 - s.life) * 15;
        }
        this.smokeParticles = this.smokeParticles.filter((s) => s.life > 0);

        if (this.explosion.alpha <= 0) {
          this.explosion = null;
          this.smokeParticles = [];
        }
      }

      if (keepAnimating) {
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };
    animate();
  }

  startDamageTextAnimation() {
    if (this.isDamageTextAnimating) return;
    this.isDamageTextAnimating = true;

    const animate = () => {
      for (const t of this.damageTexts) {
        t.y -= 0.3; // float up slower
        t.life -= 0.01; // fade out slower
      }
      this.damageTexts = this.damageTexts.filter((t) => t.life > 0);

      if (this.damageTexts.length > 0) {
        requestAnimationFrame(animate);
      } else {
        this.isDamageTextAnimating = false;
      }
    };
    animate();
  }

  draw() {
    this.ctx.save();

    // Screen Shake
    if (this.screenShake > 0) {
      const dx = (Math.random() - 0.5) * this.screenShake;
      const dy = (Math.random() - 0.5) * this.screenShake;
      this.ctx.translate(dx, dy);
      this.screenShake *= 0.9;
      if (this.screenShake < 0.5) this.screenShake = 0;
    }

    // 1. Sky / Background
    if (this.imgBg.complete && this.imgBg.naturalWidth > 0) {
      this.ctx.drawImage(this.imgBg, 0, 0, this.width, this.height);
    } else {
      const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
      skyGrad.addColorStop(0, "#000000");
      skyGrad.addColorStop(1, "#282828");
      this.ctx.fillStyle = skyGrad;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Terrain
    if (this.terrainMap) {
      const terrainPath = new Path2D();
      terrainPath.moveTo(0, this.height);
      for (let x = 0; x < this.width; x++) {
        terrainPath.lineTo(x, this.terrainMap[x]);
      }
      terrainPath.lineTo(this.width, this.height);

      if (this.imgDirt.complete && this.imgDirt.naturalWidth > 0) {
        const pattern = this.ctx.createPattern(this.imgDirt, "repeat");
        this.ctx.fillStyle = pattern || "#CDC8BE";
      } else {
        this.ctx.fillStyle = "#CDC8BE";
      }
      this.ctx.fill(terrainPath);

      // Render terrain effects (e.g. burn marks)
      if (this.terrainEffects && this.terrainEffects.length > 0) {
        this.ctx.save();
        this.ctx.clip(terrainPath);

        for (const effect of this.terrainEffects) {
          const surfaceY = this.terrainMap[Math.floor(effect.x)] || this.height;
          const burnGrad = this.ctx.createRadialGradient(
            effect.x,
            surfaceY,
            0,
            effect.x,
            surfaceY,
            effect.radius,
          );
          if (effect.type === "burn") {
            burnGrad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
            burnGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.6)");
            burnGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          } else if (effect.type === "napalm") {
            burnGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
            burnGrad.addColorStop(0.5, "rgba(20, 20, 20, 0.7)");
            burnGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          }
          this.ctx.fillStyle = burnGrad;
          this.ctx.fillRect(
            effect.x - effect.radius,
            surfaceY - effect.radius,
            effect.radius * 2,
            effect.radius * 2,
          );
        }
        this.ctx.restore();
      }

      this.ctx.strokeStyle = "#22c55e"; // Grass line
      this.ctx.lineWidth = 4;
      this.ctx.lineJoin = "round";
      this.ctx.beginPath();
      for (let x = 0; x < this.width; x++) {
        if (x === 0) this.ctx.moveTo(x, this.terrainMap[x]);
        else this.ctx.lineTo(x, this.terrainMap[x]);
      }
      this.ctx.stroke();
    }

    // 3. Players (Tanks)
    for (const p of this.players) {
      if (!p.alive) continue;

      // Ensure init
      if (p.renderX === undefined) p.renderX = p.position.x;
      if (p.renderY === undefined) p.renderY = p.position.y;

      const targetY =
        this.terrainMap && p.renderX >= 0 && p.renderX < this.width
          ? this.terrainMap[Math.floor(p.renderX)]
          : p.position.y;

      // If the tank is more than 5 pixels above the ground, it's falling.
      const isGrounded = p.renderY >= targetY - 5;

      if (!isGrounded) {
        // Gravity Physics (Falling)
        p.vy = (p.vy || 0) + 0.4;
        p.renderY += p.vy;
        if (p.renderY > targetY) {
          p.renderY = targetY; // hit ground
          p.vy = 0;
        }
      } else {
        // Grounded Physics
        p.renderY = targetY;
        p.vy = 0;

        // Driving Physics (Only drive if grounded)
        const dx = p.position.x - p.renderX;
        if (Math.abs(dx) > 1) {
          p.renderX += Math.sign(dx) * 2; // driving speed
        } else {
          p.renderX = p.position.x;
        }
      }

      const tx = p.renderX;
      let ty = p.renderY - 4;
      let slopeAngle = 0;

      if (this.terrainMap) {
        const x1 = Math.max(0, Math.floor(tx - 20));
        const x2 = Math.min(this.width - 1, Math.floor(tx + 20));
        const y1 = this.terrainMap[x1];
        const y2 = this.terrainMap[x2];
        slopeAngle = Math.atan2(y2 - y1, x2 - x1);
      }

      this.ctx.save();
      this.ctx.translate(tx, ty);
      this.ctx.rotate(slopeAngle);

      // Bianco for Team A, Rosso for Team B
      const teamColor = p.team === "A" ? "#FFFFFF" : "#F01E28";
      const darkColor = p.team === "A" ? "#CDC8BE" : "#8A0F15";

      // Draw Treads
      this.ctx.fillStyle = "#334155";
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
        this.ctx.roundRect(-18, -4, 36, 8, 4);
      } else {
        this.ctx.rect(-18, -4, 36, 8);
      }
      this.ctx.fill();

      // Wheels
      this.ctx.fillStyle = "#0f172a";
      for (let wx = -12; wx <= 12; wx += 8) {
        this.ctx.beginPath();
        this.ctx.arc(wx, 0, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Hull
      this.ctx.fillStyle = teamColor;
      this.ctx.beginPath();
      this.ctx.moveTo(-15, -4);
      this.ctx.lineTo(15, -4);
      this.ctx.lineTo(10, -12);
      this.ctx.lineTo(-10, -12);
      this.ctx.closePath();
      this.ctx.fill();

      // Turret
      this.ctx.fillStyle = darkColor;
      this.ctx.beginPath();
      this.ctx.arc(0, -12, 6, Math.PI, 0);
      this.ctx.fill();

      // Gun barrel
      const angleAbs = -(p.angle || 45) * (Math.PI / 180);
      const angleRel = angleAbs - slopeAngle;
      const barrelLen = 18;
      const barrelEndX = Math.cos(angleRel) * barrelLen;
      const barrelEndY = -12 + Math.sin(angleRel) * barrelLen;

      this.ctx.strokeStyle = "#cbd5e1";
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(0, -12);
      this.ctx.lineTo(barrelEndX, barrelEndY);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // 4. Custom Physics Particles
    for (let p of this.particles) {
      p.vy += 0.4; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;

      const px = Math.floor(p.x);
      if (px >= 0 && px < this.width && this.terrainMap) {
        if (p.y >= this.terrainMap[px]) {
          p.y = this.terrainMap[px];
          p.vy *= -0.5;
          p.vx *= 0.8;
        }
      }

      this.ctx.globalCompositeOperation = "lighter";
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
      this.ctx.globalCompositeOperation = "source-over";
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // 5. Smoke Trail
    for (let s of this.smokeParticles) {
      this.ctx.fillStyle = `rgba(200, 200, 200, ${Math.max(0, s.life * 0.5)})`;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 6. Projectile
    if (
      this.projectilePath &&
      this.projectileIndex < this.projectilePath.length
    ) {
      const point = this.projectilePath[this.projectileIndex];
      const prevPoint =
        this.projectileIndex > 0
          ? this.projectilePath[this.projectileIndex - 1]
          : point;

      let angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x);

      this.ctx.save();
      this.ctx.translate(point.x, point.y);
      this.ctx.rotate(angle);

      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = "#ef4444";

      this.ctx.fillStyle = "#fef08a";
      this.ctx.beginPath();
      this.ctx.moveTo(8, 0);
      this.ctx.lineTo(-4, 4);
      this.ctx.lineTo(-4, -4);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = "#ef4444";
      this.ctx.beginPath();
      this.ctx.moveTo(-4, 2);
      this.ctx.lineTo(-10 - Math.random() * 4, 0);
      this.ctx.lineTo(-4, -2);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }

    // 7. Explosion
    if (this.explosion) {
      const isNapalm = this.explosion.weapon === "napalm";
      const grad = this.ctx.createRadialGradient(
        this.explosion.x,
        this.explosion.y,
        0,
        this.explosion.x,
        this.explosion.y,
        this.explosion.radius,
      );

      if (isNapalm) {
        grad.addColorStop(
          0,
          `rgba(255, 100, 0, ${Math.max(0, this.explosion.alpha)})`,
        );
        grad.addColorStop(
          0.4,
          `rgba(200, 0, 0, ${Math.max(0, this.explosion.alpha)})`,
        );
        grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      } else {
        grad.addColorStop(
          0,
          `rgba(255, 255, 255, ${Math.max(0, this.explosion.alpha)})`,
        );
        grad.addColorStop(
          0.2,
          `rgba(250, 204, 21, ${Math.max(0, this.explosion.alpha)})`,
        );
        grad.addColorStop(
          0.6,
          `rgba(239, 68, 68, ${Math.max(0, this.explosion.alpha)})`,
        );
        grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      }

      this.ctx.globalCompositeOperation = "lighter";
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(
        this.explosion.x,
        this.explosion.y,
        this.explosion.radius,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
      this.ctx.globalCompositeOperation = "source-over";
    }

    // 8. Damage Texts
    if (this.damageTexts && this.damageTexts.length > 0) {
      this.ctx.font = "bold 24px monospace";
      this.ctx.textAlign = "center";
      for (const t of this.damageTexts) {
        if (t.life > 0) {
          this.ctx.fillStyle = `rgba(255, 50, 50, ${Math.max(0, t.life)})`;
          this.ctx.fillText(t.text, t.x, t.y);
        }
      }
    }

    this.ctx.restore();
    requestAnimationFrame(() => this.draw());
  }
}
