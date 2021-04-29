fs = require('fs');

// Rock Paper Scissors
const RPS = [
  /*         S      C       A     Z     D */
  /* S */ [ 0.03, -0.16,  0.10,  0.20, 0.30],
  /* C */ [ 0.20,  0.03, -0.16,  0.10, 0.30],
  /* A */ [-0.03,  0.20,  0.03, -0.16, 0.30],
  /* Z */ [-0.16, -0.03,  0.20,  0.03, 0.38],
  /* D */ [-0.23, -0.23, -0.23, -0.23, 0.03],
];

const PLAYER_COUNT = 100 * 1000;
const SEASON_DAYS = 14;
const MAX_MATCH = 20;
const ADD_MATCH = 10;
const MATCH_LIST_LEN = 75;
const players = JSON.parse(fs.readFileSync('players.json'));

/**
  * Reset arena
  * @return {void}
  */
function reset() {
  for (i = 0; i < PLAYER_COUNT; i++) {
    players[i].trophies = 2500;
    players[i].W = 0;
    players[i].L = 0;
    players[i].S = 0;
    players[i].dW = 0;
    players[i].dL = 0;
  }
}

/**
  * Get win probability
  * If power difference is +15% of the highest power, then probability is 1
  * If power difference is -15% of the highest power, then probability is 0
  * @param {number} myPwr offense
  * @param {number} oppPwr defens
  * @return {number} 0...1
  */
function getWinProbability(myPwr, oppPwr) {
  const a = (myPwr - oppPwr);
  const b = Math.min(myPwr * 0.15, oppPwr * 0.15);
  const winProbability = (a / b) / 2 + 0.5;
  if (winProbability > 1) {
    return 1;
  } else if (winProbability < 0 ) {
    return 0;
  }
  return winProbability;
}

/**
  * Get trophy change from battle result
  * @param {number} myTrophies offense
  * @param {number} oppTrophies defens
  * @return {[number]} [win, loss]
  */
function getTrophyChanges(myTrophies, oppTrophies) {
  const MAX_CHANGE = 32;
  const delta =
    MAX_CHANGE / (1 + Math.exp(-0.0023*(oppTrophies - myTrophies)));

  gain = Math.round(delta);
  if (gain < 0) gain = 1;

  loss = Math.floor(delta/2);
  if (loss < 0) loss = 1;

  res = [gain, -loss];
  return res;
}

/**
  * Evaluate the potential of engaging in a battle
  * @param {number} myHero offense's hero
  * @param {number} myPwr offense's power
  * @param {number} myTrophies offense's trophy
  * @param {number} oppHero defense
  * @param {number} oppPwr defense
  * @param {number} oppTrophies defense
  * @return {object}
  */
function getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies) {
  pwr = Math.round((1 + RPS[myHero][oppHero]) * myPwr);
  trophyChanges = getTrophyChanges(myTrophies, oppTrophies);
  winProbability = getWinProbability(pwr, oppPwr);

  pW = Math.round(winProbability * 20) / 20; // win probability
  pL = 1 - pW; // loss probability
  score =
    pW * pW * trophyChanges[0] +
    pL * pL * trophyChanges[1];

  return {
    score: score,
    winProbability: winProbability,
    trophyChanges: trophyChanges,
  };
}

/**
  * Fight!
  * @param {number} myId offense's player ID
  * @param {number} oppId defense's player ID
  * @param {number} winProbability
  * @param {[number]} trophyChanges [win, loss]
  * @return {object}
  */
function battle(myId, oppId, winProbability, trophyChanges) {
  if (winProbability < 0.2) { // Skip the fight if you will likely loss
    players[myId].S += 1;
    return [0, 0];
  }

  // Roll the dice!
  diceRoll = Math.random();
  if (diceRoll < winProbability) {
    players[myId].W += 1;
    players[oppId].dL += 1;
    return trophyChanges;
  }

  players[myId].L += 1;
  players[oppId].dW += 1;
  return [trophyChanges[1], trophyChanges[0]];
}

/**
  * Oppoent search
  * @param {number} myId offense's player ID
  * @return {object}
  */
function findOpponent(myId) {
  const list = [];
  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = players[myId].trophies;

  for (j = 0; j < MATCH_LIST_LEN; j++) {
    oppId = myId + Math.floor(Math.random() * PLAYER_COUNT);
    if (oppId >= PLAYER_COUNT) {
      oppId = oppId - PLAYER_COUNT;
    }

    const oppPwr = players[oppId].pwr;
    const oppHero = players[oppId].hero;
    const oppTrophies = players[oppId].trophies;
    const potential =
      getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);
    list.push(
        {
          id: oppId,
          score: potential.score,
          winProbability: potential.winProbability,
          trophyChanges: potential.trophyChanges,
        }
    );
  }
  let selected = 0;
  for (j = 1; j < MATCH_LIST_LEN; j++) {
    aScore = Math.round(list[j].score * 5000);
    bScore = Math.round(list[selected].score * 5000);

    if (list[j].score > list[selected].score) {
      selected = j;
    } else if (list[j].score == list[selected].score) {
      if (players[list[j].id].trophies > players[list[selected].id].trophies) {
        selected = j;
      }
    }
  }
  return {
    id: list[selected].id,
    winProbability: list[selected].winProbability,
    trophyChanges: list[selected].trophyChanges,
  };
}

/**
  * Oppoent search
  * @param {number} myId offense's player ID
  * @return {object}
  */
function findOpponent2(myId) {
  const list = [];
  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = players[myId].trophies;

  for (j = 0; j < MATCH_LIST_LEN; j++) {
    oppId = myId + Math.floor(Math.random() * PLAYER_COUNT);
    if (oppId >= PLAYER_COUNT) {
      oppId = oppId - PLAYER_COUNT;
    }

    const oppPwr = players[oppId].pwr;
    const oppHero = players[oppId].hero;
    const oppTrophies = players[oppId].locked;
    const potential =
      getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);
    list.push(
        {
          id: oppId,
          score: potential.score,
          winProbability: potential.winProbability,
          trophyChanges: potential.trophyChanges,
        }
    );
  }
  let selected = 0;
  for (j = 1; j < MATCH_LIST_LEN; j++) {
    aScore = Math.round(list[j].score * 5000);
    bScore = Math.round(list[selected].score * 5000);

    if (list[j].score > list[selected].score) {
      selected = j;
    } else if (list[j].score == list[selected].score) {
      if (players[list[j].id].locked > players[list[selected].id].locked) {
        selected = j;
      }
    }
  }
  return {
    id: list[selected].id,
    winProbability: list[selected].winProbability,
    trophyChanges: list[selected].trophyChanges,
  };
}

/**
  * Utility function
  * @return {string} formated time string
  */
function printTime() {
  const dt = new Date();
  return dt.getHours() + ':' + dt.getMinutes() + ':' + dt.getSeconds();
}

/**
  * Export player data to CSV format
  * @return {void}
  */
function printCSV() {
  csv = 'player id,bp,zone,hero,power,trophies,skip,win,loss,d win,d loss\n';
  for (i = 0; i < PLAYER_COUNT; i++) {
    csv +=
      players[i].id + ',' +
      players[i].bp + ',' +
      players[i].zone + ',' +
      players[i].hero + ',' +
      players[i].pwr + ',' +
      players[i].trophies + ',' +
      players[i].S + ',' +
      players[i].W + ',' +
      players[i].L + ',' +
      players[i].dW + ',' +
      players[i].dL + '\n';
  }
  return csv;
}

/**
  * Sort players by trophies
  * @return {void}
  */
function sortPlayers() {
  players.sort( function(a, b) {
    if (a.trophies > b.trophies) {
      return -1;
    } else if (a.trophies < b.trophies) {
      return 1;
    }
    return 0;
  } );
}

/**
  * Simulate a regular season
  * Players in zone 0 play first, then players in zone 1 play,...
  * @return {void}
  */
function simulate1() {
  console.log('sim2');
  for (day = 0; day < SEASON_DAYS; day++) {
    console.log('Day ' + day + ' :' + printTime());
    const ZONE_BRACKET = PLAYER_COUNT/8;
    for (let z = 0; z < 8; z++) {
      console.log('time zone ' + z);
      for (let i = 0; i < ZONE_BRACKET; i++) {
        id = ZONE_BRACKET * z + i;
        matchCount = (players[id].bp)?(MAX_MATCH+ADD_MATCH):(MAX_MATCH);
        for (let match = 0; match < matchCount; match++) {
          opp = findOpponent(id);
          battleRes = battle(id, opp.id, opp.winProbability, opp.trophyChanges);
          players[id].trophies += battleRes[0];
          players[opp.id].trophies += battleRes[1];
        } // for (match)
      } // for (i)
    } // for (z)
  } // for (day)
}

/**
  * Simulate season (freezing trophies)
  * @return {void}
  */
function simulate2() {
  /**
    * Reset plus/minus
    * @return {void}
    */
  function resetPlusMinus() {
    for (i = 0; i < PLAYER_COUNT; i++) {
      players[i].plusMinus = 0;
    }
  }

  /**
    * Update trophies from plus/minus
    * @return {void}
    */
  function updatePlusMinus() {
    for (i = 0; i < PLAYER_COUNT; i++) {
      players[i].trophies += players[i].plusMinus;
      players[i].plusMinus = 0;
    }
  }

  resetPlusMinus();
  console.log('sim2');
  for (day = 0; day < SEASON_DAYS; day++) {
    console.log('day ' + day + ' ' + printTime());
    for (i = 0; i < PLAYER_COUNT; i++) {
      matchCount = players[i].bp?(MAX_MATCH+ADD_MATCH):(MAX_MATCH);
      for (match = 0; match < matchCount; match++) {
        opp = findOpponent(i);
        battleRes = battle(i, opp.id, opp.winProbability, opp.trophyChanges);
        players[i].plusMinus += battleRes[0];
        players[opp.id].plusMinus += battleRes[1];
      }
    }
    updatePlusMinus();
  }
}

/**
  * Simulate season (new system by dev)
  * @return {void}
  */
function simulate3() {
  /**
    * Reset plus/minus
    * @return {void}
    */
  function lockTrophies() {
    for (i = 0; i < PLAYER_COUNT; i++) {
      players[i].locked = players[i].trophies;
    }
  }

  console.log('sim3');
  for (day = 0; day < SEASON_DAYS; day++) {
    lockTrophies();
    console.log('day ' + day + ' ' + printTime());
    for (i = 0; i < PLAYER_COUNT; i++) {
      matchCount = players[i].bp?(MAX_MATCH+ADD_MATCH):(MAX_MATCH);
      for (match = 0; match < matchCount; match++) {
        opp = findOpponent2(i);
        battleRes = battle(i, opp.id, opp.winProbability, opp.trophyChanges);
        players[i].trophies += battleRes[0];
        players[opp.id].trophies += battleRes[1];
      }
    }
  }
}
/*
reset();
simulate1();
sortPlayers();
fs.writeFileSync('Sim1.csv', printCSV());

reset();
simulate2();
sortPlayers();
fs.writeFileSync('Sim2.csv', printCSV());
*/
reset();
simulate3();
sortPlayers();
fs.writeFileSync('Sim3.csv', printCSV());
