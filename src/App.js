// Updated: October 26, 2025 - Removed "Refresh Now" and "fixColtsWeek8Results" buttons, retained Colts matching fix
import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBcCdQkuY1Q8tZxCxXpHZPWIQq_qgIYHHw",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "nfleliminator-7a33d.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "nfleliminator-7a33d",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "nfleliminator-7a33d.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "539172204231",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:539172204231:web:e8fb4778b76b8e247258e2"
};

let app, db;
try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (err) {
  console.error("Firebase initialization failed:", err);
}

const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ODDS_API_KEY = process.env.REACT_APP_ODDS_API_KEY || "f1e2424c4bc6fab51a692a147e0bf88b";
const ODDS_API = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${ODDS_API_KEY}`;

const normalizeTeamName = (name) => {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
};

const getTeamNickname = (fullName) => {
  if (!fullName) return "";
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1];
};

const getTeamAbbr = (teamName) => {
  const abbrs = {
    'Cardinals': 'ARI', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF',
    'Panthers': 'CAR', 'Bears': 'CHI', 'Bengals': 'CIN', 'Browns': 'CLE',
    'Cowboys': 'DAL', 'Broncos': 'DEN', 'Lions': 'DET', 'Packers': 'GB',
    'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX', 'Chiefs': 'KC',
    'Raiders': 'LV', 'Chargers': 'LAC', 'Rams': 'LAR', 'Dolphins': 'MIA',
    'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO', 'Giants': 'NYG',
    'Jets': 'NYJ', 'Eagles': 'PHI', 'Steelers': 'PIT', '49ers': 'SF',
    'Seahawks': 'SEA', 'Buccaneers': 'TB', 'Titans': 'TEN', 'Commanders': 'WAS'
  };
  const nickname = getTeamNickname(teamName);
  return abbrs[nickname] || 'NFL';
};

const getTeamLogo = (teamName) => {
  const abbr = getTeamAbbr(teamName);
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
};

const findMatchingOdds = (game, oddsData) => {
  if (!oddsData || oddsData.length === 0) return null;
  const homeName = normalizeTeamName(game.home);
  const awayName = normalizeTeamName(game.away);
  return oddsData.find(odds => {
    const oddsHome = normalizeTeamName(odds.home_team);
    const oddsAway = normalizeTeamName(odds.away_team);
    return (oddsHome === homeName && oddsAway === awayName) || (oddsHome === awayName && oddsAway === homeName);
  });
};

const APPROVED_USERS = [
  'Beth', 'Craig', 'Jennifer', 'Sally', 'Curt', 'Keith',
  'Riley', 'Seth', 'Libby', 'Kyle', 'Wendi', 'Will', 'Andrea'
];

function LoginPage({ onLogin }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name");
      return;
    }

    const approvedUser = APPROVED_USERS.find(
      user => user.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!approvedUser) {
      setError("Name not recognized. Please check your spelling or contact Craig.");
      return;
    }

    sessionStorage.setItem("nflEliminatorUser", approvedUser);
    onLogin(approvedUser);
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ backgroundColor: "white", padding: 40, borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", maxWidth: 400, width: "100%" }}>
        <h1 style={{ textAlign: "center", color: "#333", marginBottom: 30 }}>NFL Eliminator Pool</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, color: "#555", fontWeight: "bold" }}>Enter Your Name</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="Your name" style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 4, fontSize: 16, boxSizing: "border-box" }} autoFocus />
          </div>
          {error && <div style={{ color: "red", marginBottom: 15, fontSize: "0.9em" }}>{error}</div>}
          <button type="submit" style={{ width: "100%", padding: 12, backgroundColor: "#1E90FF", color: "white", border: "none", borderRadius: 4, fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>Enter Pool</button>
        </form>
      </div>
    </div>
  );
}

function MainApp({ userName }) {
  const [games, setGames] = useState([]);
  const [week, setWeek] = useState(null);
  const [allPicks, setAllPicks] = useState({});
  const [userStatus, setUserStatus] = useState("Pending");
  const [seasonStandings, setSeasonStandings] = useState({});
  const [weeklyPicks, setWeeklyPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const listenersRef = useRef({});
  const summaryRef = useRef(null);
  const prevGamesRef = useRef([]);

  const calculateStreak = (user) => {
    const weeks = Object.keys(weeklyPicks).sort((a, b) => Number(b) - Number(a));
    if (weeks.length === 0) return "-";
    let streak = 0;
    let streakType = null;
    for (const wk of weeks) {
      const pick = weeklyPicks[wk]?.[user];
      if (!pick || !pick.pick) continue;
      const result = pick.result;
      if (result === "Pending" || result === null || result === undefined) continue;
      const isWin = result === true;
      if (streakType === null) {
        streakType = isWin ? 'won' : 'lost';
        streak = 1;
      } else if ((streakType === 'won' && isWin) || (streakType === 'lost' && !isWin)) {
        streak++;
      } else {
        break;
      }
    }
    if (streak === 0) return "-";
    return `${streakType === 'won' ? 'Won' : 'Lost'} ${streak}`;
  };

  const retryFirebaseWrite = async (ref, data, maxAttempts = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await set(ref, data);
        return true;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        console.warn(`Firebase write attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  };

  const updatePickResults = async (currentWeek, parsedGames, completedGameIds = []) => {
    console.log("=== AUTO-UPDATE FUNCTION CALLED ===");
    console.log("Current week:", currentWeek);
    console.log("Completed game IDs:", completedGameIds);

    if (!db) {
      console.log("No database connection, skipping auto-update");
      return;
    }

    try {
      const weekRef = ref(db, `weeks/${currentWeek}`);
      const snapshot = await new Promise((resolve, reject) => {
        onValue(weekRef, resolve, reject, { onlyOnce: true });
      });

      const picks = snapshot.val() || {};
      console.log(`Found ${Object.keys(picks).length} picks for week ${currentWeek}`);

      const gamesToProcess = completedGameIds.length > 0
        ? parsedGames.filter(g => completedGameIds.includes(g.id))
        : parsedGames.filter(g => g.homeWinner !== null || g.awayWinner !== null);

      console.log(`Processing ${gamesToProcess.length} completed game(s)`);

      for (const game of gamesToProcess) {
        console.log(`Processing completed game: ${game.away} vs ${game.home}, HomeWinner: ${game.homeWinner}, AwayWinner: ${game.awayWinner}`);
        
        // Special handling for Colts to ensure correct matching
        const coltsAliases = ["Indianapolis Colts", "Colts", "IND", "indianapolis colts", "colts", "ind"];
        const isColtsGame = coltsAliases.includes(normalizeTeamName(game.home)) || coltsAliases.includes(normalizeTeamName(game.away));
        if (isColtsGame) {
          console.log(`Colts game detected: Home=${game.home}, Away=${game.away}, HomeWinner=${game.homeWinner}, AwayWinner=${game.awayWinner}`);
        }

        for (const [playerName, pickData] of Object.entries(picks)) {
          if (pickData.result !== "Pending" && pickData.result !== undefined && pickData.result !== null) {
            console.log(`  Skipping ${playerName} - already resolved (Result: ${pickData.result})`);
            continue;
          }

          const pickTeam = pickData.pick ? normalizeTeamName(pickData.pick) : "";
          if (!pickTeam) {
            console.log(`  Skipping ${playerName} - no valid pick`);
            continue;
          }

          // Enhanced team matching
          const isHome = game.home === pickData.pick ||
                         normalizeTeamName(game.home) === pickTeam ||
                         getTeamNickname(game.home) === getTeamNickname(pickData.pick) ||
                         (coltsAliases.includes(normalizeTeamName(game.home)) && coltsAliases.includes(pickTeam));
          const isAway = game.away === pickData.pick ||
                         normalizeTeamName(game.away) === pickTeam ||
                         getTeamNickname(game.away) === getTeamNickname(pickData.pick) ||
                         (coltsAliases.includes(normalizeTeamName(game.away)) && coltsAliases.includes(pickTeam));

          if (!isHome && !isAway) {
            console.log(`  ${playerName}'s pick (${pickData.pick}) not in game ${game.id} (home: ${game.home}, away: ${game.away})`);
            continue;
          }

          const winner = isHome ? game.homeWinner : game.awayWinner;
          console.log(`  ${playerName} picked ${isHome ? 'home' : 'away'} (${pickData.pick}), winner status: ${winner}`);

          // Validate winner status
          if (winner === null || winner === undefined) {
            console.warn(`  Warning: No winner determined for game ${game.id}, skipping update for ${playerName}`);
            continue;
          }

          // Special logging for Colts picks
          if (isColtsGame && (isHome || isAway)) {
            console.log(`  Colts pick update for ${playerName}: Pick=${pickData.pick}, Result=${winner ? 'Won' : 'Lost'}`);
          }

          const playerRef = ref(db, `weeks/${currentWeek}/${playerName}`);
          await retryFirebaseWrite(playerRef, {
            ...pickData,
            result: winner
          });
          console.log(`✅ Updated ${playerName}'s pick: ${pickData.pick} = ${winner ? 'Won' : 'Lost'}`);
        }
      }
      console.log("=== Finished updating pick results ===");
    } catch (err) {
      console.error("Error updating pick results:", err);
      setError("Failed to update game results. Please try again later.");
    }
  };

  const fetchGames = async () => {
    try {
      setError(null);
      const espnRes = await fetch(ESPN_API);
      if (!espnRes.ok) throw new Error(`ESPN API error: ${espnRes.status}`);
      const espnData = await espnRes.json();
      if (!espnData.events || espnData.events.length === 0) throw new Error("No games available");
      const currentWeek = espnData.week?.number || 1;
      console.log("ESPN API says current week is:", currentWeek);
      setWeek(currentWeek);

      const parsedGames = espnData.events.map(ev => {
        const comps = ev.competitions[0]?.competitors || [];
        const homeComp = comps.find(c => c.homeAway === "home");
        const awayComp = comps.find(c => c.homeAway === "away");
        return {
          id: ev.id,
          kickoff: ev.date,
          home: homeComp?.team?.displayName || "Unknown",
          away: awayComp?.team?.displayName || "Unknown",
          homeWinner: homeComp?.winner === true ? true : homeComp?.winner === false ? false : null,
          awayWinner: awayComp?.winner === true ? true : awayComp?.winner === false ? false : null,
          homeSpread: "N/A",
          awaySpread: "N/A"
        };
      });

      const completedGames = parsedGames.filter(g => {
        const prevGame = prevGamesRef.current.find(pg => pg.id === g.id);
        return (
          prevGame &&
          ((prevGame.homeWinner === null && g.homeWinner !== null) ||
           (prevGame.awayWinner === null && g.awayWinner !== null))
        );
      });

      if (completedGames.length > 0) {
        console.log("Detected newly completed games:", completedGames);
      }

      await updatePickResults(currentWeek, parsedGames);

      let oddsData = [];
      const now = Date.now();
      const cachedOdds = sessionStorage.getItem("cachedOdds");
      const cachedOddsTime = sessionStorage.getItem("cachedOddsTime");
      const dayInMs = 24 * 60 * 60 * 1000;
      if (cachedOdds && cachedOddsTime && (now - parseInt(cachedOddsTime)) < dayInMs) {
        oddsData = JSON.parse(cachedOdds);
        console.log("Using cached odds data");
      } else {
        try {
          const oddsRes = await fetch(ODDS_API);
          if (oddsRes.ok) {
            const oddsJson = await oddsRes.json();
            oddsData = oddsJson.data || oddsJson || [];
            sessionStorage.setItem("cachedOdds", JSON.stringify(oddsData));
            sessionStorage.setItem("cachedOddsTime", now.toString());
            console.log("Fetched fresh odds data");
          } else {
            console.warn("Odds API returned status:", oddsRes.status);
            if (cachedOdds) {
              oddsData = JSON.parse(cachedOdds);
              console.log("Using stale cached odds due to API error");
            }
          }
        } catch (oddsErr) {
          console.warn("Could not fetch odds:", oddsErr);
          if (cachedOdds) {
            oddsData = JSON.parse(cachedOdds);
            console.log("Using cached odds due to fetch error");
          }
        }
      }

      const updatedGames = parsedGames.map(g => {
        const oddsMatch = findMatchingOdds(g, oddsData);
        const outcomes = oddsMatch?.bookmakers?.[0]?.markets?.[0]?.outcomes || [];
        const homeOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(g.home));
        const awayOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(g.away));
        let homeSpread = "N/A", awaySpread = "N/A";
        if (homeOutcome?.point !== undefined) homeSpread = homeOutcome.point;
        if (awayOutcome?.point !== undefined) awaySpread = awayOutcome.point;
        return { ...g, homeSpread, awaySpread };
      }).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

      setGames(updatedGames);
      prevGamesRef.current = parsedGames;
      if (db) setupFirebaseListeners(currentWeek, updatedGames, userName);
      setLoading(false);
      setSuccessMessage("Game data refreshed successfully");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load games");
      setLoading(false);
    }
  };

  const setupFirebaseListeners = (currentWeek, parsedGames, user) => {
    Object.values(listenersRef.current).forEach(unsubscribe => unsubscribe?.());
    listenersRef.current = {};

    const weekRef = ref(db, `weeks/${currentWeek}`);
    const unsubWeek = onValue(weekRef, snapshot => {
      const picks = snapshot.val() || {};
      setAllPicks(picks);
      if (picks[user]) {
        const pickTeam = picks[user].pick;
        const game = parsedGames.find(g =>
          g.home === pickTeam ||
          g.away === pickTeam ||
          normalizeTeamName(g.home) === normalizeTeamName(pickTeam) ||
          normalizeTeamName(g.away) === normalizeTeamName(pickTeam) ||
          getTeamNickname(g.home) === getTeamNickname(pickTeam) ||
          getTeamNickname(g.away) === getTeamNickname(pickTeam)
        );
        if (game) {
          const isHome = game.home === pickTeam || normalizeTeamName(game.home) === normalizeTeamName(pickTeam) || getTeamNickname(game.home) === getTeamNickname(pickTeam);
          const winner = isHome ? game.homeWinner : game.awayWinner;
          if (winner === null || winner === undefined) setUserStatus("Pending");
          else setUserStatus(winner ? "Alive" : "Eliminated");
        } else {
          console.log(`No game found for ${user}'s pick: ${pickTeam}`);
          setUserStatus("Pending");
        }
      }
    }, err => {
      console.error("Week listener error:", err);
      setError("Failed to sync with Firebase. Please try again later.");
    });
    listenersRef.current.week = unsubWeek;

    const allWeeksRef = ref(db, "weeks");
    const unsubAllWeeks = onValue(allWeeksRef, snapshot => {
      const allWeeks = snapshot.val() || {};
      setWeeklyPicks(allWeeks);
      const standings = {};
      APPROVED_USERS.forEach(playerName => {
        standings[playerName] = { seasonPoints: 0, eliminatorActive: true };
      });
      Object.entries(allWeeks).forEach(([weekNum, weekData]) => {
        Object.entries(weekData).forEach(([playerName, pickData]) => {
          if (!standings[playerName]) {
            standings[playerName] = { seasonPoints: 0, eliminatorActive: true };
          }
          console.log(`Week ${weekNum}, ${playerName}: Pick=${pickData.pick}, Result=${pickData.result}`);
          if (pickData.result === true) {
            standings[playerName].seasonPoints += 1;
          } else if (pickData.result === false) {
            standings[playerName].eliminatorActive = false;
          }
        });
      });
      console.log("Computed standings:", standings);
      setSeasonStandings(standings);
      setUserStatus(standings[user]?.eliminatorActive ? "Alive" : "Eliminated");
    }, err => {
      console.error("Weekly picks listener error:", err);
      setError("Failed to sync standings. Please try again later.");
    });
    listenersRef.current.allWeeks = unsubAllWeeks;
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 300 * 1000); // 5 minutes
    return () => {
      clearInterval(interval);
      Object.values(listenersRef.current).forEach(unsubscribe => unsubscribe?.());
    };
  }, []);

  const getUserStatusColor = () => {
    if (userStatus === "Alive") return "#28a745";
    if (userStatus === "Eliminated") return "#dc3545";
    return "#6c757d";
  };

  const makePick = async (team) => {
    if (!week || !db) { setError("Not ready to pick yet"); return; }
    if (allPicks[userName]?.pick) { setError("You've already made your pick for this week. Picks cannot be changed."); return; }
    try {
      const weekRef = ref(db, `weeks/${week}/${userName}`);
      await retryFirebaseWrite(weekRef, { pick: team, result: "Pending", timestamp: new Date().toISOString() });
      setSuccessMessage(`✅ Your pick for Week ${week}: ${team}`);
      setError(null);
      setTimeout(() => { summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 500);
      setTimeout(() => { setSuccessMessage(""); }, 5000);
    } catch (err) {
      console.error("Pick error:", err);
      setError("Failed to make pick. Please try again.");
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center" }}><p>Loading games...</p></div>;
  if (error && games.length === 0) return <div style={{ padding: 20, color: "red" }}><p>Error: {error}</p><button onClick={() => fetchGames()}>Retry</button></div>;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "auto", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>NFL Eliminator Pool - Week {week}</h2>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>Logged in as: <strong>{userName}</strong></p>
        </div>
      </div>
      <h3>Status: <span style={{ color: getUserStatusColor() }}>{userStatus}</span></h3>
      {successMessage && <div style={{ color: "green", backgroundColor: "#d4edda", border: "1px solid #c3e6cb", padding: 12, borderRadius: 4, marginBottom: 15, fontWeight: "bold" }}>{successMessage}</div>}
      {error && <div style={{ color: "#721c24", backgroundColor: "#f8d7da", border: "1px solid #f5c6cb", padding: 12, borderRadius: 4, marginBottom: 15 }}>{error}</div>}
      <div>
        <h3>This Week's Games</h3>
        {games.length === 0 ? <p>No games available</p> : games.map(g => {
          const now = new Date();
          const gameDate = new Date(g.kickoff);
          const gameInPast = gameDate < now;
          const userPreviousPicks = Object.entries(weeklyPicks).filter(([wk, _]) => Number(wk) < week).map(([_, picks]) => picks[userName]?.pick).filter(Boolean);
          console.log(`User ${userName} previous picks:`, userPreviousPicks);
          const awayNickname = getTeamNickname(g.away);
          const homeNickname = getTeamNickname(g.home);
          const awayAlreadyPickedByUser = userPreviousPicks.some(pick => getTeamNickname(pick) === awayNickname || pick === g.away);
          const homeAlreadyPickedByUser = userPreviousPicks.some(pick => getTeamNickname(pick) === homeNickname || pick === g.home);
          const userPickThisWeek = allPicks[userName]?.pick;
          const userPickedAway = userPickThisWeek === g.away || getTeamNickname(userPickThisWeek) === awayNickname;
          const userPickedHome = userPickThisWeek === g.home || getTeamNickname(userPickThisWeek) === homeNickname;
          const hasPickedThisWeek = !!userPickThisWeek;
          return (
            <div key={g.id} style={{ marginBottom: 15, border: "1px solid #ccc", padding: 12, borderRadius: 6, backgroundColor: gameInPast ? "#e0e0e0" : "#f9f9f9" }}>
              <div style={{ fontSize: "0.9em", color: "#666" }}>
                {gameDate.toLocaleString('en-US', { 
                  weekday: 'short',
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZoneName: 'short'
                })}
              </div>
              <div style={{ margin: "10px 0", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
                <img src={getTeamLogo(g.away)} alt={g.away} style={{ width: 30, height: 30 }} onError={(e) => e.target.style.display = 'none'} />
                <span>{g.away}</span>
                <span style={{ margin: "0 5px" }}>vs</span>
                <img src={getTeamLogo(g.home)} alt={g.home} style={{ width: 30, height: 30 }} onError={(e) => e.target.style.display = 'none'} />
                <span>{g.home}</span>
              </div>
              <div style={{ fontSize: "0.9em", color: "#666", marginBottom: 10 }}>
                {g.awaySpread !== "N/A" && g.homeSpread !== "N/A" ? (g.awaySpread < g.homeSpread ? `${g.away} (${g.awaySpread}) vs ${g.home}` : `${g.away} vs ${g.home} (${g.homeSpread})`) : "Spreads unavailable"}
              </div>
              {awayAlreadyPickedByUser && <div style={{ fontSize: "0.85em", color: "#999", marginBottom: 5 }}>⚠️ You already picked {g.away}</div>}
              {homeAlreadyPickedByUser && <div style={{ fontSize: "0.85em", color: "#999", marginBottom: 5 }}>⚠️ You already picked {g.home}</div>}
              <button disabled={gameInPast || awayAlreadyPickedByUser || (hasPickedThisWeek && !userPickedAway)} style={{ marginRight: 10, padding: "6px 12px", backgroundColor: userPickedAway ? "#28a745" : (gameInPast || awayAlreadyPickedByUser || hasPickedThisWeek) ? "#ccc" : "#1E90FF", color: "white", border: "none", borderRadius: 4, cursor: (gameInPast || awayAlreadyPickedByUser || hasPickedThisWeek) ? "not-allowed" : "pointer", opacity: awayAlreadyPickedByUser ? 0.5 : 1, fontWeight: userPickedAway ? "bold" : "normal" }} onClick={() => makePick(g.away)} title={awayAlreadyPickedByUser ? "You already picked this team" : hasPickedThisWeek ? "Pick locked in" : ""}>
                {userPickedAway ? `✓ ${g.away}` : `Pick ${g.away}`}
              </button>
              <button disabled={gameInPast || homeAlreadyPickedByUser || (hasPickedThisWeek && !userPickedHome)} style={{ padding: "6px 12px", backgroundColor: userPickedHome ? "#28a745" : (gameInPast || homeAlreadyPickedByUser || hasPickedThisWeek) ? "#ccc" : "#1E90FF", color: "white", border: "none", borderRadius: 4, cursor: (gameInPast || homeAlreadyPickedByUser || hasPickedThisWeek) ? "not-allowed" : "pointer", opacity: homeAlreadyPickedByUser ? 0.5 : 1, fontWeight: userPickedHome ? "bold" : "normal" }} onClick={() => makePick(g.home)} title={homeAlreadyPickedByUser ? "You already picked this team" : hasPickedThisWeek ? "Pick locked in" : ""}>
                {userPickedHome ? `✓ ${g.home}` : `Pick ${g.home}`}
              </button>
            </div>
          );
        })}
      </div>
      <h3>Season Standings</h3>
      {Object.keys(seasonStandings).length === 0 ? <p>No standings yet</p> : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 30 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 8, backgroundColor: "#f0f0f0", textAlign: "left" }}>Name</th>
              <th style={{ border: "1px solid #ccc", padding: 8, backgroundColor: "#f0f0f0", textAlign: "center" }}>Overall Wins</th>
              <th style={{ border: "1px solid #ccc", padding: 8, backgroundColor: "#f0f0f0", textAlign: "center" }}>Streak</th>
              <th style={{ border: "1px solid #ccc", padding: 8, backgroundColor: "#f0f0f0", textAlign: "center" }}>Eliminator Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(seasonStandings).sort((a, b) => {
              const winsA = a[1]?.seasonPoints || 0;
              const winsB = b[1]?.seasonPoints || 0;
              if (winsB !== winsA) return winsB - winsA;
              return a[0].localeCompare(b[0]);
            }).map(([user, stats]) => (
              <tr key={user}>
                <td style={{ border: "1px solid #ccc", padding: 8 }}>{user}</td>
                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{stats?.seasonPoints || 0}</td>
                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center" }}>{calculateStreak(user)}</td>
                <td style={{ border: "1px solid #ccc", padding: 8, textAlign: "center", fontSize: "1.5em" }}>{stats?.eliminatorActive ? "😊" : "💀"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 ref={summaryRef}>Weekly Picks Summary</h3>
      {Object.keys(weeklyPicks).length === 0 ? <p>No picks yet</p> : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 6, backgroundColor: "#f0f0f0" }}>Name</th>
              {Object.keys(weeklyPicks).sort((a, b) => Number(a) - Number(b)).map(wk => <th key={wk} style={{ border: "1px solid #ccc", padding: 6, backgroundColor: "#f0f0f0" }}>Week {wk}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.keys(seasonStandings).sort((a, b) => a.localeCompare(b)).map(user => {
              const currentUserHasPicked = weeklyPicks[week]?.[userName]?.pick;
              return (
                <tr key={user}>
                  <td style={{ border: "1px solid #ccc", padding: 6, fontWeight: "bold" }}>{user}</td>
                  {Object.keys(weeklyPicks).sort((a, b) => Number(a) - Number(b)).map(wk => {
                    const pick = weeklyPicks[wk]?.[user]?.pick;
                    const result = weeklyPicks[wk]?.[user]?.result;
                    const isCurrentWeek = Number(wk) === week;
                    if (!pick) return <td key={wk} style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }}>-</td>;
                    if (isCurrentWeek && !currentUserHasPicked) return <td key={wk} style={{ border: "1px solid #ccc", padding: 6, textAlign: "center", color: "#999" }}>🔒</td>;
                    return (
                      <td key={wk} style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }}>
                        {getTeamNickname(pick)}
                        {result === "Pending" ? null : result === true ? <span style={{ color: "green", marginLeft: 4, fontWeight: "bold" }}>✓</span> : result === false ? <span style={{ color: "red", marginLeft: 4, fontWeight: "bold" }}>✗</span> : <span style={{ color: "#999", marginLeft: 4 }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 40, padding: 20, backgroundColor: "#f8f9fa", borderRadius: 8, border: "1px solid #dee2e6", textAlign: "center" }}>
        <h3 style={{ margin: "0 0 15px 0" }}>Entry Fee Payment</h3>
        <a href="https://venmo.com/u/Craig-Anderson-75?txn=pay&amount=20&note=NFL%20Eliminator%20Entry" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "12px 24px", backgroundColor: "#3D95CE", color: "white", textDecoration: "none", borderRadius: 6, fontWeight: "bold", fontSize: "16px" }}>Pay $20 via Venmo</a>
        <p style={{ margin: "15px 0 0 0", fontSize: "0.9em", color: "#666" }}>Please include your name in the payment note</p>
      </div>
    </div>
  );
}

function App({ userName: initialUserName = null }) {
  const [userName, setUserName] = useState(() => {
    const stored = sessionStorage.getItem("nflEliminatorUser");
    console.log("Initial userName check:", { initialUserName, stored });
    return initialUserName || stored || null;
  });
  const handleLogout = () => {
    sessionStorage.removeItem("nflEliminatorUser");
    setUserName(null);
  };
  if (!userName) return <LoginPage onLogin={setUserName} />;
  return <MainApp userName={userName} onLogout={handleLogout} />;
}

export default App;