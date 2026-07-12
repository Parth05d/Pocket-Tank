# What are we building?
We are building Pocket Tanks (https://www.blitwise.com/pocket-tanks) game but it runs on the web. It will have features like LAN Co-Op games, Team Matches (Team A vs Team B), Turn Based firing, players can also play it online by creating rooms, etc. 

## Why are building what already exists?
Because it doesn't support multiplayer games. What if more than 2 people want to play this game together? So to solve this problem I want to build my own where we can play upto 4 players per team.

# System Design (Notes for me)
- Server sends facts (HP, position, whose turn, terrain shape). Client derives presentation from those facts.