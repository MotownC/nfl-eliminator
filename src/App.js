// Updated: October 21, 2025

import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// -------------------- 
// Firebase Config
// --------------------
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

// -------------------- 
// APIs
// --------------------
const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ODDS_API_KEY = process.env.REACT_APP_ODDS_API_KEY || "f1e2424c4bc6fab51a692a147e0bf88b";
const ODDS_API = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?regions=us&markets=spreads&apiKey=${ODDS_API_KEY}`;

// -------------------- 
// Utility Functions
// --------------------
const normalizeTeamName = (name) => {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
};

const findMatchingOdds = (game, oddsData) => {
  if (!oddsData || oddsData.length === 0) return null;
  
  const homeName = normalizeTeamName(game.home);
  const awayName = normalizeTeamName(game.away);
  
  return oddsData.find(odds => {
    const oddsHome = normalizeTeamName(odds.home_team);
    const oddsAway = normalizeTeamName(odds.away_team);
    return (oddsHome === homeName && oddsAway === awayName) || 
           (oddsHome === awayName && oddsAway === homeName);
  });
};

// -------------------- 
// Login Component
// --------------------
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
    sessionStorage.setItem("nflEliminatorUser", trimmedName);
    onLogin(trimmedName);
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{
        backgroundColor: "white",
        padding: 40,
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        maxWidth: 400,
        width: "100%"
      }}>
        <h1 style={{ textAlign: "center", color: "#333", marginBottom: 30 }}>
          NFL Eliminator Pool
        </h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, color: "#555", fontWeight: "bold" }}>
              Enter Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="Your name"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 4,
                fontSize: 16,
                boxSizing: "border-box"
              }}
              autoFocus
            />
          </div>
          {error && (
            <div style={{ color: "red", marginBottom: 15, fontSize: "0.9em" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: 12,
              backgroundColor: "#1E90FF",
              color: "white",
              border: "none",
              borderRadius: 4,
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer"
            }}
          >
            Enter Pool
          </button>
        </form>
      </div>
    </div>
  );
}

// -------------------- 
// Main App Component
// --------------------
function MainApp({ userName }) {
  const [games, setGames] = useState([]);
  const [week, setWeek] = useState(null);
  const [allPicks, setAllPicks] = useState({});
  const [userStatus, setUserStatus] = useState("Pending");
  const [seasonStandings, setSeasonStandings] = useState({});
  const [weeklyPicks, setWeeklyPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const listenersRef = useRef({});

  // -------------------- 
  // Fetch Games & Spreads
  // --------------------
  const fetchGames = async () => {
    try {
      setError(null);
      
      // Fetch ESPN data
      const espnRes = await fetch(ESPN_API);
      if (!espnRes.ok) throw new Error(`ESPN API error: ${espnRes.status}`);
      const espnData = await espnRes.json();
      
      if (!espnData.events || espnData.events.length === 0) {
        throw new Error("No games available");
      }

      const currentWeek = espnData.week?.number || 1;
      console.log("ESPN API says current week is:", currentWeek);
      setWeek(currentWeek);

      // Parse ESPN games
      let parsedGames = espnData.events.map(ev => {
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

      // Fetch odds data - check if cached and less than 24 hours old
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

      // Merge spreads
      parsedGames = parsedGames.map(g => {
        const oddsMatch = findMatchingOdds(g, oddsData);
        const outcomes = oddsMatch?.bookmakers?.[0]?.markets?.[0]?.outcomes || [];
        
        // Find which team is favored (negative spread = favorite)
        const homeOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(g.home));
        const awayOutcome = outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(g.away));
        
        let homeSpread = "N/A";
        let awaySpread = "N/A";
        
        if (homeOutcome?.point !== undefined) {
          homeSpread = homeOutcome.point;
        }
        if (awayOutcome?.point !== undefined) {
          awaySpread = awayOutcome.point;
        }

        return {
          ...g,
          homeSpread,
          awaySpread
        };
      });

      parsedGames.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      setGames(parsedGames);

      // Setup Firebase listeners
      if (db) {
        setupFirebaseListeners(currentWeek, parsedGames, userName);
      }

      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Failed to load games");
      setLoading(false);
    }
  };

  const setupFirebaseListeners = (currentWeek, parsedGames, user) => {
    // Clean up old listeners
    Object.values(listenersRef.current).forEach(unsubscribe => unsubscribe?.());
    listenersRef.current = {};

    // Week picks listener
    const weekRef = ref(db, `weeks/${currentWeek}`);
    const unsubWeek = onValue(
      weekRef,
      snapshot => {
        const picks = snapshot.val() || {};
        setAllPicks(picks);

        // Update user status
        if (picks[user]) {
          const pickTeam = picks[user].pick;
          const game = parsedGames.find(g => g.home === pickTeam || g.away === pickTeam);
          if (game) {
            const isHome = game.home === pickTeam;
            const winner = isHome ? game.homeWinner : game.awayWinner;
            if (winner === null || winner === undefined) {
              setUserStatus("Pending");
            } else {
              setUserStatus(winner ? "Alive" : "Eliminated");
            }
          }
        }
      },
      err => console.error("Week listener error:", err)
    );
    listenersRef.current.week = unsubWeek;

    // Weekly picks listener - calculate standings from all weeks
    const allWeeksRef = ref(db, "weeks");
    const unsubAllWeeks = onValue(
      allWeeksRef,
      snapshot => {
        const allWeeks = snapshot.val() || {};
        setWeeklyPicks(allWeeks);

        // Calculate season standings from picks
        const standings = {};
        Object.values(allWeeks).forEach(week => {
          Object.entries(week).forEach(([playerName, pickData]) => {
            if (!standings[playerName]) {
              standings[playerName] = { seasonPoints: 0, eliminatorActive: true };
            }
            if (pickData.result === true) {
              standings[playerName].seasonPoints += 1;
            } else if (pickData.result === false) {
              standings[playerName].eliminatorActive = false;
            }
          });
        });

        setSeasonStandings(standings);
      },
      err => console.error("Weekly picks listener error:", err)
    );
    listenersRef.current.allWeeks = unsubAllWeeks;
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 90 * 1000);
    
    return () => {
      clearInterval(interval);
      Object.values(listenersRef.current).forEach(unsubscribe => unsubscribe?.());
    };
  }, []);

  const getEliminatorColor = (status) => status ? "#28a745" : "#dc3545";
  const getUserStatusColor = () => {
    if (userStatus === "Alive") return "#28a745";
    if (userStatus === "Eliminated") return "#dc3545";
    return "#6c757d";
  };

  // -------------------- 
  // Make Pick
  // --------------------
  const makePick = async (team) => {
    if (!week || !db) {
      setError("Not ready to pick yet");
      return;
    }

    try {
      const weekRef = ref(db, `weeks/${week}/${userName}`);
      await set(weekRef, {
        pick: team,
        result: "Pending",
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Pick error:", err);
      setError("Failed to make pick");
    }
  };

  // -------------------- 
  // Render
  // --------------------
  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p>Loading games...</p>
      </div>
    );
  }

  if (error && games.length === 0) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        <p>Error: {error}</p>
        <button onClick={() => fetchGames()}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "auto", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>NFL Eliminator Pool - Week {week}</h2>
          <p style={{ margin: "5px 0 0 0", color: "#666" }}>Logged in as: <strong>{userName}</strong></p>
        </div>
      </div>

      <h3>
        Status: <span style={{ color: getUserStatusColor() }}>{userStatus}</span>
      </h3>

      {error && (
        <div style={{ color: "orange", marginBottom: 15 }}>
          {error}
        </div>
      )}

      {/* Current Week Games */}
      <div>
        <h3>This Week's Games</h3>
        {games.length === 0 ? (
          <p>No games available</p>
        ) : (
          games.map(g => {
            const now = new Date();
            const gameDate = new Date(g.kickoff);
            const gameInPast = gameDate < now;
            const awayAlreadyPicked = Object.values(allPicks).some(p => p.pick === g.away);
            const homeAlreadyPicked = Object.values(allPicks).some(p => p.pick === g.home);

            return (
              <div
                key={g.id}
                style={{
                  marginBottom: 15,
                  border: "1px solid #ccc",
                  padding: 12,
                  borderRadius: 6,
                  backgroundColor: gameInPast ? "#e0e0e0" : "#f9f9f9"
                }}
              >
                <div>{gameDate.toLocaleString()}</div>
                <div style={{ margin: "6px 0", fontWeight: "bold" }}>
                  {g.away} vs {g.home}
                </div>
                <div style={{ fontSize: "0.9em", color: "#666", marginBottom: 10 }}>
                  {g.awaySpread !== "N/A" && g.homeSpread !== "N/A" ? (
                    g.awaySpread < g.homeSpread ? (
                      `${g.away} (${g.awaySpread}) vs ${g.home}`
                    ) : (
                      `${g.away} vs ${g.home} (${g.homeSpread})`
                    )
                  ) : (
                    "Spreads unavailable"
                  )}
                </div>
                <button
                  disabled={gameInPast || awayAlreadyPicked}
                  style={{
                    marginRight: 10,
                    padding: "6px 12px",
                    backgroundColor: gameInPast || awayAlreadyPicked ? "#ccc" : "#1E90FF",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: gameInPast || awayAlreadyPicked ? "not-allowed" : "pointer"
                  }}
                  onClick={() => makePick(g.away)}
                >
                  Pick {g.away}
                </button>
                <button
                  disabled={gameInPast || homeAlreadyPicked}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: gameInPast || homeAlreadyPicked ? "#ccc" : "#1E90FF",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: gameInPast || homeAlreadyPicked ? "not-allowed" : "pointer"
                  }}
                  onClick={() => makePick(g.home)}
                >
                  Pick {g.home}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Eliminator Phase */}
      <h3>Eliminator Status</h3>
      {Object.keys(seasonStandings).length === 0 ? (
        <p>No standings yet</p>
      ) : (
        <ul>
          {Object.entries(seasonStandings).map(([user, stats]) => (
            <li key={user} style={{ color: getEliminatorColor(stats?.eliminatorActive) }}>
              {user} - {stats?.eliminatorActive ? "Alive" : "Eliminated"}
            </li>
          ))}
        </ul>
      )}

      {/* Season Standings */}
      <h3>Season Standings</h3>
      {Object.keys(seasonStandings).length === 0 ? (
        <p>No standings yet</p>
      ) : (
        <ul>
          {Object.entries(seasonStandings)
            .sort((a, b) => (b[1]?.seasonPoints || 0) - (a[1]?.seasonPoints || 0))
            .map(([user, stats]) => (
              <li key={user}>
                {user} - {stats?.seasonPoints || 0} pts
              </li>
            ))}
        </ul>
      )}

      {/* Week-by-Week Summary Table */}
      <h3>Weekly Picks Summary</h3>
      {Object.keys(weeklyPicks).length === 0 ? (
        <p>No picks yet</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: 6, backgroundColor: "#f0f0f0" }}>
                Name
              </th>
              {Object.keys(weeklyPicks)
                .sort((a, b) => Number(a) - Number(b))
                .map(wk => (
                  <th
                    key={wk}
                    style={{ border: "1px solid #ccc", padding: 6, backgroundColor: "#f0f0f0" }}
                  >
                    Week {wk}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(seasonStandings).map(user => (
              <tr key={user}>
                <td style={{ border: "1px solid #ccc", padding: 6, fontWeight: "bold" }}>
                  {user}
                </td>
                {Object.keys(weeklyPicks)
                  .sort((a, b) => Number(a) - Number(b))
                  .map(wk => {
                    const pick = weeklyPicks[wk]?.[user]?.pick;
                    const result = weeklyPicks[wk]?.[user]?.result;

                    if (!pick) {
                      return (
                        <td
                          key={wk}
                          style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }}
                        >
                          -
                        </td>
                      );
                    }

                    return (
                      <td
                        key={wk}
                        style={{ border: "1px solid #ccc", padding: 6, textAlign: "center" }}
                      >
                        {pick}
                        {result === "Pending" ? null : result === true ? (
                          <span style={{ color: "green", marginLeft: 4, fontWeight: "bold" }}>
                            ✓
                          </span>
                        ) : (
                          <span style={{ color: "red", marginLeft: 4, fontWeight: "bold" }}>
                            ✗
                          </span>
                        )}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// -------------------- 
// App Wrapper with Login Logic
// --------------------
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

  if (!userName) {
    return <LoginPage onLogin={setUserName} />;
  }

  return <MainApp userName={userName} onLogout={handleLogout} />;
}

export default App;