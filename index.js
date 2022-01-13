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
let seasonDays = 7;
const MAX_MATCH = 20;
const ADD_MATCH = 10;
const FROZEN  = false
let players;
let season = 1; // first season

/**
  * Reset arena
  * @return {void}
  */
function reset() {
  players = JSON.parse(fs.readFileSync(`players-${season-1}.json`));
  for (i = 0; i < PLAYER_COUNT; i++) {
    prevTrophies = players[i].trophies;
    if (prevTrophies >= 2700) {
      players[i].trophies = 2500;
    } else if (prevTrophies >= 2200) {
      players[i].trophies = 2200;
    } else {
      players[i].trophies = 1000;
    }
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
  * @return {[number]} [attacker win, attacker loss, defense Win, defenser Loss]
  */
function getTrophyChanges(myTrophies, oppTrophies) {
  const MAX_CHANGE = 32;
  const delta =
    MAX_CHANGE / (1 + Math.exp(-0.0023*(oppTrophies - myTrophies)));

  gain = Math.round(delta);
  if (gain < 0) gain = 1;

  
 /// added this part as wins and losses are not symetrical
 /// attacker is much lower in trophy and it is a + 20 win
 /// in case of win, +20 win for attacker and -10 loss for defender
 /// in case of loss -6 loss for attacker and + 12 win for defender

 defLoss = Math.max(Math.floor(delta/2),1);

  const oppDelta =
    MAX_CHANGE / (1 + Math.exp(-0.0023*(-oppTrophies + myTrophies)));

  defGain = Math.max(Math.round(oppDelta),1);
  
  /// toto : limit defensive gains for Konq (above 4500)
  if ( defGain >4 && oppTrophies > 4500) { defGain -=3;}

  loss = Math.floor(oppDelta/2);
  if (loss < 0)loss = 1;

  res = [gain, -loss, defGain, -defLoss]; 
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
  /*score =
    pW * pW * trophyChanges[0] +
    pL * pL * trophyChanges[1];*/
  
  //toto: fix orginal code above, expectance is P x Result not P^2 x result  
  score =
    pW * trophyChanges[0] +
    pL * trophyChanges[1];

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
    /// toto: adapted as defensive wins and losses are not symetrical
    return [trophyChanges[0], trophyChanges[4]];
  }

  players[myId].L += 1;
  players[oppId].dW += 1;
    /// toto: adapted as defensive wins and losses are not symetrical
    return [trophyChanges[1], trophyChanges[2]];
}

/**
  * Opponent search
  * @param {number} myId offense's player ID
  * @return {[object]}
  */
function findOpponents(myId) {
  const MATCH_SEARCH_LEN = 400;
  const MATCH_LIST_LEN = 40;

  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = players[myId].trophies;

  const listA = [];
  for (let i = 0; i < MATCH_SEARCH_LEN; i++) {
    oppId = myId + Math.floor(Math.random() * PLAYER_COUNT);
    if (oppId >= PLAYER_COUNT) oppId = oppId - PLAYER_COUNT;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = FROZEN?players[oppId].locked: players[oppId].trophies;
    const fitness1 = /*Math.pow(0.9, */ - Math.abs(myTrophies - oppTrophies) / 400;
    const fitness2 = /*Math.pow(0.9, */ - Math.abs(myPwr - oppPwr) / 100000;
    // toto: removed unecessary 0.9^x , comparison between 0.9^x and 0.9^y 
    // is same than comparison between -x and -y

    const fitness = Math.round(Math.max(fitness1, fitness2) /* * 100*/ );
        //toto:  removed  unnecessary * 100 , does not change comparison
    listA.push({id: oppId, fitness: fitness});
  }
  listA.sort( function(a, b) {
    //toto: optimisation and simplification of sort
    return b.fitness -a.fitness
   /* if (a.fitness > b.fitness) {
      return -1;
    } else if (a.fitness < b.fitness) 
    {
      return 1;
    }
    return 0;*/
  } );
  

  const listB = listA.slice(1, MATCH_LIST_LEN + 1);
  for (let j = 0; j < MATCH_LIST_LEN; j++) {
    const oppId = listB[j].id;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = FROZEN?players[oppId].locked: players[oppId].trophies;
    const oppHero = players[oppId].hero;
    const potential =
      getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);
      // toto: removed line below: not used
      // listB[j].score = potential.score; 

      // simplified line below, used only in comparison
    listB[j].score_sanitized = potential.score //Math.round(potential.score * 5000);
    listB[j].winProbability = potential.winProbability;
    listB[j].trophyChanges = potential.trophyChanges;
  }
  if(FROZEN){
    listB.sort( function(a, b) {
      if (a.score_sanitized > b.score_sanitized) {
        return -1;
      } else if (a.score_sanitized < b.score_sanitized) {
        return 1;
      } else if ( players[a.id].locked > players[b.id].locked) {
        return -1;
      } else {
        return 0;
      }
    });
  }else{
    listB.sort( function(a, b) {
      //toto: small opimisation for live trophies
     return (b.score_sanitized - b.score_sanitized) ;
    });
  }
  return listB;
  //
  // let selected = 0;
  // for (j = 1; j < MATCH_LIST_LEN; j++) {
  //   aScore = Math.round(list[j].score * 5000);
  //   bScore = Math.round(list[selected].score * 5000);
  //
  //   if (list[j].score > list[selected].score) {
  //     selected = j;
  //   } else if (list[j].score == list[selected].score) {
  //     if (players[list[j].id].locked > players[list[selected].id].locked) {
  //       selected = j;
  //     }
  //   }
  // }
  // return {
  //   id: list[selected].id,
  //   winProbability: list[selected].winProbability,
  //   trophyChanges: list[selected].trophyChanges,
  // };
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
  csv = 'player id,bp,inactive,zone,hero,power,trophies,skip,win,loss,d win,d loss\n';
  for (i = 0; i < PLAYER_COUNT; i++) {
    csv +=
      players[i].id + ',' +
      players[i].bp + ',' +
      players[i].inactive + ',' +
      players[i].timeZone + ',' +
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

    //toto: optimise sort :
    return b.trophies-a.trophies;
    /*
    if (a.trophies > b.trophies) {
      return -1;
    } else if (a.trophies < b.trophies) {
      return 1;
    }
    return 0; */
  } );
 
}
/**
    * clean trophies: replace NaN values by 1000
    * @return {void}
    */
 function cleanTrophies() {
  players = players.map( player => {
    if(isNaN(player.trophies)){
      player.trophies = 1000;
    }
    return player;   
  });
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
  
  console.log(`Season ${season}`);
  for (day = 0; day < seasonDays; day++) {
    

    if (FROZEN){lockTrophies();}

    console.log('Day ' + day + ' :' + printTime());
    const ZONE_BRACKET = PLAYER_COUNT/8;
    for (let z = 0; z < 8; z++) {
      console.log('Time Zone ' + z);
      for (let i = 0; i < ZONE_BRACKET; i++) {
        id = ZONE_BRACKET * z + i;
        if (players[id].inactive) {
          // do nothing
        } else {
          matchCount = (players[id].bp)?(MAX_MATCH+ADD_MATCH):(MAX_MATCH);
          const opponents = findOpponents(id);
          for (let match = 0; match < matchCount; match++) {
            opp = opponents[match];
            battleRes =
              battle(id, opp.id, opp.winProbability, opp.trophyChanges);
            players[id].trophies += battleRes[0];
            players[opp.id].trophies += battleRes[1];
          } // for (match)
        }
      } // for (i)
    } // for (z)
  }
}

seasonDays = 7;
season = 1;

reset();
cleanTrophies();
simulate3();
fs.writeFileSync('players-1.json', JSON.stringify(players));
sortPlayers();
fs.writeFileSync(`players-1.csv`, printCSV());

seasonDays = 14;
for (season = 2; season < 6; season++) {
  reset();
  simulate3();
  fs.writeFileSync(`players-${season}.json`, JSON.stringify(players));
  sortPlayers();
  fs.writeFileSync(`players-${season}.csv`, printCSV());
}