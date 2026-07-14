export function generateTerrain(seed, width, height) {
  let m_w = 123456789 + seed;
  let m_z = 987654321 - seed;
  let mask = 0xffffffff;

  function random() {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    let result = ((m_z << 16) + m_w) & mask;
    result /= 4294967296;
    return result + 0.5;
  }

  const heightmap = new Array(width);
  const numWaves = 4;
  const waves = [];
  
  for(let i = 0; i < numWaves; i++) {
    waves.push({
      freq: (random() * 0.015) + 0.002,
      amp: (random() * 60) + 10,
      phase: random() * Math.PI * 2
    });
  }
  
  const baseHeight = height * 0.6; 

  for (let x = 0; x < width; x++) {
    let yOffset = 0;
    for(let w of waves) {
      yOffset += Math.sin(x * w.freq + w.phase) * w.amp;
    }
    heightmap[x] = Math.max(10, Math.min(height - 10, baseHeight + yOffset));
  }
  
  return heightmap;
}

export function applyTerrainDelta(heightmap, impactX, impactY, radius) {
  const minX = Math.max(0, Math.floor(impactX - radius));
  const maxX = Math.min(heightmap.length - 1, Math.ceil(impactX + radius));
  
  const changes = [];
  
  for (let x = minX; x <= maxX; x++) {
    const dx = x - impactX;
    const dy = Math.sqrt(radius * radius - dx * dx);
    
    // In Canvas, +y is down.
    // The top of the explosion circle at this x is (impactY - dy)
    // The bottom of the explosion circle at this x is (impactY + dy)
    const explosionTop = impactY - dy;
    const craterBottomY = impactY + dy; 
    
    // The dirt above explosionTop falls down.
    // So if the current surface is at heightmap[x], and it's higher (smaller Y) than craterBottomY:
    if (heightmap[x] < craterBottomY) {
      // Calculate how much dirt was vaporized by this column of the explosion
      const topOfVaporizedDirt = Math.max(heightmap[x], explosionTop);
      const dirtVaporized = craterBottomY - topOfVaporizedDirt;
      
      if (dirtVaporized > 0) {
        heightmap[x] += dirtVaporized;
        changes.push({ x, y: heightmap[x] });
      }
    }
  }
  
  return changes;
}

export function calculateTrajectory(startX, startY, angleDegrees, power, wind, gravity) {
  // Angle: 0 is right, 90 is straight up, 180 is left. 
  // Wait, standard math: 0 is right, 90 up. But Canvas +y is down.
  // So angle needs to be converted.
  const angleRad = -angleDegrees * (Math.PI / 180);
  
  let velX = Math.cos(angleRad) * power;
  let velY = Math.sin(angleRad) * power;
  
  const path = [];
  let x = startX;
  let y = startY;
  
  let time = 0;
  const dt = 0.5; // step size
  
  // Simulate for max 500 steps to avoid infinite loops
  for(let i = 0; i < 500; i++) {
    path.push({ x, y });
    
    x += velX * dt;
    y += velY * dt;
    
    velX += wind * dt;
    velY += gravity * dt; // gravity is positive (pulls down)
  }
  
  return path;
}
