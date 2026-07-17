# Unresponsive for Mobile Devices (We'll work on it later)

![alt text](images\image.png)
![alt text](images\image-1.png)

- [x] Bug: If a user doesn't fire, the turn changes automatically which shouldn't happen. Until a user fires, the next opponent must not get the chances to fire.
- [x] Feat: Show how much damage a tank suffered.
- [x] Add New Weapon: Napalm
  - Effects: Burns the tank with terrain, damage increases exponentially starting from 2 to 20 in the steps of 4. Total of 42 points.
- [x] And instead of having health, we must target for highest points a player can achieve by damaging the opponent.
- [x] The CPU's tank's nozzel isn't moving according to the angle to it shoots at.
- [x] Make the controls practical:
  - Instead of + and - for angle control we should give left or right arrow which moves the tank's nozzel just like arrows are facing in.
- [x] The tank must strictly following rules of physics while moving and sitting idle, that is a tank can't move forward or backward without touching the ground nor it should hover over the ground while idle.
- [x] Fix the physics of weapons.
  - [ ] Reduce the projectile's speed so that user can see the projection and anticipate where it will hit.
  - [ ] Currently, tanks go even deep then where the control panel is. We have to make sure that hard land (unbreakable) sits just above the control panel because after damaging the terrain, tanks burries under the control panel leading to invisible tank.
- [ ] Currently I have to adjust angle by clicking left or right button everytime. What if I want to change angle from 45 to 180? I think there must be a scroll wheel along with buttons for fine tuning.
