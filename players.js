fs = require('fs');

// Initialize player base

// Ratio of players with Battle Pass
const BP_RATIO = 0.3;

// Ratio of players who are inactive
const INACTIVE_RATIO = 0.01;

// Power Bracket
// Base army power for each player
const pDist = [
  1350000,
  1281579,
  1213158,
  1144737,
  1076316,
  1007895,
  939474,
  871053,
  802632,
  734211,
  665789,
  597368,
  528947,
  460526,
  392105,
  323684,
  255263,
  186842,
  118421,
  50000];

// 100k bell curve
// const PLAYER_COUNT = 100 * 1000;

// Number of players in each Power Bracket
// The sum of all numbers is 100k
const nDist = [
  1600,
  2200,
  3000,
  3800,
  4700,
  5600,
  6400,
  7100,
  7700,
  7900,
  7900,
  7700,
  7100,
  6400,
  5600,
  4700,
  3800,
  3000,
  2200,
  1600];

// Hero Distribution
const hDist = [
  0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4];

const players = [];
let powerBracket = 0;
let id = 0;
let timeZone = 0;
for (powerBracket = 0; powerBracket < 20; powerBracket++) {
  for (n = 0; n < nDist[powerBracket]; n++) {
    pwr = pDist[powerBracket] +
          Math.round((Math.random() * 90 * 1000 - (10 * 1000)));

    inactive = (Math.random() < INACTIVE_RATIO)?true:false;
    bp = inactive?
        false:
        ((Math.random() < BP_RATIO)?true:false);
    hero = hDist[Math.floor( Math.random() * hDist.length )];
    player = {
      id: id,
      hero: hero,
      pwr: pwr,
      bp: bp,
      trophies: 2200,
      inactive: inactive,
      timeZone: timeZone,
    };
    id++;
    timeZone++;
    if (timeZone >= 8) timeZone = 0;
    players.push(player);
  }
}

fs.writeFileSync('players-0.json', JSON.stringify(players));
