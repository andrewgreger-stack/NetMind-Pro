import React, { useState, useMemo, useEffect } from 'react';
import { 
    Activity, Crosshair, Map, BarChart3, Trash2, Shield, PlusCircle, 
    MousePointer2, PlayCircle, Info, X, Download, Calendar, Users, FolderOpen, Loader2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = "netmind-pro-app";

// --- MOCK DATA GENERATOR ---
const generateMockData = () => {
    const types = ['Wrist', 'Snap', 'Slap', 'Backhand', 'Deflection'];
    const situations = ['Even Strength', 'Power Play', 'Penalty Kill'];
    const results = ['Save', 'Save', 'Save', 'Save', 'Goal', 'Miss']; // Weight towards saves
    const zones = ['Top L', 'Top C', 'Top R', 'Mid L', 'Mid C', 'Mid R', 'Low L', '5-Hole', 'Low R'];
    const periods = ['1st', '2nd', '3rd', 'OT'];
    
    const mockGames = [
        { id: `game_${Date.now() - 100000}`, date: '2026-10-12', opponent: 'Spartans', locationType: 'Home', gameType: 'League', shots: [] },
        { id: `game_${Date.now() - 50000}`, date: '2026-10-19', opponent: 'Vipers', locationType: 'Away', gameType: 'Exhibition', shots: [] }
    ];

    mockGames.forEach(game => {
        const numShots = 20 + Math.floor(Math.random() * 15);
        for (let i = 0; i < numShots; i++) {
            const x = 30 + Math.random() * 40; 
            const y = 20 + Math.random() * 60;
            
            game.shots.push({
                id: `shot_${game.id}_${i}`,
                timestamp: new Date(Date.now() - Math.random() * 10000000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                x: Math.max(5, Math.min(95, x + (Math.random() * 20 - 10))), // Add scatter
                y: Math.max(15, Math.min(95, y + (Math.random() * 20 - 10))),
                result: results[Math.floor(Math.random() * results.length)],
                type: types[Math.floor(Math.random() * types.length)],
                situation: situations[Math.floor(Math.random() * situations.length)],
                netZone: zones[Math.floor(Math.random() * zones.length)],
                period: periods[Math.floor(Math.random() * periods.length)],
            });
        }
        game.shots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    return mockGames;
};

export default function NetMindApp() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('season');
    const [games, setGames] = useState([]);
    const [activeGameId, setActiveGameId] = useState(null);
    const [analyticsFilter, setAnalyticsFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // New Game Form
    const [newGameForm, setNewGameForm] = useState({ 
        opponent: '', 
        date: new Date().toISOString().split('T')[0],
        locationType: 'Home',
        gameType: 'League'
    });

    // Form State
    const [currentShot, setCurrentShot] = useState({
        x: null,
        y: null,
        netZone: null,
        result: 'Save',
        type: 'Wrist',
        situation: 'Even Strength',
        period: '1st'
    });

    // --- FIREBASE AUTH & SYNC ---
    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (err) {
                console.error("Authentication failed:", err);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        
        const gamesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'games');
        const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
            const loadedGames = [];
            snapshot.forEach((doc) => {
                loadedGames.push({ id: doc.id, ...doc.data() });
            });
            // Sort by most recent game date
            loadedGames.sort((a, b) => new Date(b.date) - new Date(a.date));
            setGames(loadedGames);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching games:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user]);


    const activeGame = games.find(g => g.id === activeGameId);
    const activeShots = activeGame ? activeGame.shots : [];

    const handleRinkClick = (e) => {
        if (activeTab !== 'log' || !activeGame) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setCurrentShot(prev => ({ ...prev, x, y }));
        setIsModalOpen(true); // Open the pop-up modal
    };

    const submitShot = async () => {
        if (currentShot.x === null || currentShot.netZone === null || !user || !activeGame) {
            alert("Please select a target on the net.");
            return;
        }

        const newShot = {
            ...currentShot,
            id: `shot_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const updatedShots = [newShot, ...activeShots];
        const gameRef = doc(db, 'artifacts', appId, 'users', user.uid, 'games', activeGameId);

        try {
            await updateDoc(gameRef, { shots: updatedShots });
            
            // Reset specific form fields while keeping context
            setCurrentShot(prev => ({
                ...prev,
                x: null,
                y: null,
                netZone: null,
                result: 'Save'
            }));
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving shot:", error);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentShot(prev => ({ ...prev, x: null, y: null, netZone: null })); // Reset the shot location if cancelled
    };

    const deleteShot = async (shotId) => {
        if (!user || !activeGame) return;
        const targetGame = games.find(g => g.id === activeGameId);
        if (!targetGame) return;

        const updatedShots = targetGame.shots.filter(s => s.id !== shotId);
        const gameRef = doc(db, 'artifacts', appId, 'users', user.uid, 'games', activeGameId);
        
        try {
            await updateDoc(gameRef, { shots: updatedShots });
        } catch (error) {
            console.error("Error deleting shot:", error);
        }
    };

    const loadMockData = async () => {
        if (!user) return;
        setIsLoading(true);
        const mockGames = generateMockData();
        
        try {
            // Save mock games to the cloud database
            for (const game of mockGames) {
                const { id, ...gameData } = game;
                const gameRef = doc(db, 'artifacts', appId, 'users', user.uid, 'games', id);
                await setDoc(gameRef, gameData);
            }
            setActiveGameId(mockGames[0].id);
            setActiveTab('analytics');
        } catch (error) {
            console.error("Error saving mock data:", error);
            setIsLoading(false);
        }
    };

    const createNewGame = async (e) => {
        e.preventDefault();
        if (!newGameForm.opponent || !user) return;
        
        const newGameId = `game_${Date.now()}`;
        const newGameData = {
            date: newGameForm.date,
            opponent: newGameForm.opponent,
            locationType: newGameForm.locationType,
            gameType: newGameForm.gameType,
            shots: []
        };
        
        try {
            const gameRef = doc(db, 'artifacts', appId, 'users', user.uid, 'games', newGameId);
            await setDoc(gameRef, newGameData);
            
            setActiveGameId(newGameId);
            setAnalyticsFilter(newGameId);
            setNewGameForm({ opponent: '', date: new Date().toISOString().split('T')[0], locationType: 'Home', gameType: 'League' });
            setActiveTab('log');
        } catch (error) {
            console.error("Error creating game:", error);
        }
    };

    const exportToCSV = () => {
        if (games.length === 0) {
            alert("No data to export.");
            return;
        }
        let csv = "Game Date,Game Type,Location Type,Opponent,Period,Shot Time,Result,Shot Type,Net Zone,Situation,Ice X,Ice Y\n";
        games.forEach(game => {
            game.shots.forEach(shot => {
                const opp = `"${game.opponent.replace(/"/g, '""')}"`; // Handle commas in opponent name
                csv += `${game.date},${game.gameType},${game.locationType},${opp},${shot.period},${shot.timestamp},${shot.result},${shot.type},${shot.netZone},${shot.situation},${shot.x.toFixed(2)},${shot.y.toFixed(2)}\n`;
            });
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `netmind_season_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- ANALYTICS CALCULATIONS ---
    const stats = useMemo(() => {
        let analyzedShots = [];
        if (analyticsFilter === 'all') {
            games.forEach(g => analyzedShots.push(...g.shots));
        } else {
            const targetGame = games.find(g => g.id === analyticsFilter);
            if (targetGame) analyzedShots = targetGame.shots;
        }

        const total = analyzedShots.length;
        const saves = analyzedShots.filter(s => s.result === 'Save').length;
        const goals = analyzedShots.filter(s => s.result === 'Goal').length;
        const missed = analyzedShots.filter(s => s.result === 'Miss').length;
        const shotsOnGoal = saves + goals;
        const svPct = shotsOnGoal > 0 ? ((saves / shotsOnGoal) * 100).toFixed(1) : '0.0';

        // Zone analysis
        const zoneStats = {};
        analyzedShots.forEach(s => {
            if (!s.netZone) return;
            if (!zoneStats[s.netZone]) zoneStats[s.netZone] = { total: 0, goals: 0, saves: 0 };
            zoneStats[s.netZone].total++;
            if (s.result === 'Goal') zoneStats[s.netZone].goals++;
            if (s.result === 'Save') zoneStats[s.netZone].saves++;
        });

        return { total, saves, goals, missed, shotsOnGoal, svPct, zoneStats, analyzedShots };
    }, [games, analyticsFilter]);


    // --- UI COMPONENTS ---
    const IceRink = ({ interactive = true, plotShots = [] }) => (
        <div className="relative w-full aspect-[1/1.2] bg-white rounded-xl shadow-inner border-2 border-slate-200 overflow-hidden cursor-crosshair touch-none select-none">
            <svg 
                viewBox="0 0 100 120" 
                className="absolute inset-0 w-full h-full"
                onClick={interactive ? handleRinkClick : undefined}
            >
                {/* Ice Background */}
                <rect x="0" y="0" width="100" height="120" fill="#f8fafc" />
                
                {/* Boards / Rink Bounds */}
                <rect x="2" y="-20" width="96" height="138" rx="18" ry="18" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                
                {/* Goal Line */}
                <line x1="6" y1="15" x2="94" y2="15" stroke="#ef4444" strokeWidth="0.5" />
                
                {/* Crease */}
                <path d="M 42 15 A 8 8 0 0 0 58 15 Z" fill="#bae6fd" stroke="#ef4444" strokeWidth="0.5" />
                <path d="M 40 15 A 10 10 0 0 0 60 15 Z" fill="none" stroke="#ef4444" strokeWidth="0.25" strokeDasharray="1,1" />
                
                {/* Goal Frame */}
                <rect x="46" y="12" width="8" height="3" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
                
                {/* Faceoff Circles */}
                <circle cx="22" cy="40" r="10" fill="none" stroke="#ef4444" strokeWidth="0.5" />
                <circle cx="22" cy="40" r="0.8" fill="#ef4444" />
                <circle cx="78" cy="40" r="10" fill="none" stroke="#ef4444" strokeWidth="0.5" />
                <circle cx="78" cy="40" r="0.8" fill="#ef4444" />
                
                {/* Neutral Zone Hash / Blue Line */}
                <line x1="2" y1="95" x2="98" y2="95" stroke="#3b82f6" strokeWidth="1.5" />
                <circle cx="50" cy="120" r="10" fill="none" stroke="#3b82f6" strokeWidth="0.5" />

                {/* Current Shot Marker */}
                {interactive && currentShot.x !== null && (
                    <g transform={`translate(${currentShot.x}, ${currentShot.y})`}>
                        <circle r="2.5" fill="#eab308" stroke="white" strokeWidth="0.5" className="animate-ping absolute opacity-75" />
                        <circle r="2" fill="#eab308" stroke="white" strokeWidth="0.5" />
                        <line x1="0" y1="0" x2={50 - currentShot.x} y2={15 - currentShot.y} stroke="#eab308" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.6"/>
                    </g>
                )}

                {/* Plotted Shots (Analytics) */}
                {!interactive && plotShots.map(shot => (
                    shot.x && shot.y && (
                        <circle 
                            key={shot.id} 
                            cx={shot.x} 
                            cy={shot.y} 
                            r={shot.result === 'Goal' ? 2.5 : 1.8} 
                            fill={shot.result === 'Goal' ? '#ef4444' : shot.result === 'Save' ? '#22c55e' : '#94a3b8'} 
                            stroke="white" 
                            strokeWidth="0.4"
                            opacity="0.85"
                        />
                    )
                ))}
            </svg>
            
            {interactive && !currentShot.x && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                    <div className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1">
                        <MousePointer2 size={12} /> Tap ice to mark shot location
                    </div>
                </div>
            )}
        </div>
    );

    const NetSelector = ({ interactive = true, zoneStats = null }) => {
        const zones = [
            'Top L', 'Top C', 'Top R',
            'Mid L', 'Mid C', 'Mid R',
            'Low L', '5-Hole', 'Low R'
        ];

        return (
            <div className="relative w-full max-w-[260px] mx-auto aspect-[4/3] bg-white rounded-xl border-4 border-red-500 overflow-hidden shadow-sm p-1 flex flex-col">
                {/* Net netting background pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                
                <div className="grid grid-cols-3 grid-rows-3 gap-1 h-full w-full relative z-10">
                    {zones.map((zone) => {
                        const isSelected = currentShot.netZone === zone;
                        let statBg = "bg-slate-100/80";
                        let statText = null;

                        if (!interactive && zoneStats && zoneStats[zone]) {
                            const zTotal = zoneStats[zone].total;
                            const zGoals = zoneStats[zone].goals;
                            const zSaves = zoneStats[zone].saves;
                            const zSvPct = zTotal > 0 ? ((zSaves / (zSaves + zGoals)) * 100) : 0;
                            
                            if (zTotal === 0 || (zSaves + zGoals) === 0) {
                                statBg = "bg-slate-100/50";
                            } else if (zSvPct >= 90) {
                                statBg = "bg-green-100/80";
                            } else if (zSvPct <= 75) {
                                statBg = "bg-red-100/80";
                            } else {
                                statBg = "bg-yellow-100/80";
                            }
                            statText = `${zSvPct.toFixed(0)}%`;
                        }

                        return (
                            <button
                                key={zone}
                                onClick={() => interactive && setCurrentShot(prev => ({ ...prev, netZone: zone }))}
                                disabled={!interactive}
                                className={`
                                    relative flex flex-col items-center justify-center rounded transition-all duration-200
                                    ${interactive ? 'hover:bg-blue-50 hover:border-blue-300 border border-transparent' : statBg}
                                    ${isSelected ? 'bg-blue-500 text-white shadow-md ring-2 ring-blue-300' : 'text-slate-600'}
                                    ${!interactive && !isSelected ? 'border border-slate-200/50' : ''}
                                `}
                            >
                                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                                    {zone}
                                </span>
                                
                                {!interactive && zoneStats && zoneStats[zone]?.total > 0 && (
                                    <span className="text-[10px] text-slate-500 mt-1 font-mono">
                                        {zoneStats[zone].saves}/{zoneStats[zone].saves + zoneStats[zone].goals}
                                    </span>
                                )}
                                {!interactive && statText && (
                                    <span className={`text-sm font-bold mt-0.5 ${statBg.includes('red') ? 'text-red-700' : statBg.includes('green') ? 'text-green-700' : 'text-slate-800'}`}>
                                        {statText}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-blue-600">
                <Loader2 className="animate-spin mb-4" size={48} />
                <h2 className="text-xl font-bold">Loading NetMind...</h2>
                <p className="text-slate-500 text-sm mt-2">Syncing your season data</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-8">
            {/* Header */}
            <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="text-blue-400" size={28} />
                        <h1 className="text-xl font-bold tracking-tight">NetMind <span className="text-blue-400">Pro</span></h1>
                    </div>
                    
                    {/* Navigation Tabs */}
                    <div className="flex bg-slate-800 rounded-lg p-1 overflow-x-auto">
                        <button 
                            onClick={() => setActiveTab('season')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'season' ? 'bg-blue-500 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >
                            <FolderOpen size={16} /> <span className="hidden sm:inline">Season</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('log')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'log' ? 'bg-blue-500 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >
                            <Crosshair size={16} /> <span className="hidden sm:inline">Log Shot</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('analytics')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-blue-500 text-white shadow' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                        >
                            <BarChart3 size={16} /> <span className="hidden sm:inline">Dashboard</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto p-4 mt-4">
                
                {/* --- SEASON TAB --- */}
                {activeTab === 'season' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        
                        {/* Create Game Form */}
                        <div className="md:col-span-4 space-y-6">
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <PlusCircle className="text-blue-500" size={20} /> Create New Game
                                </h2>
                                <form onSubmit={createNewGame} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Opponent Name</label>
                                        <input 
                                            type="text" 
                                            value={newGameForm.opponent}
                                            onChange={e => setNewGameForm({...newGameForm, opponent: e.target.value})}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="e.g. Future Pro"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Game Date</label>
                                        <input 
                                            type="date" 
                                            value={newGameForm.date}
                                            onChange={e => setNewGameForm({...newGameForm, date: e.target.value})}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Game Type</label>
                                        <div className="flex bg-slate-100 p-1 rounded-lg">
                                            {['Exhibition', 'League', 'Tournament'].map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setNewGameForm({...newGameForm, gameType: type})}
                                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                                                        newGameForm.gameType === type 
                                                            ? 'bg-white text-slate-800 shadow-sm' 
                                                            : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-1">Location Type</label>
                                        <div className="flex bg-slate-100 p-1 rounded-lg">
                                            {['Home', 'Away', 'Neutral'].map(loc => (
                                                <button
                                                    key={loc}
                                                    type="button"
                                                    onClick={() => setNewGameForm({...newGameForm, locationType: loc})}
                                                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                                                        newGameForm.locationType === loc 
                                                            ? 'bg-white text-slate-800 shadow-sm' 
                                                            : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {loc}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button 
                                        type="submit"
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors"
                                    >
                                        Start Game
                                    </button>
                                </form>
                            </div>

                            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex flex-col justify-center items-center text-center space-y-3">
                                <Download className="text-blue-500" size={32} />
                                <div>
                                    <h3 className="font-bold text-blue-900">Export Season Data</h3>
                                    <p className="text-xs text-blue-700 mt-1 mb-3">Download all your logged shots across all games as a CSV file to analyze in Excel or Google Sheets.</p>
                                </div>
                                <button 
                                    onClick={exportToCSV}
                                    className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm w-full shadow-sm"
                                >
                                    Download CSV
                                </button>
                            </div>
                        </div>

                        {/* Game List */}
                        <div className="md:col-span-8">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-slate-800">Season History</h2>
                                    {games.length === 0 && (
                                        <button onClick={loadMockData} className="text-sm text-blue-600 font-semibold hover:underline">
                                            Load Sample Data
                                        </button>
                                    )}
                                </div>
                                
                                {games.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <Calendar className="mx-auto text-slate-300 mb-3" size={48} />
                                        <p className="text-slate-500 font-medium">No games logged yet this season.</p>
                                        <p className="text-sm text-slate-400 mt-1">Create a new game to get started.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {games.map(game => (
                                            <div key={game.id} className={`p-4 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${activeGameId === game.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className="font-bold text-slate-800 text-lg">{game.locationType === 'Away' ? '@' : 'vs.'} {game.opponent}</span>
                                                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wide">{game.locationType}</span>
                                                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wide">{game.gameType}</span>
                                                        {activeGameId === game.id && (
                                                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Active</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-slate-500">
                                                        <span className="flex items-center gap-1"><Calendar size={14} /> {game.date}</span>
                                                        <span className="flex items-center gap-1"><Crosshair size={14} /> {game.shots.length} Shots Logged</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 w-full sm:w-auto">
                                                    {activeGameId !== game.id && (
                                                        <button 
                                                            onClick={() => setActiveGameId(game.id)}
                                                            className="flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                                                        >
                                                            Set Active
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => {
                                                            setAnalyticsFilter(game.id);
                                                            setActiveTab('analytics');
                                                        }}
                                                        className="flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                                                    >
                                                        Analyze
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- LOG SHOT TAB --- */}
                {activeTab === 'log' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        
                        {!activeGame ? (
                            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
                                <FolderOpen className="mx-auto text-slate-300 mb-4" size={48} />
                                <h2 className="text-xl font-bold text-slate-800 mb-2">No Active Game Selected</h2>
                                <p className="text-slate-500 mb-6">Create a new game or select an existing one from the Season tab to start logging shots.</p>
                                <button 
                                    onClick={() => setActiveTab('season')}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                                >
                                    Go to Season Tab
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Active Game Header */}
                                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-500 text-white p-1.5 rounded-md"><Users size={18} /></div>
                                        <div>
                                            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-0.5">Logging Game</p>
                                            <p className="font-bold leading-none">{activeGame.locationType === 'Away' ? '@' : 'vs.'} {activeGame.opponent} <span className="font-normal text-sm opacity-80">({activeGame.date} • {activeGame.locationType} • {activeGame.gameType})</span></p>
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold bg-white px-3 py-1.5 rounded-lg shadow-sm text-blue-600 flex items-center gap-2 self-start sm:self-auto border border-blue-100">
                                        <Crosshair size={14} /> {activeShots.length} Shots
                                    </div>
                                </div>

                                {/* Main Rink View */}
                                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                    <div className="text-center mb-6">
                                        <h2 className="text-2xl font-bold text-slate-800">Log a New Shot</h2>
                                        <p className="text-slate-500 mt-1">Tap exactly where the shot was taken from on the ice.</p>
                                    </div>
                                    <div className="max-w-md mx-auto">
                                        <IceRink />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Shot Details Modal */}
                        {isModalOpen && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    
                                    {/* Modal Header */}
                                    <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <Crosshair className="text-blue-500" size={16} /> Complete Shot Details
                                        </h2>
                                        <button 
                                            onClick={closeModal}
                                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="p-3 overflow-y-auto flex-grow">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            
                                            {/* Left Column: Net Target */}
                                            <div>
                                                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 text-center sm:text-left">1. Net Target</h3>
                                                <div className="max-w-[220px] mx-auto sm:mx-0">
                                                    <NetSelector />
                                                </div>
                                            </div>

                                            {/* Right Column: Context Details */}
                                            <div className="space-y-3">
                                                
                                                {/* Period Selection */}
                                                <div>
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">2. Period</h3>
                                                    <div className="flex bg-slate-100 p-0.5 rounded-md">
                                                        {['1st', '2nd', '3rd', 'OT'].map(p => (
                                                            <button
                                                                key={p}
                                                                onClick={() => setCurrentShot(prev => ({ ...prev, period: p }))}
                                                                className={`flex-1 py-1 text-[11px] font-medium rounded transition-all ${
                                                                    currentShot.period === p 
                                                                        ? 'bg-white text-slate-800 shadow-sm' 
                                                                        : 'text-slate-500 hover:text-slate-700'
                                                                }`}
                                                            >
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Result Selection */}
                                                <div>
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">3. Result</h3>
                                                    <div className="grid grid-cols-3 gap-1.5">
                                                        {['Save', 'Goal', 'Miss'].map(res => (
                                                            <button
                                                                key={res}
                                                                onClick={() => setCurrentShot(prev => ({ ...prev, result: res }))}
                                                                className={`py-1.5 rounded-md font-bold text-xs border-2 transition-all ${
                                                                    currentShot.result === res 
                                                                        ? res === 'Save' ? 'bg-green-500 border-green-600 text-white shadow-sm transform scale-[1.02]' 
                                                                        : res === 'Goal' ? 'bg-red-500 border-red-600 text-white shadow-sm transform scale-[1.02]'
                                                                        : 'bg-slate-500 border-slate-600 text-white shadow-sm transform scale-[1.02]'
                                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                            >
                                                                {res}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Shot Type */}
                                                <div>
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">4. Shot Type</h3>
                                                    <div className="flex flex-wrap gap-1">
                                                        {['Wrist', 'Snap', 'Slap', 'Backhand', 'Deflection'].map(type => (
                                                            <button
                                                                key={type}
                                                                onClick={() => setCurrentShot(prev => ({ ...prev, type }))}
                                                                className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                                                                    currentShot.type === type 
                                                                        ? 'bg-blue-100 border-blue-400 text-blue-800' 
                                                                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                {type}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Game Situation */}
                                                <div>
                                                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">5. Situation</h3>
                                                    <div className="flex bg-slate-100 p-0.5 rounded-md">
                                                        {['Even Strength', 'Power Play', 'Penalty Kill'].map(sit => (
                                                            <button
                                                                key={sit}
                                                                onClick={() => setCurrentShot(prev => ({ ...prev, situation: sit }))}
                                                                className={`flex-1 py-1 text-[11px] font-medium rounded transition-all ${
                                                                    currentShot.situation === sit 
                                                                        ? 'bg-white text-slate-800 shadow-sm' 
                                                                        : 'text-slate-500 hover:text-slate-700'
                                                                }`}
                                                            >
                                                                {sit}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="p-3 border-t border-slate-100 bg-white shrink-0">
                                        <button 
                                            onClick={submitShot}
                                            disabled={!currentShot.netZone}
                                            className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold text-sm transition-all shadow-md ${
                                                currentShot.netZone 
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]' 
                                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                        >
                                            <PlusCircle size={16} /> {currentShot.netZone ? 'Log Play' : 'Select Net Target to Continue'}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- ANALYTICS TAB --- */}
                {activeTab === 'analytics' && (
                    <div className="space-y-6">
                        
                        {/* Analytics Filter Header */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <h2 className="font-bold text-slate-800 text-lg">Performance Dashboard</h2>
                                <p className="text-sm text-slate-500">Analyze shot tendencies and zone weaknesses.</p>
                            </div>
                            <select 
                                value={analyticsFilter}
                                onChange={(e) => setAnalyticsFilter(e.target.value)}
                                className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-300 text-slate-800 font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">Entire Season (All Games)</option>
                                {games.map(g => (
                                    <option key={g.id} value={g.id}>{g.date} vs. {g.opponent}</option>
                                ))}
                            </select>
                        </div>

                        {/* Top Stats Row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Save Percentage</p>
                                <p className="text-3xl font-black text-slate-800">{stats.svPct}<span className="text-lg text-slate-400">%</span></p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Shots on Goal</p>
                                <p className="text-3xl font-black text-slate-800">{stats.shotsOnGoal}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-green-100 rounded-bl-full -mr-8 -mt-8"></div>
                                <p className="text-green-700 text-xs font-bold uppercase tracking-wider mb-1">Total Saves</p>
                                <p className="text-3xl font-black text-green-700">{stats.saves}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-red-200/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-red-100 rounded-bl-full -mr-8 -mt-8"></div>
                                <p className="text-red-700 text-xs font-bold uppercase tracking-wider mb-1">Goals Allowed</p>
                                <p className="text-3xl font-black text-red-700">{stats.goals}</p>
                            </div>
                        </div>

                        {/* Visual Analysis Row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Shot Map Plotter */}
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <Map size={18} className="text-blue-500" /> Shot Map
                                    </h3>
                                    <div className="flex gap-3 text-xs font-medium">
                                        <span className="flex items-center gap-1 text-green-600"><div className="w-2 h-2 rounded-full bg-green-600" /> Saves</span>
                                        <span className="flex items-center gap-1 text-red-600"><div className="w-2 h-2 rounded-full bg-red-600" /> Goals</span>
                                    </div>
                                </div>
                                <div className="max-w-sm mx-auto">
                                    <IceRink interactive={false} plotShots={stats.analyzedShots} />
                                </div>
                            </div>

                            {/* Net Zone Analysis */}
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                    <Activity size={18} className="text-blue-500" /> Net Vulnerability
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">Percentage represents SV% in that specific zone.</p>
                                <div className="max-w-sm mx-auto">
                                    <NetSelector interactive={false} zoneStats={stats.zoneStats} />
                                </div>
                            </div>
                        </div>

                        {/* Shot Log Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                                <h3 className="font-bold text-slate-800">Game Event Log</h3>
                                <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
                                    {stats.analyzedShots.length} Events
                                </span>
                            </div>
                            
                            <div className="overflow-x-auto">
                                {stats.analyzedShots.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500">
                                        <p>No shots logged yet.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">Time</th>
                                                <th className="px-4 py-3 font-semibold">Period</th>
                                                <th className="px-4 py-3 font-semibold">Result</th>
                                                <th className="px-4 py-3 font-semibold">Type</th>
                                                <th className="px-4 py-3 font-semibold">Net Zone</th>
                                                <th className="px-4 py-3 font-semibold">Situation</th>
                                                <th className="px-4 py-3 font-semibold text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {stats.analyzedShots.map((shot) => (
                                                <tr key={shot.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{shot.timestamp}</td>
                                                    <td className="px-4 py-3 text-slate-600 font-medium text-xs">{shot.period}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                                            shot.result === 'Save' ? 'bg-green-100 text-green-700' : 
                                                            shot.result === 'Goal' ? 'bg-red-100 text-red-700' : 
                                                            'bg-slate-200 text-slate-700'
                                                        }`}>
                                                            {shot.result}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-700">{shot.type}</td>
                                                    <td className="px-4 py-3 text-slate-600">{shot.netZone || '-'}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">{shot.situation}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        {analyticsFilter !== 'all' && (
                                                            <button 
                                                                onClick={() => deleteShot(shot.id)}
                                                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                                title="Delete Event"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}
