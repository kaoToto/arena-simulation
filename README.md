# arena-simulation

### Simulation for AoW:legion arena

Do your own sim :
- Clone me,
- Install node.js, 
- Choose the scenarios by editing some values at the top of `index.js`
- Start the simulation from the command line with 

    > `node index.js` 


- Simulation is slow (1h for 3 seasons on my computer), run it in background
- Multiple scenarios can run in parallel (launch scenario 1, edit file for scenario 2, launch scenario 2 ..). It does not impact significatively the simulation time.

Check already made simulations (the .csv files)

*Original code for frozen trophy simulation by Kitsune, additional scenarios by Toto*

### Assumptions and simplifications in the simulation:

- All player start at 2500 (simplification)
- Only 5 heros, with RPS effect
- Match result are based on Hero RPS effect and power
- Matchmaking selects random players close to attacker in power and trophies
- Players always choose the best match in their match list, match list is limited in size (not 100)
- There is no revenge (simplification)
- 3 attacker profiles :
    - 30 % buy battle pass and will do 40 attacks daily, (not realist, but fair for each simulated bp players, and easier to compare)
    - 10 % are inactive (less than 15 attacks per day),
    - 60 % (other players) do between 15 and 30,
    The repartition of number of attacks in each profile is a bell curve, the number of attack is calculated for each player, it does not change during the simulation 
    Number of attacks increases accross the seasons (linear increase)
- The % of battle pass users is the same for all power levels (simplification)
- Timezones attacks are segregated (simplification). All player from a same timezone attack before the players from the next timezone
- Attacks are in random order within a timezone

### Possible simulation scenarios :

You can mix scenarios.

1. Timezone

    Players will play at different times by timezone

    > ```const TIMEZONE_ORDER = true;```
    >
    > ```TIMEZONE_COUNT = 8;```

    The result filenames contain the number of Timezones used `TZ<count>`.

2. Minimize defensive loss
    
    Adapt the result of a defensive loss by a chosen factor

    > ```const SCENARIO_MINIMISE_DEF_LOSS = true;```
    >
    > ```const SCENARIO_MINIMISE_DEF_LOSS_FACTOR = 0;```


    The result filenames are prefixed with `MDL<factor>-`.

3. Constrain possible matched opponents based on the relative attack count for the day
    
    PLayers are matched with opponents having the same battle count (+/- SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE ),  if possible. The scope of matchable enlarges when the match list is too small. 

    > ```const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING = true;``` 
    >
    > ```const SCENARIO_PROGRESSION_CONSTRAINT_ON_MATCHMAKING_DIFFERENCE = 0;``` 

    The result filenames are prefixed with `PCOM<Diff>-`.

4. Frozen trophies for defender
    
    Defender's trophies are frozen for the day, attacker picks his opponent and gets a result based on his live trophies and defender's frozen trophies.

    > ```const SCENARIO_FROZEN  = true;```

    The result filenames are prefixed with `frozen-`.

5. Count of players and seasons to simulate

    Simulate up to 100 000 players (for more, but a new players.json init file will be needed), and any number of season.

    > ```const PLAYER_COUNT = 100000;``` 
    >
    > ```const SEASONS_TO_SIM = 3;```

    The result filenames are suffixed with the number of players and the season  `players<player-count>-Season<season>`.

You may run multiple simulations in parallel (just edit the const to run different scenarios), for a reasonable amount of simulations that should not slow down the simulations. You may mix scenarios as well, (eg. PCOM and MDL)


