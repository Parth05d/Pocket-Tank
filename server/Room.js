import {
  generateTerrain,
  applyTerrainDelta,
  calculateTrajectory,
} from "./shared/physics.js";

export class Room {
  constructor(id, io) {
    this.id = id;
    this.io = io;
    this.status = "lobby"; // lobby, in-progress, finished
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    this.players = new Map(); // socketId -> Player
    this.turnOrder = [];
    this.currentTurnIndex = 0;

    this.terrain = null;
    this.terrainEffects = [];
    this.teams = { A: [], B: [] };

    this.turnTimer = null;
    this.TURN_DURATION_MS = 60000;
    this.currentVolley = 1;
    this.MAX_VOLLEYS = 10;
  }

  hasPlayer(socketId) {
    return this.players.has(socketId);
  }

  isEmpty() {
    return this.players.size === 0;
  }

  joinPlayer(socket, nickname) {
    if (this.status !== "lobby") {
      throw new Error("Game already in progress");
    }
    if (this.players.size >= 8) {
      throw new Error("Room is full");
    }

    socket.join(this.id);

    const team = this.teams.A.length <= this.teams.B.length ? "A" : "B";

    const player = {
      socketId: socket.id,
      nickname,
      team,
      tankId: `tank-${socket.id}`,
      score: 0,
      alive: true,
      position: { x: 0, y: 0 },
      angle: 45, // default angle
      power: 50,
      moves: 4,
    };

    this.players.set(socket.id, player);
    this.teams[team].push(socket.id);
    this.lastActivityAt = Date.now();

    this.broadcastState();
    this.registerRoomListeners(socket);
  }

  joinBot(difficulty = "normal") {
    if (this.status !== "lobby") throw new Error("Game already in progress");
    if (this.players.size >= 8) throw new Error("Room is full");

    const team = this.teams.A.length <= this.teams.B.length ? "A" : "B";
    const botId = `bot_${Math.random().toString(36).substr(2, 6)}`;

    const player = {
      socketId: botId,
      nickname: "CPU",
      team,
      tankId: `tank-${botId}`,
      score: 0,
      alive: true,
      position: { x: 0, y: 0 },
      angle: 45,
      power: 50,
      moves: 4,
      isBot: true,
      difficulty,
    };

    this.players.set(botId, player);
    this.teams[team].push(botId);
    this.lastActivityAt = Date.now();

    this.broadcastState();
  }

  broadcastState() {
    this.io.to(this.id).emit("room-state-update", {
      status: this.status,
      players: Array.from(this.players.values()),
      teams: this.teams,
    });
  }

  registerRoomListeners(socket) {
    socket.on("start-game", () => {
      this.startGame();
    });

    socket.on("fire", (data) => {
      this.handleFire(socket.id, data);
    });

    socket.on("aim", (data) => {
      this.handleAim(socket.id, data);
    });

    socket.on("move", (data) => {
      this.handleMove(socket.id, data);
    });
  }

  startGame() {
    if (this.status !== "lobby") return;
    if (this.players.size < 1) return; // For testing we allow 1 player, otherwise usually 2

    this.status = "in-progress";
    this.lastActivityAt = Date.now();

    // Generate terrain
    const seed = Math.floor(Math.random() * 10000);
    this.terrain = {
      seed: seed,
      heightmap: generateTerrain(seed, 1920, 1080), // standard 1920x1080 logical size
    };
    this.terrainEffects = [];

    // Set up turn order (alternating teams A, B, A, B...)
    this.turnOrder = [];
    const maxPlayersPerTeam = Math.max(
      this.teams.A.length,
      this.teams.B.length,
    );
    for (let i = 0; i < maxPlayersPerTeam; i++) {
      if (this.teams.A[i]) this.turnOrder.push(this.teams.A[i]);
      if (this.teams.B[i]) this.turnOrder.push(this.teams.B[i]);
    }
    this.currentTurnIndex = 0;
    this.currentVolley = 1;

    // Assign starting positions
    let i = 0;
    for (const player of this.players.values()) {
      // spread players out across the width
      const x = Math.floor(1920 * ((i + 1) / (this.players.size + 1)));
      player.position = { x: x, y: this.terrain.heightmap[x] };
      player.moves = 4;
      i++;
    }

    this.io.to(this.id).emit("game-started", {
      status: this.status,
      terrainSeed: this.terrain.seed,
      terrainEffects: this.terrainEffects,
      players: Array.from(this.players.values()),
      currentTurnSocketId: this.turnOrder[this.currentTurnIndex],
      currentVolley: this.currentVolley,
      maxVolleys: this.MAX_VOLLEYS,
    });

    this.startTurnTimer();
  }

  startTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    const currentTurnSocketId = this.turnOrder[this.currentTurnIndex];
    const player = this.players.get(currentTurnSocketId);

    this.io.to(this.id).emit("turn-started", {
      currentTurnSocketId,
      timeoutMs: this.TURN_DURATION_MS,
      currentVolley: this.currentVolley,
      maxVolleys: this.MAX_VOLLEYS,
    });

    if (player && player.isBot) {
      this.playBotTurn(player);
    }
  }

  playBotTurn(botPlayer) {
    // Bot takes 2 seconds to "think"
    setTimeout(() => {
      if (this.status !== "in-progress") return;
      if (this.turnOrder[this.currentTurnIndex] !== botPlayer.socketId) return; // double check it's still their turn

      // Simple AI: Try random shots until we find one that lands near an enemy
      let bestAngle = 45;
      let bestPower = 50;
      let bestDist = Infinity;

      // Find enemies
      const enemies = Array.from(this.players.values()).filter(
        (p) => p.alive && p.team !== botPlayer.team,
      );
      if (enemies.length === 0) return;
      const target = enemies[Math.floor(Math.random() * enemies.length)]; // pick random enemy

      // We know botPlayer.position.x and target.position.x
      // If target is to the right, aim 0-90. If left, aim 90-180
      const targetIsRight = target.position.x > botPlayer.position.x;
      const minAngle = targetIsRight ? 10 : 100;
      const maxAngle = targetIsRight ? 80 : 170;

      // Simulate 50 random shots and pick the best one
      for (let i = 0; i < 50; i++) {
        const testAngle = minAngle + Math.random() * (maxAngle - minAngle);
        const testPower = 30 + Math.random() * 100;

        const path = calculateTrajectory(
          botPlayer.position.x,
          botPlayer.position.y - 10,
          testAngle,
          testPower,
          0,
          9.8,
        );

        let hitX = -1;
        let hitY = -1;
        for (let point of path) {
          if (point.x < 0 || point.x >= 1920 || point.y >= 1080) {
            hitX = point.x;
            hitY = point.y;
            break;
          }
          const px = Math.floor(point.x);
          if (px >= 0 && px < 1920 && point.y >= this.terrain.heightmap[px]) {
            hitX = point.x;
            hitY = point.y;
            break;
          }
        }

        if (hitX !== -1) {
          const dx = hitX - target.position.x;
          const dy = hitY - target.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bestDist) {
            bestDist = dist;
            bestAngle = testAngle;
            bestPower = testPower;
          }
        }
      }

      // Add random error based on difficulty (e.g. +/- some angle/power)
      // Normal difficulty: might miss a bit
      const errorMargin = 5;
      const finalAngle =
        bestAngle + (Math.random() * errorMargin * 2 - errorMargin);
      const finalPower =
        bestPower + (Math.random() * errorMargin * 2 - errorMargin);

      this.handleFire(botPlayer.socketId, {
        angle: finalAngle,
        power: finalPower,
      });
    }, 2000);
  }

  advanceTurn() {
    if (this.turnOrder.length === 0) return;

    let attempts = 0;
    let nextIndex = this.currentTurnIndex;

    while (attempts < this.turnOrder.length) {
      nextIndex++;
      if (nextIndex >= this.turnOrder.length) {
        nextIndex = 0;
        this.currentVolley++;
      }

      if (this.currentVolley > this.MAX_VOLLEYS) {
        let teamAScore = 0;
        let teamBScore = 0;
        for (const id of this.teams.A) {
          const p = this.players.get(id);
          if (p) teamAScore += p.score;
        }
        for (const id of this.teams.B) {
          const p = this.players.get(id);
          if (p) teamBScore += p.score;
        }

        if (teamAScore > teamBScore)
          this.endGame(`Team A Wins with ${teamAScore} points!`);
        else if (teamBScore > teamAScore)
          this.endGame(`Team B Wins with ${teamBScore} points!`);
        else this.endGame(`Draw! Both teams scored ${teamAScore} points.`);
        return;
      }

      const p = this.players.get(this.turnOrder[nextIndex]);
      if (p && p.alive) {
        this.currentTurnIndex = nextIndex;
        this.startTurnTimer();
        return;
      }
      attempts++;
    }

    this.endGame("Game Over - All players disconnected");
  }

  handleAim(socketId, data) {
    if (this.status !== "in-progress") return;
    const player = this.players.get(socketId);
    if (player) {
      if (data.angle !== undefined) player.angle = data.angle;
      if (data.power !== undefined) player.power = data.power;

      // broadcast to everyone else in the room
      this.io.to(this.id).emit("aim-changed", {
        socketId,
        angle: player.angle,
        power: player.power,
      });
    }
  }

  handleMove(socketId, data) {
    if (this.status !== "in-progress") return;

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPlayerId) return;

    const player = this.players.get(socketId);
    if (!player || player.moves <= 0) return;

    const direction = data.direction === -1 ? -1 : 1;
    const moveDistance = 50;

    let newX = player.position.x + direction * moveDistance;
    if (newX < 0) newX = 0;
    if (newX > 1919) newX = 1919;

    player.position.x = newX;
    player.position.y = this.terrain.heightmap[Math.floor(newX)];
    player.moves -= 1;

    this.io.to(this.id).emit("tank-moved", {
      socketId,
      position: player.position,
      movesLeft: player.moves,
    });
  }

  handleFire(socketId, data) {
    if (this.status !== "in-progress") return;

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPlayerId) {
      console.log(`Player ${socketId} tried to fire out of turn!`);
      return;
    }

    this.lastActivityAt = Date.now();
    if (this.turnTimer) clearTimeout(this.turnTimer);

    const player = this.players.get(socketId);

    // Data contains: { angle, power, weapon }
    const { angle, power, weapon } = data;
    const isNapalm = weapon === "napalm";

    // 1. Calculate trajectory until hit
    const path = calculateTrajectory(
      player.position.x,
      player.position.y - 10,
      angle,
      power,
      0,
      9.8,
    ); // slight offset so it doesnt hit self immediately

    let hitX = -1;
    let hitY = -1;
    let finalPath = [];

    for (let point of path) {
      finalPath.push(point);
      // check bounds
      if (point.x < 0 || point.x >= 1920 || point.y >= 1080) {
        hitX = point.x;
        hitY = point.y;
        break; // out of bounds
      }

      // check terrain collision
      const px = Math.floor(point.x);
      if (px >= 0 && px < 1920 && point.y >= this.terrain.heightmap[px]) {
        hitX = point.x;
        hitY = point.y;
        break;
      }
    }

    let radius = 0;
    let terrainChanges = [];
    let damageEvents = [];

    // 2. If it hit the ground, apply damage
    if (hitX >= 0 && hitX < 1920 && hitY < 1080) {
      radius = isNapalm ? 60 : 40; // Napalm spreads wider

      if (!isNapalm) {
        terrainChanges = applyTerrainDelta(
          this.terrain.heightmap,
          hitX,
          hitY,
          radius,
        );
      } else {
        this.terrainEffects.push({
          type: "napalm",
          x: hitX,
          radius: radius * 1.2,
        });
      }

      // 3. Apply damage to tanks
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = p.position.x - hitX;
        const dy = p.position.y - hitY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < radius + 15) {
          let damage = 0;
          let sequence = null;

          if (isNapalm) {
            sequence = [2, 4, 8, 12, 16];
            damage = 42; // Sum of sequence
          } else {
            damage = Math.floor((1 - dist / (radius + 15)) * 50);
          }

          if (p.team !== player.team) {
            sequence: (sequence, // Add sequence for client animation
              (player.score += damage));
          } else {
            player.score -= damage;
          }

          damageEvents.push({
            tankId: p.tankId,
            damage: damage,
            x: p.position.x,
            y: p.position.y - 40, // float above tank
          });
        }

        // Update tank Y position so it "falls" if terrain under it is destroyed
        const pX = Math.floor(p.position.x);
        if (pX >= 0 && pX < 1920) {
          p.position.y = this.terrain.heightmap[pX];
        }
      }

      // Add a sample burn effect for bomb
      if (!isNapalm) {
        this.terrainEffects.push({
          type: "burn",
          x: hitX,
          radius: radius * 1.5,
        });
      }
    }
    // 4. Broadcast result
    this.io.to(this.id).emit("turn-result", {
      path: finalPath,
      hit: {
        x: hitX,
        y: hitY,
        radius,
        weapon,
        hasEffects: true,
        newEffects: this.terrainEffects,
      },
      terrainChanges: terrainChanges,
      damageEvents: damageEvents,
      players: Array.from(this.players.values()),
    });

    // 5. Check win condition after animation delay
    // Napalm takes longer to animate its sequence
    const delay = isNapalm ? 5000 : 3000;
    setTimeout(() => {
      this.checkWinCondition();
    }, delay); // give client time to animate before next turn starts
  }

  checkWinCondition() {
    this.advanceTurn();
  }

  endGame(message) {
    this.status = "finished";
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.io.to(this.id).emit("game-over", { message });
  }

  handlePlayerDisconnect(socketId) {
    this.players.delete(socketId);
    this.teams.A = this.teams.A.filter((id) => id !== socketId);
    this.teams.B = this.teams.B.filter((id) => id !== socketId);

    this.io.to(this.id).emit("player-disconnected", { socketId });
    this.broadcastState();
  }

  destroy() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    // clean up any other resources
  }
}
