# Core stack

- Server: Node.js + Express (HTTP) + Socket.io (real-time)
- State: Plain in-memory JS object/Map, keyed by roomId — no database for live match state
- Client: Any frontend framework you're both fast in (React is fine, plain JS is fine too — don't burn weekend hours picking this)
- Rendering: HTML5 Canvas for the tank/projectile/terrain rendering
- Physics: Server-authoritative — trajectory math runs server-side only, client just animates what server says happened

# For team-vs-team specifically

- Add a team: "A" | "B" field on the Player object.