fs = require('fs');
///TODO: allow revenges

/************ begin of sim setup ****************/
const TIMEZONE_ORDER = true; // true: timezones play at different times
const TIMEZONE_COUNT = 24;

const SCENARIO_MINIMISE_DEF_LOSS = false;
const SCENARIO_MINIMISE_DEF_LOSS_FACTOR = 0; // def loss don't cost a single point with zero, normal def loss with 1

const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING = false; // match only players with current day's attacjk in +1/-1 range

const SCENARIO_FROZEN  = false; //Frozen defensive trophies

const PLAYER_COUNT =100 * 1000; // max 100 000  or enlarge players.json first

const SEASONS_TO_SIM = 3; // /!\ first season is a simple initialiser, 2 minimum


/************ end of sim setup ****************/

/// different file names for each scenario 
filename_prefix=  (SCENARIO_MINIMISE_DEF_LOSS ? `MDL${SCENARIO_MINIMISE_DEF_LOSS_FACTOR}x-`:"") + 
                  (SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING ? "PCOM-":"") +   
                  (SCENARIO_FROZEN ? "Frozen-":"" ) +  
                  (TIMEZONE_ORDER ? `${TIMEZONE_COUNT}-TZ-`:"") + 
                  `${PLAYER_COUNT}-` + 
                  "players";

// Rock Paper Scissors
const RPS = [
  /*         S      C       A     Z     D */
  /* S */ [ 0.03, -0.16,  0.10,  0.20, 0.30],
  /* C */ [ 0.20,  0.03, -0.16,  0.10, 0.30],
  /* A */ [-0.03,  0.20,  0.03, -0.16, 0.30],
  /* Z */ [-0.16, -0.03,  0.20,  0.03, 0.38],
  /* D */ [-0.23, -0.23, -0.23, -0.23, 0.03],
];


const MAX_MATCH = 20;
const ADD_MATCH = 10;
let players;
let playerIdByTz;

//toto: add new table so that sort by trophy  do not impact match order in following seasons.
let sortedPlayers;
let season = 1; // first season

/**
  * Reset arena
  * @return {void}
  */
function reset() {
  if(season >1 ){
    players = JSON.parse(fs.readFileSync(`${filename_prefix}-${season-1}.json`));
  }
  else {
    //always use the same init file for first season
    players = JSON.parse(fs.readFileSync(`players.json`))
    .shuffle()
    .slice(0,PLAYER_COUNT)
    .map(player =>{
       player.zone = (Math.floor(Math.random() * TIMEZONE_COUNT));
       player.power *= 1.9 / 1.4; 
       return player; });
  }

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

    players[i].dailyBattlesCount = 0;
   
  }

  //get players by Tz : 
  playerIdByTz = [];
  for (let tz = 0; tz < TIMEZONE_COUNT ; tz ++)
  {
    playerIdByTz[tz] = []; //needed so that playerIdByTz[z] is not null at next steps
  }

  if(TIMEZONE_ORDER){    
    for(let playerId =0; playerId <PLAYER_COUNT; playerId++){
      playerIdByTz[players[playerId].zone].push(playerId);
    }
  }
  else{
    //mix everyone in tz 0
    for(let playerId =0; playerId <PLAYER_COUNT; playerId++){
      playerIdByTz[0].push(playerId);
    }
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
  * @return {[number]} [attackerwin, attacker loss, defense Win, defenser Loss]
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

 defLoss = Math.max(Math.floor(delta/2),1)*SCENARIO_MINIMISE_DEF_LOSS_FACTOR;

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
  if (winProbability < 0.2) { // Skip the fight if you will likely lose
    players[myId].S += 1;
    return [0, 0];
  }

  // Roll the dice!
  diceRoll = Math.random();
  if (diceRoll < winProbability) {
    players[myId].W += 1;
    players[oppId].dL += 1;
    /// toto: adapted as defensive wins and losses are not symetrical
    return [trophyChanges[0], trophyChanges[3]];
  }

  players[myId].L += 1;
  players[oppId].dW += 1;
    /// toto: adapted as defensive wins and losses are not symetrical
    return [trophyChanges[1], trophyChanges[2]];
}
/**  Randomize array in-place using Durstenfeld shuffle algorithm 
 * * @param {[object]} this, Array to shuffle
 * @return {[object]} Shuffled array
*/
Array.prototype.shuffle = function() {
  for (var i = this.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    [this[i], this[j]] =  [this[j], this[i]] ;
  }
  return this;
};


/**
  * Opponent search
  * @param {number} myId offense's player ID
  * @return {object} the best match
  */
function findOpponent(myId) {
  const MATCH_SEARCH_LEN = 50;
  const MATCH_LIST_LEN = 10; 
  // toto, changed values above, for only one opponent is selected, no need to make 400 calcs

  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = players[myId].trophies;

  const listA = [];
  for (let i = 0; i < MATCH_SEARCH_LEN; i++) {
    oppId = Math.floor(Math.random() * (PLAYER_COUNT-1) );
    if (oppId >= PLAYER_COUNT) oppId = oppId - PLAYER_COUNT;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;


    const fitness1 = /*Math.pow(0.9, */ - Math.abs(myTrophies  - oppTrophies) / 400;
    const fitness2 = /*Math.pow(0.9, */ - Math.abs(myPwr - oppPwr) / 100000;
    // toto: removed unecessary 0.9^x , 
    // comparison between 0.9^x and 0.9^y 
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
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;
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
  if(SCENARIO_FROZEN){
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
     return (b.score_sanitized - a.score_sanitized) ; //Bigger score first
    });
  }
  return listB[0];
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
  sortPlayers();
  csv = 'player id,bp,inactive,zone,hero,power,trophies,skip,win,loss,d win,d loss\n';
  for (i = 0; i < PLAYER_COUNT; i++) {
    csv +=
    sortedPlayers[i].id + ',' +
    sortedPlayers[i].bp + ',' +
    sortedPlayers[i].inactive + ',' +
    sortedPlayers[i].zone + ',' +
    sortedPlayers[i].hero + ',' +
    sortedPlayers[i].pwr + ',' +
    sortedPlayers[i].trophies + ',' +
    sortedPlayers[i].S + ',' +
    sortedPlayers[i].W + ',' +
    sortedPlayers[i].L + ',' +
    sortedPlayers[i].dW + ',' +
    sortedPlayers[i].dL + '\n';
  }
  return csv;
}

/**
  * Sort players by trophies
  * @return {void}
  */
function sortPlayers() {

  sortedPlayers = players;
  sortedPlayers.sort( function(a, b) {

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

  

  //toto: sort player by time zone or below code for tz is irrelevant
  /*
  if(TIMEZONE_ORDER){
    players.sort((a,b) => a.zone - b.zone ); //tz 0 first then growing
  }// otherwise keep them shuffled 
  */

  console.log(`Season ${season}`);
  for (day = 0; day < seasonDays; day++) {

    players.map(player => ({player, dailyBattlesCount: 0 }) );

    if (SCENARIO_FROZEN){lockTrophies();}

    console.log('Day ' + day + ' :' + printTime());
   //const ZONE_BRACKET = PLAYER_COUNT/8;
 
    for (let z = 0; z < (TIMEZONE_ORDER ? TIMEZONE_COUNT : 1 ) ; z++) {

      console.log('Time Zone ' + z);
      
      for (let match = 0; 
            match < 50 * playerIdByTz[z].length; //limit to 50 matchs (in case of multiple skips)
            match++) {
            //pick a random player in tz
            let rand = Math.floor(Math.random( )* (playerIdByTz[z].length));
            let playerId = playerIdByTz[z][rand];
            {
            if(players[playerId].dailyBattlesCount < (players[playerId].bp)?(MAX_MATCH+ADD_MATCH):(MAX_MATCH)){
              opp = findOpponent(playerId);
              battleRes =
                battle(playerId, opp.id, opp.winProbability, opp.trophyChanges);
  
  
              //don't count skip as a match
              if(battleRes[0] != 0 ) players[playerId].dailyBattlesCount++;
              
              //update scores
              players[playerId].trophies += battleRes[0];
              players[opp.id].trophies += battleRes[1];
            } 
          } //playerId
        } // match
        /*
      for (let i = 0; i < ZONE_BRACKET; i++) {
        id = ZONE_BRACKET * z + i;
        //if (players[id].inactive) {
          // do nothing
        //} else 
        {
          matchCount = (players[id].bp)?(MAX_MATCH+ADD_MATCH):(MAX_MATCH);
          
 
          // const opponents = findOpponents(id);
          // toto : mistake above , that should be in the loop
          // otherwise the trophy gain during the day is not accounted for in matchmaking
          // worse opp.trophyChanges is calculated against the initial trophy value instead of current
          
          for (let match = 0; 
              match < matchCount 
              && match < 50; //limit to 50 matchs (in case of multiple skips)
              match++) {
            opp = findOpponent(id);
            battleRes =
              battle(id, opp.id, opp.winProbability, opp.trophyChanges);


            //in case of skip: a new match is possible
            if(battleRes[0] == 0 ) matchCount++;

            players[id].trophies += battleRes[0];
            players[opp.id].trophies += battleRes[1];
          } // for (match)
        }
      } // for (i)
      */
    } // for (z)
  }
}

seasonDays = 7;
season = 1;
reset();
cleanTrophies();
simulate3();
fs.writeFileSync(`${filename_prefix}-1.json`, JSON.stringify(players));

fs.writeFileSync(`${filename_prefix}-1.csv`, printCSV());

seasonDays = 14;
for (season = 2; season <= SEASONS_TO_SIM; season++) {
  reset();
  simulate3();
  fs.writeFileSync(`${filename_prefix}-${season}.json`, JSON.stringify(players));
  
  fs.writeFileSync(`${filename_prefix}-${season}.csv`, printCSV());
}