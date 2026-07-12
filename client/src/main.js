import { io } from "socket.io-client";
import { GameRenderer } from "./renderer.js";

// DOM Elements
const screenLobby = document.getElementById("lobby");
const screenWaiting = document.getElementById("waiting-room");
const screenGame = document.getElementById("game");

const btnCreate = document.getElementById("btn-create");
const btnComputer = document.getElementById("btn-computer");
const btnJoin = document.getElementById("btn-join");
const btnStart = document.getElementById("btn-start");
const inputNickname = document.getElementById("nickname");
const inputRoomCode = document.getElementById("room-code");
const displayRoomCode = document.getElementById("display-room-code");
const listPlayers = document.getElementById("players-list");

const teamAStatus = document.getElementById("team-a-status");
const teamBStatus = document.getElementById("team-b-status");
const turnIndicator = document.getElementById("turn-indicator");
const controls = document.getElementById("controls");
const inputAngle = document.getElementById("input-angle");
const inputPower = document.getElementById("input-power");
const angleVal = document.getElementById("angle-val");
const powerVal = document.getElementById("power-val");
const btnFire = document.getElementById("btn-fire");
const btnAngleMinus = document.getElementById("btn-angle-minus");
const btnAnglePlus = document.getElementById("btn-angle-plus");
const btnPowerMinus = document.getElementById("btn-power-minus");
const btnPowerPlus = document.getElementById("btn-power-plus");
const btnMoveLeft = document.getElementById("btn-move-left");
const btnMoveRight = document.getElementById("btn-move-right");
const movesVal = document.getElementById("moves-val");

const gameOverModal = document.getElementById("game-over-modal");
const gameOverText = document.getElementById("game-over-text");
const btnLobby = document.getElementById("btn-lobby");

// State
const socket = io("http://localhost:3000");
let currentRoom = null;
let renderer = new GameRenderer("game-canvas");
let myTurn = false;

// Socket Events
socket.on("player-joined", (data) => {
  updatePlayersList(data.players, data.teams);
  if (data.players.length >= 1) {
    // Host can start even with 1 for testing
    btnStart.style.display = "block";
  }
});

socket.on("room-state-update", (data) => {
  updatePlayersList(data.players, data.teams);
});

socket.on("aim-changed", (data) => {
  const p = renderer.players.find(
    (player) => player.socketId === data.socketId,
  );
  if (p) {
    if (data.angle !== undefined) p.angle = data.angle;
    if (data.power !== undefined) p.power = data.power;
  }
});

socket.on("tank-moved", (data) => {
  const p = renderer.players.find(
    (player) => player.socketId === data.socketId,
  );
  if (p) {
    p.position = data.position;
    p.moves = data.movesLeft;
    if (p.socketId === socket.id) {
      movesVal.textContent = data.movesLeft;
    }
  }
});

socket.on("game-started", (data) => {
  switchScreen(screenGame);
  renderer.initTerrain(data.terrainSeed);
  renderer.setPlayers(data.players);
  renderer.draw(); // start loop
  updateHUD(data.players);
});

socket.on("turn-started", (data) => {
  myTurn = data.currentTurnSocketId === socket.id;
  if (myTurn) {
    controls.classList.remove("disabled");
    turnIndicator.textContent = "YOUR TURN!";
    turnIndicator.style.color = "#22c55e";
    const myPlayer = renderer.players.find((p) => p.socketId === socket.id);
    if (myPlayer) {
      movesVal.textContent = myPlayer.moves !== undefined ? myPlayer.moves : 4;
    }
  } else {
    controls.classList.add("disabled");
    turnIndicator.textContent = "Waiting for opponent...";
    turnIndicator.style.color = "white";
  }
});

socket.on("turn-result", (data) => {
  controls.classList.add("disabled");
  renderer.animateProjectile(data.path, data.hit, data.terrainChanges, () => {
    renderer.setPlayers(data.players);
    updateHUD(data.players);
  });
});

socket.on("game-over", (data) => {
  gameOverText.textContent = data.message;
  gameOverModal.classList.remove("hidden");
});

// UI Handlers
btnCreate.onclick = () => {
  socket.emit(
    "create-room",
    { nickname: inputNickname.value || "Player 1" },
    (res) => {
      if (res.success) {
        currentRoom = res.roomId;
        displayRoomCode.textContent = currentRoom;
        switchScreen(screenWaiting);
        btnStart.style.display = "block"; // Solo debug or wait for others
      } else {
        alert(res.message);
      }
    },
  );
};

btnComputer.onclick = () => {
  socket.emit(
    "create-room",
    { nickname: inputNickname.value || "Player", vsComputer: true },
    (res) => {
      if (res.success) {
        currentRoom = res.roomId;
        displayRoomCode.textContent = currentRoom;
        switchScreen(screenWaiting);
        btnStart.style.display = "block";
      } else {
        alert(res.message);
      }
    },
  );
};

btnJoin.onclick = () => {
  const roomId = inputRoomCode.value.trim().toUpperCase();
  if (!roomId) return;
  socket.emit(
    "join-room",
    { roomId, nickname: inputNickname.value || "Player" },
    (res) => {
      if (res.success) {
        currentRoom = roomId;
        displayRoomCode.textContent = currentRoom;
        switchScreen(screenWaiting);
      } else {
        alert(res.message);
      }
    },
  );
};

btnStart.onclick = () => {
  socket.emit("start-game");
};

function updateAim(angle, power) {
  if (angle !== undefined) {
    inputAngle.value = angle;
    angleVal.textContent = angle;
    if (myTurn) socket.emit("aim", { angle: parseInt(angle) });
  }
  if (power !== undefined) {
    inputPower.value = power;
    powerVal.textContent = power;
    if (myTurn) socket.emit("aim", { power: parseInt(power) });
  }
}

inputAngle.oninput = (e) => updateAim(e.target.value, undefined);
inputPower.oninput = (e) => updateAim(undefined, e.target.value);

btnAngleMinus.onclick = () =>
  updateAim(Math.max(0, parseInt(inputAngle.value) - 1), undefined);
btnAnglePlus.onclick = () =>
  updateAim(Math.min(180, parseInt(inputAngle.value) + 1), undefined);
btnPowerMinus.onclick = () =>
  updateAim(undefined, Math.max(10, parseInt(inputPower.value) - 1));
btnPowerPlus.onclick = () =>
  updateAim(undefined, Math.min(150, parseInt(inputPower.value) + 1));

btnMoveLeft.onclick = () => {
  if (!myTurn) return;
  const myPlayer = renderer.players.find((p) => p.socketId === socket.id);
  if (myPlayer && myPlayer.moves > 0) {
    socket.emit("move", { direction: -1 });
  }
};

btnMoveRight.onclick = () => {
  if (!myTurn) return;
  const myPlayer = renderer.players.find((p) => p.socketId === socket.id);
  if (myPlayer && myPlayer.moves > 0) {
    socket.emit("move", { direction: 1 });
  }
};

btnFire.onclick = () => {
  if (!myTurn) return;
  myTurn = false;
  controls.classList.add("disabled");
  socket.emit("fire", {
    angle: parseInt(inputAngle.value),
    power: parseInt(inputPower.value),
  });
};

btnLobby.onclick = () => {
  window.location.reload();
};

function switchScreen(screen) {
  [screenLobby, screenWaiting, screenGame].forEach((s) =>
    s.classList.remove("active"),
  );
  screen.classList.add("active");
}

function updatePlayersList(players, teams) {
  listPlayers.innerHTML = "";
  players.forEach((p) => {
    const div = document.createElement("div");
    div.textContent = `${p.nickname} (Team ${p.team})`;
    listPlayers.appendChild(div);
  });
}

function updateHUD(players) {
  let hpA = 0;
  let hpB = 0;
  players.forEach((p) => {
    if (p.team === "A") hpA += p.hp;
    if (p.team === "B") hpB += p.hp;
  });
  teamAStatus.textContent = `Team A: ${hpA} HP`;
  teamBStatus.textContent = `Team B: ${hpB} HP`;
}
