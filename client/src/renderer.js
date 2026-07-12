import { generateTerrain } from '../../server/shared/physics.js';

export class GameRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    
    this.terrainMap = null;
    this.players = [];
    this.projectilePath = null;
    this.projectileIndex = 0;
    this.explosion = null;
    this.smokeParticles = [];
  }

  initTerrain(seed) {
    this.terrainMap = generateTerrain(seed, this.width, this.height);
  }
  
  applyDamage(terrainChanges) {
    if (this.terrainMap && terrainChanges) {
      for (const change of terrainChanges) {
        this.terrainMap[change.x] = change.y;
      }
    }
  }

  setPlayers(players) {
    // preserve current angle if we just get a state update
    for (let p of players) {
       const existing = this.players.find(oldP => oldP.socketId === p.socketId);
       if (existing && existing.angle !== undefined) {
          p.angle = existing.angle;
       } else if (p.angle === undefined) {
          p.angle = 45;
       }
    }
    this.players = players;
  }

  animateProjectile(path, hit, terrainChanges, onComplete) {
    this.projectilePath = path;
    this.projectileIndex = 0;
    this.smokeParticles = [];
    
    const animate = () => {
      this.projectileIndex += 3; 
      
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
      this.smokeParticles = this.smokeParticles.filter(s => s.life > 0);

      if (this.projectileIndex >= this.projectilePath.length) {
        this.projectilePath = null;
        
        if (hit.radius > 0) {
          this.explosion = { x: hit.x, y: hit.y, radius: 0, maxRadius: hit.radius, alpha: 1 };
          this.animateExplosion(terrainChanges, onComplete);
        } else {
          onComplete();
        }
      } else {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }
  
  animateExplosion(terrainChanges, onComplete) {
    const animate = () => {
      if (!this.explosion) return;
      this.explosion.radius += 2;
      this.explosion.alpha -= 0.05;
      
      // update smoke
      for (let s of this.smokeParticles) {
         s.life -= 0.05;
         s.radius = (1 - s.life) * 15;
      }
      this.smokeParticles = this.smokeParticles.filter(s => s.life > 0);

      if (this.explosion.alpha <= 0) {
        this.applyDamage(terrainChanges);
        this.explosion = null;
        this.smokeParticles = [];
        onComplete();
      } else {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  draw() {
    // 1. Sky Gradient
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#000000'); // Nero
    skyGrad.addColorStop(1, '#282828'); // Nero 95%
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // 2. Terrain
    if (this.terrainMap) {
      const terrGrad = this.ctx.createLinearGradient(0, this.height * 0.3, 0, this.height);
      terrGrad.addColorStop(0, '#CDC8BE'); // Sabbia (Sand/Dirt)
      terrGrad.addColorStop(1, '#282828'); // Nero 95%
      this.ctx.fillStyle = terrGrad;
      this.ctx.beginPath();
      this.ctx.moveTo(0, this.height);
      for (let x = 0; x < this.width; x++) {
        this.ctx.lineTo(x, this.terrainMap[x]);
      }
      this.ctx.lineTo(this.width, this.height);
      this.ctx.fill();
      
      this.ctx.strokeStyle = '#CDC8B9';
      this.ctx.lineWidth = 4;
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      for (let x = 0; x < this.width; x++) {
        if(x===0) this.ctx.moveTo(x, this.terrainMap[x]);
        else this.ctx.lineTo(x, this.terrainMap[x]);
      }
      this.ctx.stroke();
    }
    
    // 3. Players (Tanks)
    for (const p of this.players) {
      if (!p.alive) continue;
      
      // Bianco for Team A, Rosso for Team B
      const teamColor = p.team === 'A' ? '#FFFFFF' : '#F01E28';
      const darkColor = p.team === 'A' ? '#CDC8BE' : '#8A0F15';
      
      const tx = p.position.x;
      const ty = p.position.y - 4; // lift slightly above ground
      
      let slopeAngle = 0;
      if (this.terrainMap) {
        const x1 = Math.max(0, Math.floor(tx - 15));
        const x2 = Math.min(this.width - 1, Math.floor(tx + 15));
        const y1 = this.terrainMap[x1];
        const y2 = this.terrainMap[x2];
        slopeAngle = Math.atan2(y2 - y1, x2 - x1);
      }

      this.ctx.save();
      this.ctx.translate(tx, ty);
      this.ctx.rotate(slopeAngle);
      
      // Draw Treads
      this.ctx.fillStyle = '#334155';
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
         this.ctx.roundRect(-18, -4, 36, 8, 4);
      } else {
         this.ctx.rect(-18, -4, 36, 8);
      }
      this.ctx.fill();
      
      // Wheels
      this.ctx.fillStyle = '#0f172a';
      for(let wx = -12; wx <= 12; wx += 8) {
         this.ctx.beginPath();
         this.ctx.arc(wx, 0, 3, 0, Math.PI*2);
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
      
      this.ctx.strokeStyle = '#cbd5e1';
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(0, -12);
      this.ctx.lineTo(barrelEndX, barrelEndY);
      this.ctx.stroke();

      this.ctx.restore();
      
      // Name & HP Tag Background
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
         this.ctx.roundRect(tx - 30, ty - 38, 60, 16, 4);
      } else {
         this.ctx.rect(tx - 30, ty - 38, 60, 16);
      }
      this.ctx.fill();
      
      this.ctx.fillStyle = 'white';
      this.ctx.font = 'bold 10px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`${p.nickname} (${Math.floor(p.hp)})`, tx, ty - 30);
    }
    
    // 4. Smoke Trail
    for (let s of this.smokeParticles) {
      this.ctx.fillStyle = `rgba(200, 200, 200, ${Math.max(0, s.life * 0.5)})`;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // 5. Projectile (Missile)
    if (this.projectilePath && this.projectileIndex < this.projectilePath.length) {
      const point = this.projectilePath[this.projectileIndex];
      const prevPoint = this.projectileIndex > 0 ? this.projectilePath[this.projectileIndex - 1] : point;
      
      let angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x);
      
      this.ctx.save();
      this.ctx.translate(point.x, point.y);
      this.ctx.rotate(angle);
      
      // Draw Missile
      this.ctx.fillStyle = '#fef08a';
      this.ctx.beginPath();
      this.ctx.moveTo(8, 0); // nose
      this.ctx.lineTo(-4, 4);
      this.ctx.lineTo(-4, -4);
      this.ctx.closePath();
      this.ctx.fill();
      
      // Engine flame
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.moveTo(-4, 2);
      this.ctx.lineTo(-10 - Math.random() * 4, 0); // flickering tail
      this.ctx.lineTo(-4, -2);
      this.ctx.closePath();
      this.ctx.fill();
      
      this.ctx.restore();
    }
    
    // 6. Explosion
    if (this.explosion) {
      const grad = this.ctx.createRadialGradient(this.explosion.x, this.explosion.y, 0, this.explosion.x, this.explosion.y, this.explosion.radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, this.explosion.alpha)})`);
      grad.addColorStop(0.2, `rgba(250, 204, 21, ${Math.max(0, this.explosion.alpha)})`);
      grad.addColorStop(0.6, `rgba(239, 68, 68, ${Math.max(0, this.explosion.alpha)})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(this.explosion.x, this.explosion.y, this.explosion.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    requestAnimationFrame(() => this.draw());
  }
}
