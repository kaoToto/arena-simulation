# arena-simulation

## Simulation insights :

### Current rules

There is a big disadvantage for early attackers. The later you attack, the better

### Frozen trophies

Frozen trophies aims at reducing are anihilating the late attacker advantage.

Divergence, or Panda effect, is the result of many player attacking the same target, which can start a day with a good trophy count and then gets downed under zero in a day.

The simulation shows divergences for **Defender frozen trophies**.

The simulation shows divergences also for **Defender and Attaker frozen trophies**

The simulation shows no divergence for **Defender frozen trophies + average defense trophies  30**  (Defenses of the day are averaged then multiplied by 30.)

### Reduce defense losses by a factor

Simulation shows no reduction of late attacker advantage.

### Match oponent with similar battle count

Simulation shows similar results whatever the hour you attack. Grouping your attacks works much better than spreading them according to simulation.


## Simulation for AoW:legion arena

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

## Assumptions and simplifications in the simulation:

- All player start at 2500 (simplification)
- Only 5 heros, with RPS effect
- Match result are based on Hero RPS effect and power
- Matchmaking selects random players and the best expected result is then chosen and fought. (This might be an extremely effective, thus unrealistic, way to pick an opponent in a match list, it should be quite true for the top players)
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
- to initiaite panda effects, some noise is added at the beginning of day 5 with 100 players (id 0 to 99) getting +1000 trophies, and 100  (id 100 to 199) getting -1000. 

## Possible simulation scenarios :

You can mix scenarios.

1. Timezone

    Players will play at different times by timezone

    > ```const TIMEZONE_ORDER = true;```
    >
    > ```TIMEZONE_COUNT = 8;```

    The result filenames contain the number of Timezones used `TZ<count>`.

    You can have time zone 0 attack all day while other attack in order

    > ```const SCENARIO_ONE_TZ_PLAYS_ALL_DAY = true;```

    You can have one time zone where players plays about 1/3 of the day 

    > ```const SCENARIO_ONE_TZ_PLAYS_8h = true;```

    *if you set true for all day and 8h players in TZ 0 will play all day*


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
    
    Defender's trophies are frozen for the day, attacker picks his opponent and gets a result based on his trophies and defender's frozen trophies.

    > ```const SCENARIO_FROZEN_DEF_TROPHIES  = true;```

    Attacker's trophies are frozen for the day, attacker picks his opponent and gets a result based on his frozen trophies and defender's trophies.

    > ```const SCENARIO_FROZEN_OFF_TROPHIES  = true;``

    You can set none, either or both frozen def and frozen off.
    The result filenames are prefixed with `FrozenDefs-` or `FrozenOffs`as approriate.
    

    Another possibility is to test frozen def trophies with averaged defense results 
    
    > Defense of the day = SCENARIO_AVERAGE_DEF_FACTOR * sum(Defenses_points) / defense_count


    > ```const SCENARIO_FROZEN_DEF_TROPHIES  = true;```
    > ```const SCENARIO_AVERAGE_DEF  = true;``
    > ```const SCENARIO_AVERAGE_DEF_FACTOR  = 30;``

    The later mode produces an additional csv file with each daily average made (defenses_count, defenses_points, defense_average) to check how much unfair average are made on player getting low defense counts.

5. Count of players and seasons to simulate

    Simulate up to 100 000 players (for more, but a new players.json init file will be needed), and any number of season.

    > ```const PLAYER_COUNT = 100000;``` 
    >
    > ```const SEASONS_TO_SIM = 3;```

    The result filenames are suffixed with the number of players and the season  `players<player-count>-Season<season>`.

You may run multiple simulations in parallel (just edit the const to run different scenarios), for a reasonable amount of simulations that should not slow down the simulations. You may mix scenarios as well, (eg. PCOM and MDL)





