const { assert } = require('console');

fs = require('fs');
///TODO: allow revenges

/************ begin of sim setup ****************/
const TIMEZONE_ORDER = true; // true: timezones play at different times
const TIMEZONE_COUNT = 8;

const SCENARIO_MINIMISE_DEF_LOSS = false;
const SCENARIO_MINIMISE_DEF_LOSS_FACTOR = 0; // def loss don't cost a single point with zero, normal def loss with 1

const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING = true; // match only players with current day's attacjk in +1/-1 range
const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE = 1;

const SCENARIO_FROZEN  = false; //Frozen defensive trophies

const PLAYER_COUNT  = 100 * 1000; // max 100 000  or enlarge players.json first

const SEASONS_TO_SIM = 3; // /!\ first season is a simple initialiser, 2 minimum


/************ end of sim setup ****************/
console.log("--------------------------------------------------------------------");
console.log("Scenario");
console.log("--------");
console.log(`- ${PLAYER_COUNT} Players`  );
console.log(`- ${SEASONS_TO_SIM} Seasons`  );
console.log(TIMEZONE_ORDER?("- Timezones: " + TIMEZONE_COUNT):"- Timezones: NO");
console.log(SCENARIO_FROZEN?"- Frozen trophies: YES":"- Frozen trophies: NO");
console.log(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING?`- Constraint on matchmaking: YES (+/- ${SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE})`:"- Constraint on matchmaking: NO");

console.log(SCENARIO_MINIMISE_DEF_LOSS?`- Minimise def losses by a factor ${SCENARIO_MINIMISE_DEF_LOSS_FACTOR}` :"- Minimise def losses: NO");

/// different file names for each scenario 
filename_prefix=  "results/"+(SCENARIO_MINIMISE_DEF_LOSS ? `MDL${SCENARIO_MINIMISE_DEF_LOSS_FACTOR}-`:"") + 
                  (SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING ? `PCOM${SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE}-`:"") +   
                  (SCENARIO_FROZEN ? "Frozen-":"" ) +  
                  (TIMEZONE_ORDER ? `TZ${TIMEZONE_COUNT}-`:"") + 
                  `players${PLAYER_COUNT}` + 
                  "-Season";

console.log("output files : "+ filename_prefix+"X.csv")
console.log("--------------------------------------------------------------------");
// Rock Paper Scissors
const RPS = [
  /*         S      C       A     Z     D */
  /* S */ [ 0.03, -0.16,  0.10,  0.20, 0.30],
  /* C */ [ 0.20,  0.03, -0.16,  0.10, 0.30],
  /* A */ [-0.03,  0.20,  0.03, -0.16, 0.30],
  /* Z */ [-0.16, -0.03,  0.20,  0.03, 0.38],
  /* D */ [-0.23, -0.23, -0.23, -0.23, 0.03],
];

let mismatch = 0;
const MAX_MATCH = 20;
const ADD_MATCH = 10;
const GEM_MATCH = 10;
let players;
let eligibleOponents =[];

let playerIdByTz;

//toto: add new table so that sort by trophy  do not impact match order in following seasons.
let sortedPlayers;
let season = 1; // first season

/**
 * Normal (gauss curve) random
 * @returns {number} a random number between 0 and 1, with a normal distribution
 */
function random_normal() {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return random_normal() // resample between 0 and 1
  return num
}

/**
  * Reset arena
  * @return {void}
  */
function reset() {

  mismatch =0;

  if(season >1 ){
    players = JSON.parse(fs.readFileSync(`${filename_prefix}-${season-1}.json`));
  }
  else {
    //always use the same init file for first season
    players = JSON.parse(fs.readFileSync(`input/players.json`))
    .shuffle()
    .slice(0,PLAYER_COUNT)
    .map(player =>{
       player.zone = (Math.floor(Math.random() * TIMEZONE_COUNT));
       player.pwr *= 1.9 / 1.4; 
       player.bp = (Math.random() < 0.1); // 10% bp players
       player.inactive =  player. bp ? false : (Math.random() < 0.33);
        if(player.bp){
          player.maxMatch = MAX_MATCH +  ADD_MATCH + Math.floor(GEM_MATCH * random_normal());
        } 
        else{  
          player.maxMatch =  player.inactive ? 
                              Math.floor(MAX_MATCH /2  * random_normal()) :
                              MAX_MATCH/2 + Math.floor((MAX_MATCH/2  +GEM_MATCH) * random_normal() ) ;
        }
       return player; 
      });

    if(!SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING){
      players.forEach( function (_,id) { eligibleOponents.push(id);});
    }
     
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
  diceRoll = Math.random() ; 
  if (diceRoll < winProbability - 0.1) { //added -0.1 to simulate mis-evaluation of battle result
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
/**  return random element from array 
 * * @param {[object]} this, Source array
 * @return {object} Random item in array
*/
Array.prototype.randomElement = function() {
  return this[Math.floor(Math.random() * this.length)]
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
    let oppId = eligibleOponents.randomElement();
    if( oppId == null){
      assert(false);
      return;
    }
    // neglect the probability thata players gets matched to himself ...
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;
    //toto:  removed  fitness on power
    listA.push({id: oppId, fitness: - Math.abs(myTrophies  - oppTrophies)  });
  }
  listA.sort( function(a, b) {
    //toto: optimisation and simplification of sort
    return b.fitness -a.fitness

  } );
  

  const listB = listA.slice(0, MATCH_LIST_LEN);
  for (let j = 0; j < MATCH_LIST_LEN; j++) {
    const oppId = listB[j].id;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;
    const oppHero = players[oppId].hero;
    const potential =
      getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);

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
}
function findOpponentwithconstraint(myId) {
  const MATCH_SEARCH_LEN = 50;
  const MATCH_LIST_LEN = 10; 
  // toto, changed values above, for only one opponent is selected, no need to make 400 calcs

  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = players[myId].trophies;
 
  

  
  minBattleCount = Math.max(0,players[myId].dailyBattlesCount - SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE);
  maxBattleCount = Math.min(40,players[myId].dailyBattlesCount + SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE);
  let eligibleCount =0;
  for(let i = minBattleCount; i <maxBattleCount; i++)  {
    eligibleCount += eligibleOponents[i].length;
  }
  if(eligibleCount < 20)
    mismatch ++;

  while( eligibleCount < 20){
    eligibleCount =0;
    minBattleCount = Math.max(0,minBattleCount -1);
    maxBattleCount = Math.min(40,maxBattleCount+1);
    for(let i = minBattleCount; i <maxBattleCount; i++)  {
      eligibleCount += eligibleOponents[i].length;
    }
  }
  
  if( eligibleCount <= 10){
    assert(false);
    return;
  }
  const listA = [];
  for (let i = 0; i < MATCH_SEARCH_LEN; i++) {
    
    let random = Math.floor(eligibleCount * Math.random());
    let oppId = null;
    for(let i = minBattleCount; i <maxBattleCount && oppId == null; i++)  {
      if(random < eligibleOponents[i].length){
        oppId = eligibleOponents[i][random];
      }
      else {
        random -= eligibleOponents[i].length;
      }
    }
     
    if( oppId == null){
      assert(false);
      return;
    }
    // neglect the probability thata players gets matched to himself ...
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;

    //toto:  removed  fitness on power
    listA.push({id: oppId, fitness: - Math.abs(myTrophies  - oppTrophies)  });
  }
  listA.sort( function(a, b) {
    //toto: optimisation and simplification of sort
    return b.fitness -a.fitness
  } );
  

  const listB = listA.slice(0, MATCH_LIST_LEN);
  for (let j = 0; j < MATCH_LIST_LEN; j++) {
    const oppId = listB[j].id;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN?players[oppId].locked: players[oppId].trophies;
    const oppHero = players[oppId].hero;
    const potential = getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);
      
    // simplified line below, used only in comparison
    listB[j].score_sanitized = potential.score ;
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
  csv = 'player id,bp,inactive,zone,hero,pwr,trophies,skip,win,loss,d win,d loss,max attacks\n';
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
    sortedPlayers[i].dL  + ',' +
    sortedPlayers[i].maxMatch 
    + '\n';
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
    if(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING){
      eligibleOponents = [];
      for (let i =0; i< 41; i++){
        eligibleOponents[i] = [];
      }
      players.forEach( function (player,id) { 
        player.dailyBattlesCount =0;
        eligibleOponents[0].push(id);});
    }else{
      players.forEach( function (player,id) { 
        player.dailyBattlesCount =0;});
    }

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
            if(players[playerId].dailyBattlesCount < players[playerId].maxMatch){
              opp = SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING? findOpponentwithconstraint(playerId) : findOpponent(playerId);
              if(opp != null){
                
                battleRes =
                  battle(playerId, opp.id, opp.winProbability, opp.trophyChanges);


                //don't count skip as a match
                if(battleRes[0] != 0 ){

                  if(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING){
                    eligibleOponents[players[playerId].dailyBattlesCount]=eligibleOponents[players[playerId].dailyBattlesCount].filter(p => p != playerId);
                    eligibleOponents[players[playerId].dailyBattlesCount+1].push(playerId);

                  }
                  players[playerId].dailyBattlesCount++;

                } 
                
                
                //update scores
                players[playerId].trophies += battleRes[0];
                players[opp.id].trophies += battleRes[1];
              }
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
    if(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING)
    {
      console.log(`days missmatchs ${mismatch} : the  selection was enlarged \n`);
      mismatch =0;
    }

  }
}

seasonDays = 4;
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