const { assert } = require('console');

fs = require('fs');

///TODO: allow revenges

/************ begin of sim setup ****************/
const TIMEZONE_ORDER = true; // true: timezones play at different times
const TIMEZONE_COUNT = 8;

const SCENARIO_ONE_TZ_PLAYS_ALL_DAY = false;
const SCENARIO_ONE_TZ_PLAYS_8H = true;

const SCENARIO_MINIMISE_DEF_LOSS = false;
const SCENARIO_MINIMISE_DEF_LOSS_FACTOR = 0.5; // def loss don't cost a single point with zero, normal def loss with 1

const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING = false; // match only players with current day's attacjk in +1/-1 range
const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE = 1;

const SCENARIO_FROZEN_DEF_TROPHIES  = true; //Frozen defensive trophies
const SCENARIO_AVERAGE_DEF  = true; //average defenses for the day
const SCENARIO_AVERAGE_DEF_FACTOR  = 30; //multiply average defenses by
const SCENARIO_FROZEN_OFF_TROPHIES  = false; //Frozen defensive and offensive trophies

const PLAYER_COUNT  = 100 * 1000; // max 100 000  or enlarge input/players.json first

const SEASONS_TO_SIM = 3; // /!\ first season is a simple initialiser, 2 minimum

const BP_RATIO = 30/100;
const INACTIVE_RATIO = 10/100;
/************ end of sim setup ****************/

const scenario_8h = TIMEZONE_ORDER == true && SCENARIO_ONE_TZ_PLAYS_8H && (!SCENARIO_ONE_TZ_PLAYS_ALL_DAY);

console.log("--------------------------------------------------------------------");
console.log("Scenario");
console.log("--------");
console.log(`- ${PLAYER_COUNT} Players`  );
console.log(`- ${SEASONS_TO_SIM} Seasons`  );
console.log(TIMEZONE_ORDER?("- Timezones: " + TIMEZONE_COUNT):"- Timezones: NO");
console.log(TIMEZONE_ORDER == false || SCENARIO_ONE_TZ_PLAYS_ALL_DAY? "Timezone 0 plays all day":"");
console.log(scenario_8h ? "Timezone 0 plays 8h":"");
console.log(SCENARIO_FROZEN_DEF_TROPHIES?"- Frozen def trophies: YES":"- Frozen def trophies: NO");
console.log(SCENARIO_FROZEN_OFF_TROPHIES?"- Frozen off trophies: YES":"- Frozen off trophies: NO");
console.log(SCENARIO_AVERAGE_DEF?`- Averaged defenses: YES${SCENARIO_AVERAGE_DEF_FACTOR}`:"- averaged defenses: NO");

console.log(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING?`- Constraint on matchmaking: YES (+/- ${SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE})`:"- Constraint on matchmaking: NO");

console.log(SCENARIO_MINIMISE_DEF_LOSS?`- Minimise def losses by a factor ${SCENARIO_MINIMISE_DEF_LOSS_FACTOR}` :"- Minimise def losses: NO");

/// different file names for each scenario 
filename_prefix=  "results/"+(SCENARIO_MINIMISE_DEF_LOSS ? `MDL${SCENARIO_MINIMISE_DEF_LOSS_FACTOR}-`:"") + 
                  (SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING ? `PCOM${SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE}-`:"") +   
                  (SCENARIO_FROZEN_DEF_TROPHIES ? "FrozenDefs-":"" ) +    
                  (SCENARIO_FROZEN_OFF_TROPHIES ? "FrozenOffs-":"" ) +   
                  (SCENARIO_AVERAGE_DEF ?`AD${SCENARIO_AVERAGE_DEF_FACTOR}-`:"" ) +  
                  (TIMEZONE_ORDER ? `TZ${TIMEZONE_COUNT}-`:"") +
                  (TIMEZONE_ORDER && SCENARIO_ONE_TZ_PLAYS_ALL_DAY?"TZ0PAD-":"") +
                  (scenario_8h?"TZ0P8h-":"") +
                  `players${PLAYER_COUNT}` + 
                  "-Season";

console.log("output files : "+ filename_prefix+"X.csv")
console.log("--------------------------------------------------------------------");

const def_loss_factor =  SCENARIO_MINIMISE_DEF_LOSS ? SCENARIO_MINIMISE_DEF_LOSS_FACTOR : 1;
// Rock Paper Scissors
const RPS = [
  /*         S      C       A     SEo     D */
  /* S */ [ 0.03, -0.16,  0.10,  0.20, 0.30],
  /* C */ [ 0.20,  0.03, -0.16, -0.10, 0.30],
  /* A */ [-0.03, -0.20,  0.03, -0.16, 0.30],
  /* Seo */ [-0.16, -0.03,  0.20,  0.03, 0.38],
  /* D */ [ 0.23,  0.23,  0.23,  0.23, 0.03],
];

let mismatch = 0;
let mismatch2 =0;
let timesAPlayerEndedAdayUnderHisSTart =0;
let totalDrop =0;
let maxDrop =0;
let maxRaise =0;

const MAX_MATCH = 20;
const ADD_MATCH = 10;

const GEM_MATCH = 10;
let players;
let eligibleOponents =[];

let playerIdByTz;

let averageDefResult =[];
let averageDayResult =[];

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
let repartition_of_tz_0=[];
let averageDefenseEffect ="";
/**
  * Reset arena
  * @return {void}
  */
function reset() {
  for(i=-10000; i<10001;i++){
    averageDefResult[i]=0;
    averageDayResult[i]=0;
  }
  mismatch =0;

  mismatch2 =0;

  timesAPlayerEndedAdayUnderHisSTart =0;
  totalDrop =0;
  maxDrop =0; 
  maxRaise =0;
  // averageDefenseEffect="Defenses,DefensesPoints,CalculatedPoint\n";

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
       player.bp = (Math.random() < BP_RATIO); // 20% bp players
       player.inactive =  player. bp ? false : (Math.random() < INACTIVE_RATIO / (1 - BP_RATIO) );
        if(player.bp){
          player.maxMatch = MAX_MATCH +  ADD_MATCH + GEM_MATCH;
        } 
        else{  
          player.maxMatch =  player.inactive ? 
                              Math.floor(MAX_MATCH*2/3  * random_normal()) :
                              Math.floor(MAX_MATCH*2/3  + (MAX_MATCH/3  +GEM_MATCH +1 ) * random_normal() ) ;
        }
       return player; 
      });

    if(!SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING){
      players.forEach( function (_,id) { eligibleOponents.push(id);});
    }
   
    if(TIMEZONE_COUNT && SCENARIO_ONE_TZ_PLAYS_ALL_DAY){
      for (let tz = 0; tz< TIMEZONE_COUNT-1;tz++){
        repartition_of_tz_0[tz] = [];
  
      }
      players.forEach(function(player,id) { 
        if(player.zone == 0){
          repartition_of_tz_0[Math.floor(Math.random()*(TIMEZONE_COUNT-1))].push(id);
        }
      })
    }
    else if  (TIMEZONE_COUNT && scenario_8h){
      for (let tz = 0; tz< 3;tz++){
        repartition_of_tz_0[tz] = [];
      }
      players.forEach(function(player,id) { 
        if(player.zone == 0){
          repartition_of_tz_0[Math.floor(Math.random()*(3))].push(id);
        }
      });
    }
     
  }

  for (i = 0; i < PLAYER_COUNT; i++) {
    prevTrophies = players[i].trophies;
    if (prevTrophies >= 2700) {
      players[i].trophies = 2500;
    } else if (prevTrophies >= 2200) {
      players[i].trophies = 2500;
    } else {
      players[i].trophies = 2500;
    }
    players[i].W = 0;
    players[i].L = 0;
    players[i].S = 0;
    players[i].dW = 0;
    players[i].dL = 0;

    players[i].dailyBattlesCount = 0;
    players[i].locked = 2500;
    players[i].dailyDefCount = 0;
    players[i].dailyDefTotal = 0;

    
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

 defLoss = Math.max(Math.floor(delta/2),1)*def_loss_factor;

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
  if (diceRoll < winProbability ) { 
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
  const MATCH_LIST_LEN = 50; 
  // toto, changed values above, for only one opponent is selected, no need to make 400 calcs

  const myHero = players[myId].hero;
  const myPwr = players[myId].pwr;
  const myTrophies = SCENARIO_FROZEN_OFF_TROPHIES?players[myId].locked: players[myId].trophies;
 
  const listA = [];
  for (let i = 0; i < MATCH_SEARCH_LEN; i++) {
    let oppId = eligibleOponents.randomElement();
    if( oppId == null){
      assert(false);
      return;
    }
    // neglect the probability thata players gets matched to himself ...
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN_DEF_TROPHIES?players[oppId].locked: players[oppId].trophies;
    //toto:  removed  fitness on power
    listA.push({id: oppId, fitness: - Math.abs(myTrophies  - oppTrophies)  });

    
  }
  listA.sort( function(a, b) {
    //toto: optimisation and simplification of sort

  } );
  

  const listB = listA.slice(0, MATCH_LIST_LEN);
  for (let j = 0; j < MATCH_LIST_LEN; j++) {
    const oppId = listB[j].id;
    const oppPwr = players[oppId].pwr;

    const oppTrophies = SCENARIO_FROZEN_DEF_TROPHIES?players[oppId].locked: players[oppId].trophies;
    const oppHero = players[oppId].hero;
    const potential =
      getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);

      // simplified line below, used only in comparison
    listB[j].score_sanitized = potential.score //Math.round(potential.score * 5000);
    listB[j].winProbability = potential.winProbability;
    listB[j].trophyChanges = potential.trophyChanges;
  }

  
  listB.sort( function(a, b) {
    //toto: small opimisation for live trophies
    return (b.score_sanitized - a.score_sanitized) ; //Bigger score first
  });
  
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
  if(eligibleCount < 40)
    mismatch ++;

  while( eligibleCount < 40){
    eligibleCount =0;
    minBattleCount = Math.max(0,minBattleCount -1);
    maxBattleCount = Math.min(40,maxBattleCount+1);
    for(let i = minBattleCount; i <maxBattleCount; i++)  {
      eligibleCount += eligibleOponents[i].length;
    }
  }
  
  const listA = [];
  for (let i = 0; i < MATCH_SEARCH_LEN; i++) {
    
    let random = Math.floor(eligibleCount * Math.random());
    let oppId = null;
    for(let j = minBattleCount; j <maxBattleCount && oppId == null; j++)  {
      if(random < eligibleOponents[j].length){
        oppId = eligibleOponents[j][random];
        if(players[oppId].dailyBattlesCount != j)
        {
          eligibleOponents[j].splice(random,1);
          eligibleCount -= 1;
          oppId = null;
          j = maxBattleCount;
        }
      }
      else {
        random -= eligibleOponents[j].length;
      }
    }
     
    if( oppId != null){
      // neglect the probability thata players gets matched to himself ...
      const oppPwr = players[oppId].pwr;
      const oppTrophies = SCENARIO_FROZEN_DEF_TROPHIES?players[oppId].locked: players[oppId].trophies;

      //toto:  removed  fitness on power
      listA.push({id: oppId, fitness: - Math.abs(myTrophies  - oppTrophies)  });
    }
  }
  if(listA == null || listA.length == 0){
    mismatch2 ++; 
    return;
  }
  listA.sort( function(a, b) {
    //toto: optimisation and simplification of sort
    return b.fitness -a.fitness
  } );
  

  const listB = listA.slice(0, MATCH_LIST_LEN);
  for (let j = 0; j < MATCH_LIST_LEN; j++) {
    const oppId = listB[j].id;
    const oppPwr = players[oppId].pwr;
    const oppTrophies = SCENARIO_FROZEN_DEF_TROPHIES?players[oppId].locked: players[oppId].trophies;
    const oppHero = players[oppId].hero;
    const potential = getPotential(myHero, myPwr, myTrophies, oppHero, oppPwr, oppTrophies);
      
    // simplified line below, used only in comparison
    listB[j].score_sanitized = potential.score ;
    listB[j].winProbability = potential.winProbability;
    listB[j].trophyChanges = potential.trophyChanges;
  }
  
  listB.sort( function(a, b) {
    //toto: small opimisation for live trophies
    return (b.score_sanitized - a.score_sanitized) ; //Bigger score first
  });
  
  return listB[0];
}
let sim_start = null;
/**
  * Utility function
  * @return {string} formated time string
  */
function printTime() {
  const now = new Date() ;
  if (sim_start == null)
    sim_start =now.getHours()*3600 +now.getMinutes()*60 +now.getSeconds();
  const dt = now.getHours()*3600 +now.getMinutes()*60 +now.getSeconds() - sim_start;

  return Math.floor(dt / 3600) + 'h ' + Math.floor(dt %3600 / 60)+ 'm ' + Math.floor(dt %60 )+'s';
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
  function lockTrophies(day = 0) {
    
    players.forEach(player => {
      let totalGain= player.trophies-player.locked;
      if(day==2){
        maxDrop =0;
        maxRaise =0;
        totalDrop=0;
      }
      if( totalGain <0){
        timesAPlayerEndedAdayUnderHisSTart ++;
        totalDrop += totalGain;
        maxDrop = Math.min(maxDrop, totalGain);
      }
      maxRaise = Math.max(maxRaise, totalGain);

      averageDayResult[totalGain]=averageDayResult[totalGain]+1;

      player.locked = player.trophies;
      if(NaN ==  player.locked ){
          assert(false);
      }
      player.dailyDefCount =0;
      player.dailyDefTotal =0;
    });
  }
/**
    * Averages def results
    * @return {void}
    */
 function unlockTrophies() {
    players.forEach(player => {
      const def=(player.dailyDefCount > 0)? Math.round(SCENARIO_AVERAGE_DEF_FACTOR * player.dailyDefTotal /player.dailyDefCount) :0;
      player.trophies += def;
      averageDefResult[def]=averageDefResult[def]+1;

      
      averageDefenseEffect+=`${player.dailyDefCount},${player.dailyDefTotal},${def}\n`;

      });
  }
  
  lockTrophies(0);
    

  //toto: sort player by time zone or below code for tz is irrelevant
  /*
  if(TIMEZONE_ORDER){
    players.sort((a,b) => a.zone - b.zone ); //tz 0 first then growing
  }// otherwise keep them shuffled 
  */
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
    if(day == 5){
      for(let i =0; i<100; i++){
        players[i].trophies += 1000;
        players[i].locked =players[i].trophies;

      }for(let i =100; i<200; i++){
        players[i].trophies -= 1000;
        players[i].locked =players[i].trophies

      }

    }

    
    
    console.log("Season " + season+ ' Day ' + day + '; time since simulation start ' + printTime());
   //const ZONE_BRACKET = PLAYER_COUNT/8;
    const start_tz = TIMEZONE_ORDER && (SCENARIO_ONE_TZ_PLAYS_ALL_DAY || scenario_8h)? 1:0;
    for (let z = start_tz; z < (TIMEZONE_ORDER ? TIMEZONE_COUNT : 1 ) ; z++) {

      console.log('Time Zone ' + z);
      
      for (let match = 0; 
        match < (30 + 2*day) * PLAYER_COUNT / (TIMEZONE_ORDER && SCENARIO_ONE_TZ_PLAYS_ALL_DAY? Math.max(TIMEZONE_COUNT-1,1) : TIMEZONE_COUNT); 
        //limit to 30 to 56 matchs depending on day (in case of multiple skips)
        //progressive matchs
        match++) {
        //pick a random player in tz
        let playerId ;
        //if(day == 5 && playerId%5 ==0){}else
        { 
          let rand = Math.floor(Math.random( )* (playerIdByTz[z].length));
          if(TIMEZONE_ORDER &&SCENARIO_ONE_TZ_PLAYS_ALL_DAY){
            let group = repartition_of_tz_0.randomElement();
            let count = group.length + playerIdByTz[z].length;
            let randomValue = Math.floor(Math.random()*count);
            if(randomValue < group.length){
              playerId = group[randomValue];
            }else{
              playerId = playerIdByTz[z][randomValue-group.length];
            }
          }
          else if(scenario_8h){
            let group_number = Math.floor((z-1) * 3 /TIMEZONE_COUNT);
            assert(group_number<3);

            let group = repartition_of_tz_0[group_number];
            let count = group.length + playerIdByTz[z].length;

            let randomValue = Math.floor(Math.random()*count);
            if(randomValue < group.length){
              playerId = group[randomValue];
            }else{
              playerId = playerIdByTz[z][randomValue-group.length];
            }
          }
          else{
            playerId= playerIdByTz[z][rand];
          }
          if(playerId==null){
            assert(false);
          }
          else
          {
          if(players[playerId].dailyBattlesCount < players[playerId].maxMatch){
            opp = SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING? findOpponentwithconstraint(playerId) : findOpponent(playerId);
            if(opp != null){
              
              battleRes =
                battle(playerId, opp.id, opp.winProbability, opp.trophyChanges);


              //don't count skip as a match
              if(battleRes[0] != 0 ){

                if(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING){
                  // optimisation we should remove eligible opponent from previous list,  but let's lazy do that later 
                  // eligibleOponents[players[playerId].dailyBattlesCount]=eligibleOponents[players[playerId].dailyBattlesCount].filter(p => p != playerId);
                  eligibleOponents[players[playerId].dailyBattlesCount+1].push(playerId);

                }
                players[playerId].dailyBattlesCount++;

              } 
              
              
              //update scores

              if(SCENARIO_AVERAGE_DEF){
                players[opp.id].dailyDefCount++;
                players[opp.id].dailyDefTotal += battleRes[1];
              } else {        
                players[opp.id].trophies += battleRes[1];
             
              }
              players[playerId].trophies += battleRes[0];

              
            }
          } 
        }
        } //playerId
      } // match
    } // for (z)

    if(SCENARIO_AVERAGE_DEF){
      unlockTrophies();
    }
    if(SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING)
    {
      console.log(`days missmatchs ${mismatch} : the  selection was enlarged \n`);
      console.log(`days miss ${mismatch2} : no opponent \n`);
      mismatch =0;
      mismatch2 =0;
    }
   
        lockTrophies(day);
        console.log(`times a Player Ended A day Under His Start ${timesAPlayerEndedAdayUnderHisSTart} total Drop ${totalDrop}`);
     console.log(`Max drop :  ${maxDrop}  Max raise: ${maxRaise}`)
    
    
  }
}

seasonDays = 14;
season = 1;
reset();
cleanTrophies();
simulate3();fs.writeFileSync(`${filename_prefix}-1.json`, JSON.stringify(players));

fs.writeFileSync(`${filename_prefix}-1.csv`, printCSV());
printAvgDay();

seasonDays = 14;
for (season = 2; season <= SEASONS_TO_SIM; season++) {
  reset();
  simulate3();
  fs.writeFileSync(`${filename_prefix}-${season}.json`, JSON.stringify(players));
  
  fs.writeFileSync(`${filename_prefix}-${season}.csv`, printCSV());
  printAvgDay();

}

function printAvgDay(){
  averagedef = "Points,Count\n";
  averageday = "Points,Count\n";
  for(i=-10000;i<10001;i++)
  {
    averagedef+=`${i},${averageDefResult[i]}\n`;
    averageday+=`${i},${averageDayResult[i]}\n`
  }
  fs.writeFileSync(`${filename_prefix}-${season}-averagedef.csv`, averagedef);
  fs.writeFileSync(`${filename_prefix}-${season}-averageday.csv`, averageday);
  if(SCENARIO_AVERAGE_DEF){
    fs.writeFileSync(`${filename_prefix}-${season}-averageDefenseEffect.csv`, averageDefenseEffect); 
  }
}