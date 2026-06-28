import React, { useState, useEffect } from 'react';
import { Player, Drink, Fine, Transaction, ClubStats, Expense, Notification as AppNotification } from './types';
import { DEFAULT_DRINKS, DEFAULT_FINES, DEMO_PLAYERS, DEMO_EXPENSES } from './data/defaults';
import PlayerCard from './components/PlayerCard';
import { onSnapshot, collection } from 'firebase/firestore';
import { db, initAuth } from './firebase';
import { 
  isDatabaseEmpty, 
  seedDatabase,
  dbSavePlayer,
  dbDeletePlayer,
  dbSaveDrink,
  dbDeleteDrink,
  dbSaveFine,
  dbDeleteFine,
  dbSaveTransaction,
  dbDeleteTransaction,
  dbSaveExpense,
  dbDeleteExpense,
  dbSaveNotification,
  dbDeleteNotification
} from './lib/db';
import PlayerDetailModal from './components/PlayerDetailModal';
import CatalogManager from './components/CatalogManager';
import QuickBooking from './components/QuickBooking';
import TransactionHistory from './components/TransactionHistory';
import ExpenseModal from './components/ExpenseModal';
import PushSettingsModal from './components/PushSettingsModal';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Dribbble, 
  Coins, 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Beer, 
  AlertTriangle, 
  Users, 
  FileText, 
  ChevronRight, 
  Settings, 
  Info,
  Layers,
  X,
  Sparkles,
  Lock,
  Unlock,
  Bell,
  Volume2
} from 'lucide-react';

export default function App() {
  // --- STATE ---
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeNotificationToast, setActiveNotificationToast] = useState<AppNotification | null>(null);
  const [lastProcessedNotificationIds, setLastProcessedNotificationIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('bb_seen_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPushSettingsOpen, setIsPushSettingsOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isBookingAuthorized, setIsBookingAuthorized] = useState(false);
  const [bottomPinInput, setBottomPinInput] = useState('');
  const [bottomPinError, setBottomPinError] = useState('');
  
  // Pending Admin/Booking action state
  const [pendingAdminAction, setPendingAdminAction] = useState<{
    type: 'record_fine' | 'remove_fine' | 'bulk_fine' | 'add_player' | 'edit_player' | 'delete_player' | 'record_drink' | 'remove_drink' | 'record_payment' | 'revert_transaction' | 'bulk_drink' | 'open_catalog' | 'add_expense' | 'delete_expense';
    playerId?: string;
    fineId?: string;
    playerIds?: string[];
    itemId?: string;
  } | null>(null);
  const [adminPromptPin, setAdminPromptPin] = useState('');
  const [adminPromptError, setAdminPromptError] = useState('');
  
  // Navigation & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<'All' | 'Herren 1' | 'Herren 2'>('All');
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [isNewPlayerModalOpen, setIsNewPlayerModalOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerTeams, setNewPlayerTeams] = useState<('Herren 1' | 'Herren 2')[]>(['Herren 1']);

  // Backup / Import State
  const [importJson, setImportJson] = useState('');
  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // --- INITIALIZE FROM FIRESTORE OR DEFAULTS ---
  useEffect(() => {
    let unsubPlayers: () => void;
    let unsubDrinks: () => void;
    let unsubFines: () => void;
    let unsubTransactions: () => void;
    let unsubExpenses: () => void;
    let unsubNotifications: () => void;

    const setupSubscriptions = () => {
      unsubPlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
        const playersList: Player[] = [];
        snapshot.forEach((doc) => {
          playersList.push(doc.data() as Player);
        });
        setPlayers(playersList);
      }, (err) => {
        console.error("Failed to load players: ", err);
      });

      unsubDrinks = onSnapshot(collection(db, 'drinks'), (snapshot) => {
        const drinksList: Drink[] = [];
        snapshot.forEach((doc) => {
          drinksList.push(doc.data() as Drink);
        });
        setDrinks(drinksList);
      }, (err) => {
        console.error("Failed to load drinks: ", err);
      });

      unsubFines = onSnapshot(collection(db, 'fines'), (snapshot) => {
        const finesList: Fine[] = [];
        snapshot.forEach((doc) => {
          finesList.push(doc.data() as Fine);
        });
        setFines(finesList);
      }, (err) => {
        console.error("Failed to load fines: ", err);
      });

      unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
        const txList: Transaction[] = [];
        snapshot.forEach((doc) => {
          txList.push(doc.data() as Transaction);
        });
        txList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(txList);
      }, (err) => {
        console.error("Failed to load transactions: ", err);
      });

      unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
        const expensesList: Expense[] = [];
        snapshot.forEach((doc) => {
          expensesList.push(doc.data() as Expense);
        });
        expensesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setExpenses(expensesList);
      }, (err) => {
        console.error("Failed to load expenses: ", err);
      });

      let isInitialNotifBatch = true;
      unsubNotifications = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const notifList: AppNotification[] = [];
        snapshot.forEach((doc) => {
          notifList.push(doc.data() as AppNotification);
        });
        setNotifications(notifList);

        if (isInitialNotifBatch) {
          isInitialNotifBatch = false;
          // Pre-populate seen notification IDs so they aren't triggered
          const initialIds = notifList.filter(n => n.sent).map(n => n.id);
          setLastProcessedNotificationIds((prev) => {
            const merged = Array.from(new Set([...prev, ...initialIds]));
            localStorage.setItem('bb_seen_notifications', JSON.stringify(merged));
            return merged;
          });
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const notif = change.doc.data() as AppNotification;
            if (notif.sent && notif.sentAt) {
              setLastProcessedNotificationIds((prev) => {
                if (!prev.includes(notif.id)) {
                  setActiveNotificationToast(notif);

                  try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass) {
                      const audioCtx = new AudioContextClass();
                      const playNote = (freq: number, delay: number, duration: number) => {
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
                        gain.gain.setValueAtTime(0.1, audioCtx.currentTime + delay);
                        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start(audioCtx.currentTime + delay);
                        osc.stop(audioCtx.currentTime + delay + duration);
                      };
                      playNote(523.25, 0, 0.25); // C5
                      playNote(659.25, 0.12, 0.35); // E5
                    }
                  } catch (soundErr) {
                    console.warn("Audio chime failed to play:", soundErr);
                  }

                  const updated = [...prev, notif.id];
                  localStorage.setItem('bb_seen_notifications', JSON.stringify(updated));
                  return updated;
                }
                return prev;
              });
            }
          }
        });
      }, (err) => {
        console.error("Failed to load notifications: ", err);
      });
    };

    const initFirebaseApp = async () => {
      setIsFirebaseLoading(true);
      try {
        await initAuth();
        const empty = await isDatabaseEmpty();
        if (empty) {
          const initialPlayers = DEMO_PLAYERS;
          const initialDrinks = DEFAULT_DRINKS;
          const initialFines = DEFAULT_FINES;
          const initialExpenses = DEMO_EXPENSES;
          
          // Generate consistent initial transaction logs for demo players
          const initialTransactions: Transaction[] = [];
          const baseTime = Date.now();

          initialPlayers.forEach((player, pIdx) => {
            let orderOffset = 0;

            // Generate Drink consumption transactions
            Object.entries(player.drinksCount).forEach(([drinkId, qty]) => {
              const drink = initialDrinks.find(d => d.id === drinkId);
              if (drink) {
                initialTransactions.push({
                  id: `tx-init-drink-${player.id}-${drinkId}`,
                  playerId: player.id,
                  playerName: player.name,
                  type: 'drink',
                  itemId: drinkId,
                  itemName: drink.name,
                  amount: drink.price,
                  quantity: qty,
                  timestamp: new Date(baseTime - (pIdx * 3600000 + orderOffset * 600000)).toISOString()
                });
                orderOffset++;
              }
            });

            // Generate Fines transactions
            Object.entries(player.finesCount).forEach(([fineId, qty]) => {
              const fine = initialFines.find(f => f.id === fineId);
              if (fine) {
                initialTransactions.push({
                  id: `tx-init-fine-${player.id}-${fineId}`,
                  playerId: player.id,
                  playerName: player.name,
                  type: 'fine',
                  itemId: fineId,
                  itemName: fine.name,
                  amount: fine.amount,
                  quantity: qty,
                  timestamp: new Date(baseTime - (pIdx * 3600000 + orderOffset * 600000)).toISOString()
                });
                orderOffset++;
              }
            });

            // Generate Settle/Payment transaction
            if (player.totalPaid > 0) {
              initialTransactions.push({
                id: `tx-init-pay-${player.id}`,
                playerId: player.id,
                playerName: player.name,
                type: 'payment',
                itemName: 'Abrechnung Teilzahlung',
                amount: player.totalPaid,
                quantity: 1,
                timestamp: new Date(baseTime - (pIdx * 3600000)).toISOString()
              });
            }
          });

          await seedDatabase(initialPlayers, initialDrinks, initialFines, initialTransactions, initialExpenses);
        }
        setupSubscriptions();
      } catch (err) {
        console.error("Firebase init failed, falling back to subscription setup / local defaults:", err);
        try {
          setupSubscriptions();
        } catch (subErr) {
          console.error("Subscriptions also failed:", subErr);
          setPlayers(DEMO_PLAYERS);
          setDrinks(DEFAULT_DRINKS);
          setFines(DEFAULT_FINES);
          setExpenses(DEMO_EXPENSES);
        }
      } finally {
        setIsFirebaseLoading(false);
      }
    };

    initFirebaseApp();

    return () => {
      if (unsubPlayers) unsubPlayers();
      if (unsubDrinks) unsubDrinks();
      if (unsubFines) unsubFines();
      if (unsubTransactions) unsubTransactions();
      if (unsubExpenses) unsubExpenses();
      if (unsubNotifications) unsubNotifications();
    };
  }, []);

  // --- SERVICE WORKER REGISTRATION ---
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('Service Worker registration failed:', err);
        });
    }
  }, []);



  // Auto-dismiss active notification toast after 8 seconds
  useEffect(() => {
    if (activeNotificationToast) {
      const timer = setTimeout(() => {
        setActiveNotificationToast(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [activeNotificationToast]);

  // Sync to Firestore on changes
  const saveState = (
    updatedPlayers: Player[], 
    updatedDrinks: Drink[], 
    updatedFines: Fine[], 
    updatedTransactions: Transaction[]
  ) => {
    // 1. Sync Players
    updatedPlayers.forEach(player => {
      const existingPlayer = players.find(p => p.id === player.id);
      if (!existingPlayer || JSON.stringify(existingPlayer) !== JSON.stringify(player)) {
        dbSavePlayer(player);
      }
    });
    players.forEach(player => {
      if (!updatedPlayers.some(p => p.id === player.id)) {
        dbDeletePlayer(player.id);
      }
    });

    // 2. Sync Drinks
    updatedDrinks.forEach(drink => {
      const existingDrink = drinks.find(d => d.id === drink.id);
      if (!existingDrink || JSON.stringify(existingDrink) !== JSON.stringify(drink)) {
        dbSaveDrink(drink);
      }
    });
    drinks.forEach(drink => {
      if (!updatedDrinks.some(d => d.id === drink.id)) {
        dbDeleteDrink(drink.id);
      }
    });

    // 3. Sync Fines
    updatedFines.forEach(fine => {
      const existingFine = fines.find(f => f.id === fine.id);
      if (!existingFine || JSON.stringify(existingFine) !== JSON.stringify(fine)) {
        dbSaveFine(fine);
      }
    });
    fines.forEach(fine => {
      if (!updatedFines.some(f => f.id === fine.id)) {
        dbDeleteFine(fine.id);
      }
    });

    // 4. Sync Transactions
    updatedTransactions.forEach(tx => {
      const existingTx = transactions.find(t => t.id === tx.id);
      if (!existingTx || JSON.stringify(existingTx) !== JSON.stringify(tx)) {
        dbSaveTransaction(tx);
      }
    });
    transactions.forEach(tx => {
      if (!updatedTransactions.some(t => t.id === tx.id)) {
        dbDeleteTransaction(tx.id);
      }
    });

    // Optimistically set local state
    setPlayers(updatedPlayers);
    setDrinks(updatedDrinks);
    setFines(updatedFines);
    setTransactions(updatedTransactions);
  };

  // Save expenses to Firestore
  const saveExpenses = (updatedExpenses: Expense[]) => {
    updatedExpenses.forEach(exp => {
      const existingExp = expenses.find(e => e.id === exp.id);
      if (!existingExp || JSON.stringify(existingExp) !== JSON.stringify(exp)) {
        dbSaveExpense(exp);
      }
    });
    expenses.forEach(exp => {
      if (!updatedExpenses.some(e => e.id === exp.id)) {
        dbDeleteExpense(exp.id);
      }
    });

    // Optimistically set local state
    setExpenses(updatedExpenses);
  };

  // Add a new expense
  const handleAddExpense = (expenseData: Omit<Expense, 'id'>) => {
    if (isAdminMode) {
      const newExpense: Expense = {
        ...expenseData,
        id: 'e_' + Date.now()
      };
      saveExpenses([newExpense, ...expenses]);
    } else {
      setPendingAdminAction({ 
        type: 'add_expense', 
        itemId: JSON.stringify(expenseData) 
      });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Delete an expense
  const handleDeleteExpense = (id: string) => {
    if (isAdminMode) {
      const updatedExpenses = expenses.filter(e => e.id !== id);
      saveExpenses(updatedExpenses);
    } else {
      setPendingAdminAction({ 
        type: 'delete_expense', 
        itemId: id 
      });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // --- ACTIONS ---

  // Add a new Player
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminMode) return;
    if (!newPlayerName.trim()) return;

    const newPlayer: Player = {
      id: 'p_' + Date.now(),
      name: newPlayerName.trim(),
      number: newPlayerNumber.trim() || undefined,
      drinksCount: {},
      finesCount: {},
      totalPaid: 0,
      team: newPlayerTeams[0] || 'Herren 1',
      teams: newPlayerTeams,
    };

    const updatedPlayers = [...players, newPlayer];
    saveState(updatedPlayers, drinks, fines, transactions);
    
    setNewPlayerName('');
    setNewPlayerNumber('');
    setNewPlayerTeams(['Herren 1']);
    setIsNewPlayerModalOpen(false);
  };

  // Quick record drink from PlayerCard
  const executeRecordDrink = (playerId: string, drinkId: string) => {
    const drink = drinks.find(d => d.id === drinkId);
    if (!drink) return;

    const updatedPlayers = players.map(player => {
      if (player.id === playerId) {
        const currentQty = player.drinksCount[drinkId] || 0;
        return {
          ...player,
          drinksCount: {
            ...player.drinksCount,
            [drinkId]: currentQty + 1
          }
        };
      }
      return player;
    });

    const player = players.find(p => p.id === playerId);
    const newTx: Transaction = {
      id: 'tx_' + Date.now() + Math.random().toString(36).substring(2, 5),
      playerId,
      playerName: player?.name || 'Unbekannter Spieler',
      type: 'drink',
      itemId: drinkId,
      itemName: drink.name,
      amount: drink.price,
      quantity: 1,
      timestamp: new Date().toISOString()
    };

    saveState(updatedPlayers, drinks, fines, [newTx, ...transactions]);

    // Keep selected player synced in modal if open
    if (selectedPlayer && selectedPlayer.id === playerId) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === playerId) || null);
    }
  };

  const handleRecordDrink = (playerId: string, drinkId: string) => {
    if (isAdminMode || isBookingAuthorized) {
      executeRecordDrink(playerId, drinkId);
    } else {
      setPendingAdminAction({ type: 'record_drink', playerId, itemId: drinkId });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Remove drink booking (decrement counter + add offset tx or modify log)
  const executeRemoveDrink = (playerId: string, drinkId: string) => {
    const drink = drinks.find(d => d.id === drinkId);
    if (!drink) return;

    let removed = false;
    const updatedPlayers = players.map(player => {
      if (player.id === playerId) {
        const currentQty = player.drinksCount[drinkId] || 0;
        if (currentQty > 0) {
          removed = true;
          const newQty = currentQty - 1;
          const newDrinksCount = { ...player.drinksCount };
          if (newQty === 0) {
            delete newDrinksCount[drinkId];
          } else {
            newDrinksCount[drinkId] = newQty;
          }
          return { ...player, drinksCount: newDrinksCount };
        }
      }
      return player;
    });

    if (!removed) return;

    // To preserve ledger history without polluting with negative logs, 
    // we find and remove the most recent drink transaction for this player and drink
    const txIndex = transactions.findIndex(t => t.playerId === playerId && t.itemId === drinkId && t.type === 'drink');
    let updatedTx = [...transactions];
    if (txIndex !== -1) {
      updatedTx.splice(txIndex, 1);
    } else {
      // Fallback: log a reverse transaction
      updatedTx.unshift({
        id: 'tx_rev_' + Date.now(),
        playerId,
        playerName: players.find(p => p.id === playerId)?.name || '',
        type: 'drink',
        itemId: drinkId,
        itemName: `${drink.name} (Korrektur)`,
        amount: -drink.price,
        quantity: 1,
        timestamp: new Date().toISOString()
      });
    }

    saveState(updatedPlayers, drinks, fines, updatedTx);

    // Keep selected player synced
    if (selectedPlayer && selectedPlayer.id === playerId) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === playerId) || null);
    }
  };

  const handleRemoveDrink = (playerId: string, drinkId: string) => {
    if (isAdminMode || isBookingAuthorized) {
      executeRemoveDrink(playerId, drinkId);
    } else {
      setPendingAdminAction({ type: 'remove_drink', playerId, itemId: drinkId });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Execute actual fine recording
  const executeRecordFine = (playerId: string, fineId: string) => {
    const fine = fines.find(f => f.id === fineId);
    if (!fine) return;

    const updatedPlayers = players.map(player => {
      if (player.id === playerId) {
        const currentQty = player.finesCount[fineId] || 0;
        return {
          ...player,
          finesCount: {
            ...player.finesCount,
            [fineId]: currentQty + 1
          }
        };
      }
      return player;
    });

    const player = players.find(p => p.id === playerId);
    const newTx: Transaction = {
      id: 'tx_' + Date.now() + Math.random().toString(36).substring(2, 5),
      playerId,
      playerName: player?.name || 'Unbekannter Spieler',
      type: 'fine',
      itemId: fineId,
      itemName: fine.name,
      amount: fine.amount,
      quantity: 1,
      timestamp: new Date().toISOString()
    };

    saveState(updatedPlayers, drinks, fines, [newTx, ...transactions]);

    // Sync modal
    if (selectedPlayer && selectedPlayer.id === playerId) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === playerId) || null);
    }
  };

  // Quick record fine (handles authorization check)
  const handleRecordFine = (playerId: string, fineId: string) => {
    if (isAdminMode || isBookingAuthorized) {
      executeRecordFine(playerId, fineId);
    } else {
      setPendingAdminAction({ type: 'record_fine', playerId, fineId });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Execute actual fine removal
  const executeRemoveFine = (playerId: string, fineId: string) => {
    const fine = fines.find(f => f.id === fineId);
    if (!fine) return;

    let removed = false;
    const updatedPlayers = players.map(player => {
      if (player.id === playerId) {
        const currentQty = player.finesCount[fineId] || 0;
        if (currentQty > 0) {
          removed = true;
          const newQty = currentQty - 1;
          const newFinesCount = { ...player.finesCount };
          if (newQty === 0) {
            delete newFinesCount[fineId];
          } else {
            newFinesCount[fineId] = newQty;
          }
          return { ...player, finesCount: newFinesCount };
        }
      }
      return player;
    });

    if (!removed) return;

    const txIndex = transactions.findIndex(t => t.playerId === playerId && t.itemId === fineId && t.type === 'fine');
    let updatedTx = [...transactions];
    if (txIndex !== -1) {
      updatedTx.splice(txIndex, 1);
    } else {
      updatedTx.unshift({
        id: 'tx_rev_fine_' + Date.now(),
        playerId,
        playerName: players.find(p => p.id === playerId)?.name || '',
        type: 'fine',
        itemId: fineId,
        itemName: `${fine.name} (Korrektur)`,
        amount: -fine.amount,
        quantity: 1,
        timestamp: new Date().toISOString()
      });
    }

    saveState(updatedPlayers, drinks, fines, updatedTx);

    // Sync modal
    if (selectedPlayer && selectedPlayer.id === playerId) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === playerId) || null);
    }
  };

  // Decrement fine booking (handles authorization check)
  const handleRemoveFine = (playerId: string, fineId: string) => {
    if (isAdminMode || isBookingAuthorized) {
      executeRemoveFine(playerId, fineId);
    } else {
      setPendingAdminAction({ type: 'remove_fine', playerId, fineId });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Add partial or full payment (actual execution)
  const executeRecordPayment = (playerId: string, amount: number) => {
    const updatedPlayers = players.map(player => {
      if (player.id === playerId) {
        return {
          ...player,
          totalPaid: player.totalPaid + amount
        };
      }
      return player;
    });

    const player = players.find(p => p.id === playerId);
    const newTx: Transaction = {
      id: 'tx_pay_' + Date.now(),
      playerId,
      playerName: player?.name || 'Unbekannter Spieler',
      type: 'payment',
      itemName: 'Einzahlung / Kontostand ausgeglichen',
      amount: amount,
      quantity: 1,
      timestamp: new Date().toISOString()
    };

    saveState(updatedPlayers, drinks, fines, [newTx, ...transactions]);

    // Sync modal
    if (selectedPlayer && selectedPlayer.id === playerId) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === playerId) || null);
    }
  };

  const handleRecordPayment = (playerId: string, amount: number) => {
    if (isAdminMode || isBookingAuthorized) {
      executeRecordPayment(playerId, amount);
    } else {
      setPendingAdminAction({ type: 'record_payment', playerId, itemId: amount.toString() });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Edit player name/number/teams (actual execution)
  const executeUpdatePlayer = (id: string, name: string, number?: string, teams?: ('Herren 1' | 'Herren 2')[]) => {
    const updatedPlayers = players.map(p => (p.id === id ? { 
      ...p, 
      name, 
      number, 
      team: teams && teams.length > 0 ? teams[0] : p.team,
      teams 
    } : p));
    
    // Also update transaction logs for historical names
    const updatedTx = transactions.map(t => t.playerId === id ? { ...t, playerName: name } : t);
 
    saveState(updatedPlayers, drinks, fines, updatedTx);
 
    if (selectedPlayer && selectedPlayer.id === id) {
      setSelectedPlayer({ 
        ...selectedPlayer, 
        name, 
        number, 
        team: teams && teams.length > 0 ? teams[0] : selectedPlayer.team,
        teams 
      });
    }
  };

  const handleUpdatePlayer = (id: string, name: string, number?: string, teams?: ('Herren 1' | 'Herren 2')[]) => {
    if (isAdminMode) {
      executeUpdatePlayer(id, name, number, teams);
    } else {
      setPendingAdminAction({ 
        type: 'edit_player', 
        playerId: id, 
        itemId: JSON.stringify({ name, number, teams }) 
      });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Delete Player entirely (actual execution)
  const executeDeletePlayer = (id: string) => {
    const updatedPlayers = players.filter(p => p.id !== id);
    const updatedTx = transactions.filter(t => t.playerId !== id);
    saveState(updatedPlayers, drinks, fines, updatedTx);
    setSelectedPlayer(null);
  };

  const handleDeletePlayer = (id: string) => {
    if (isAdminMode) {
      executeDeletePlayer(id);
    } else {
      setPendingAdminAction({ type: 'delete_player', playerId: id });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Execute actual bulk booking
  const executeBulkBook = (playerIds: string[], type: 'drink' | 'fine', itemId: string) => {
    const item = type === 'drink' ? drinks.find(d => d.id === itemId) : fines.find(f => f.id === itemId);
    if (!item) return;

    const newTransactions: Transaction[] = [];
    const timestamp = new Date().toISOString();

    const updatedPlayers = players.map(player => {
      if (playerIds.includes(player.id)) {
        if (type === 'drink') {
          const currentQty = player.drinksCount[itemId] || 0;
          newTransactions.push({
            id: `tx_bulk_d_${Date.now()}_${player.id}`,
            playerId: player.id,
            playerName: player.name,
            type: 'drink',
            itemId,
            itemName: item.name,
            amount: item.price,
            quantity: 1,
            timestamp
          });
          return {
            ...player,
            drinksCount: { ...player.drinksCount, [itemId]: currentQty + 1 }
          };
        } else {
          const currentQty = player.finesCount[itemId] || 0;
          newTransactions.push({
            id: `tx_bulk_f_${Date.now()}_${player.id}`,
            playerId: player.id,
            playerName: player.name,
            type: 'fine',
            itemId,
            itemName: item.name,
            amount: (item as Fine).amount,
            quantity: 1,
            timestamp
          });
          return {
            ...player,
            finesCount: { ...player.finesCount, [itemId]: currentQty + 1 }
          };
        }
      }
      return player;
    });

    saveState(updatedPlayers, drinks, fines, [...newTransactions, ...transactions]);

    // Keep selected player synced if in bulk list
    if (selectedPlayer && playerIds.includes(selectedPlayer.id)) {
      setSelectedPlayer(updatedPlayers.find(p => p.id === selectedPlayer.id) || null);
    }
  };

  // Bulk booking
  const handleBulkBook = (playerIds: string[], type: 'drink' | 'fine', itemId: string) => {
    if (isAdminMode || isBookingAuthorized) {
      executeBulkBook(playerIds, type, itemId);
    } else {
      setPendingAdminAction({ 
        type: type === 'drink' ? 'bulk_drink' : 'bulk_fine', 
        playerIds, 
        itemId 
      });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  const handleAdminPromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = adminPromptPin;
    const isPendingAdmin = pendingAdminAction && ['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction'].includes(pendingAdminAction.type);
    
    let authorized = false;

    if (pin === '2016') {
      setIsAdminMode(true);
      setIsBookingAuthorized(true);
      authorized = true;
    } else if (pin === 'Unter100') {
      if (!isPendingAdmin) {
        setIsBookingAuthorized(true);
        authorized = true;
      }
    }

    if (authorized) {
      // Execute the pending action
      if (pendingAdminAction) {
        const { type, playerId, fineId, playerIds, itemId } = pendingAdminAction;
        if (type === 'record_fine' && playerId && fineId) {
          executeRecordFine(playerId, fineId);
        } else if (type === 'remove_fine' && playerId && fineId) {
          executeRemoveFine(playerId, fineId);
        } else if (type === 'bulk_fine' && playerIds && itemId) {
          executeBulkBook(playerIds, 'fine', itemId);
        } else if (type === 'bulk_drink' && playerIds && itemId) {
          executeBulkBook(playerIds, 'drink', itemId);
        } else if (type === 'record_drink' && playerId && itemId) {
          executeRecordDrink(playerId, itemId);
        } else if (type === 'remove_drink' && playerId && itemId) {
          executeRemoveDrink(playerId, itemId);
        } else if (type === 'record_payment' && playerId && itemId) {
          executeRecordPayment(playerId, parseFloat(itemId));
        } else if (type === 'revert_transaction' && itemId) {
          executeRevertTransaction(itemId);
        } else if (type === 'add_player') {
          setIsNewPlayerModalOpen(true);
        } else if (type === 'edit_player' && playerId && itemId) {
          try {
            const data = JSON.parse(itemId);
            executeUpdatePlayer(playerId, data.name, data.number, data.teams);
          } catch (e) {
            console.error(e);
          }
        } else if (type === 'delete_player' && playerId) {
          executeDeletePlayer(playerId);
          setSelectedPlayer(null);
        } else if (type === 'open_catalog') {
          setIsCatalogOpen(true);
        } else if (type === 'add_expense' && itemId) {
          try {
            const expenseData = JSON.parse(itemId);
            const newExpense: Expense = {
              ...expenseData,
              id: 'e_' + Date.now()
            };
            saveExpenses([newExpense, ...expenses]);
          } catch (e) {
            console.error(e);
          }
        } else if (type === 'delete_expense' && itemId) {
          const updatedExpenses = expenses.filter(e => e.id !== itemId);
          saveExpenses(updatedExpenses);
        }
      }
      
      setPendingAdminAction(null);
      setAdminPromptPin('');
      setAdminPromptError('');
    } else {
      setAdminPromptError(isPendingAdmin ? 'Falscher Admin-PIN!' : 'Falscher PIN oder Passwort!');
    }
  };

  // Revert/Storno a single transaction by ID (actual execution)
  const executeRevertTransaction = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    const updatedPlayers = players.map(player => {
      if (player.id === tx.playerId) {
        if (tx.type === 'drink' && tx.itemId) {
          const currentQty = player.drinksCount[tx.itemId] || 0;
          const newDrinksCount = { ...player.drinksCount };
          if (currentQty > tx.quantity) {
            newDrinksCount[tx.itemId] = currentQty - tx.quantity;
          } else {
            delete newDrinksCount[tx.itemId];
          }
          return { ...player, drinksCount: newDrinksCount };
        } else if (tx.type === 'fine' && tx.itemId) {
          const currentQty = player.finesCount[tx.itemId] || 0;
          const newFinesCount = { ...player.finesCount };
          if (currentQty > tx.quantity) {
            newFinesCount[tx.itemId] = currentQty - tx.quantity;
          } else {
            delete newFinesCount[tx.itemId];
          }
          return { ...player, finesCount: newFinesCount };
        } else if (tx.type === 'payment') {
          return { ...player, totalPaid: Math.max(0, player.totalPaid - tx.amount) };
        }
      }
      return player;
    });

    const updatedTx = transactions.filter(t => t.id !== txId);
    saveState(updatedPlayers, drinks, fines, updatedTx);
  };

  const handleRevertTransaction = (txId: string) => {
    if (isAdminMode) {
      executeRevertTransaction(txId);
    } else {
      setPendingAdminAction({ type: 'revert_transaction', itemId: txId });
      setAdminPromptPin('');
      setAdminPromptError('');
    }
  };

  // Update overall drink list from settings
  const handleUpdateDrinks = (updatedDrinks: Drink[]) => {
    saveState(players, updatedDrinks, fines, transactions);
  };

  // Update overall fine list from settings
  const handleUpdateFines = (updatedFines: Fine[]) => {
    saveState(players, drinks, updatedFines, transactions);
  };

  // Reset entire catalog to default values
  const handleResetCatalogToDefaults = () => {
    saveState(players, DEFAULT_DRINKS, DEFAULT_FINES, transactions);
  };

  const handleAddNotification = async (notif: AppNotification) => {
    await dbSaveNotification(notif);
  };

  const handleDeleteNotification = async (notifId: string) => {
    await dbDeleteNotification(notifId);
  };

  // Calculate individual player balance
  const getPlayerBalance = (player: Player) => {
    const totalDrinksCost = Object.entries(player.drinksCount).reduce((acc, [drinkId, qty]) => {
      const drink = drinks.find((d) => d.id === drinkId);
      return acc + (drink ? drink.price * qty : 0);
    }, 0);

    const totalFinesCost = Object.entries(player.finesCount).reduce((acc, [fineId, qty]) => {
      const fine = fines.find((f) => f.id === fineId);
      return acc + (fine ? fine.amount * qty : 0);
    }, 0);

    return totalDrinksCost + totalFinesCost - player.totalPaid;
  };

  // --- STATS CALCULATION ---
  const calculateStats = (): ClubStats => {
    let totalRevenue = 0;
    let totalDrinksServed = 0;
    let totalFinesCount = 0;

    players.forEach(p => {
      // Drink sum
      Object.entries(p.drinksCount).forEach(([drinkId, qty]) => {
        const drink = drinks.find(d => d.id === drinkId);
        if (drink) {
          const quantity = Number(qty);
          totalRevenue += drink.price * quantity;
          totalDrinksServed += quantity;
        }
      });

      // Fines sum
      Object.entries(p.finesCount).forEach(([fineId, qty]) => {
        const fine = fines.find(f => f.id === fineId);
        if (fine) {
          const quantity = Number(qty);
          totalRevenue += fine.amount * quantity;
          totalFinesCount += quantity;
        }
      });
    });

    const totalPaid = players.reduce((sum, p) => sum + p.totalPaid, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // Sum only positive balances to calculate outstanding debts (not offset by prepayments)
    const totalOutstanding = players.reduce((sum, p) => {
      const bal = getPlayerBalance(p);
      return sum + (bal > 0 ? bal : 0);
    }, 0);

    return {
      totalRevenue,
      totalPaid,
      totalExpenses,
      totalOutstanding,
      drinksServed: totalDrinksServed,
      finesIssuedCount: totalFinesCount,
    };
  };

  const stats = calculateStats();

  // --- EXPORT / IMPORT LOGIC ---
  const handleExportData = () => {
    const exportObj = {
      players,
      drinks,
      fines,
      transactions,
      expenses,
      exportedAt: new Date().toISOString(),
      app: "Basketball-Mannschaftskasse"
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `basketball_kasse_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportData = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(importJson);
      if (!parsed.players || !parsed.drinks || !parsed.fines || !parsed.transactions) {
        setBackupMessage({ text: 'Ungültiges JSON-Format! Erforderliche Felder fehlen.', isError: true });
        return;
      }

      saveState(parsed.players, parsed.drinks, parsed.fines, parsed.transactions);
      if (parsed.expenses) {
        saveExpenses(parsed.expenses);
      } else {
        saveExpenses([]);
      }
      setBackupMessage({ text: 'Backup erfolgreich eingelesen und angewendet!', isError: false });
      setImportJson('');
      setTimeout(() => setBackupMessage(null), 4000);
    } catch (err) {
      setBackupMessage({ text: 'Fehler beim Parsen der JSON-Datei! Bitte Code überprüfen.', isError: true });
    }
  };

  // Filter players based on search query and selected team
  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          player.number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTeam = selectedTeam === 'All' || 
                        (player.teams ? player.teams.includes(selectedTeam) : (player.team || 'Herren 1') === selectedTeam);
    
    return matchesSearch && matchesTeam;
  });

  // Conditionally restrict to red balance (>= 17 €) and max 4 if showAllPlayers is false
  const displayedPlayers = showAllPlayers 
    ? filteredPlayers 
    : filteredPlayers.filter(player => getPlayerBalance(player) >= 17).slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 font-sans antialiased selection:bg-orange-500/10 selection:text-orange-900">
      
      {isFirebaseLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-50/95 backdrop-blur-xs animate-fade-in">
          <div className="w-16 h-16 bg-gradient-to-br from-[#FF6B00] to-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/15 animate-bounce mb-4">
            <Dribbble className="w-10 h-10 animate-spin-slow text-white" />
          </div>
          <p className="text-sm font-semibold text-slate-700 animate-pulse">Lade Mannschaftskasse...</p>
        </div>
      )}
      
      {/* HEADER BANNER */}
      <header className="relative bg-white border-b border-slate-200 px-4 py-6 md:py-8 overflow-hidden shadow-xs">
        
        {/* Basketball lines abstract decoration */}
        <div className="absolute right-[-100px] top-[-50px] w-80 h-80 rounded-full border-[3px] border-slate-100 pointer-events-none" />
        <div className="absolute right-[-20px] top-[100px] w-48 h-48 rounded-full border-2 border-slate-100 pointer-events-none" />

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 bg-gradient-to-br from-[#FF6B00] to-amber-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/15 shrink-0 transform -rotate-3 hover:rotate-3 transition duration-300">
              <Dribbble className="w-8 h-8 animate-spin-slow text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-orange-50 text-[#FF6B00] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider border border-orange-200">
                  Mannschafts-Kasse
                </span>
                <span className="text-xs text-slate-400">• BFC Freiburg</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
                BFC Freiburg Mannschaftskasse
              </h1>
            </div>
          </div>

          {/* Actions & Utilities in Header */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowBackupPanel(!showBackupPanel)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              id="backup-panel-toggle-btn"
            >
              <Layers className="w-4 h-4 text-[#FF6B00]" />
              Backup / Export
            </button>
            <button
              onClick={() => setIsCatalogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              id="catalog-manager-toggle-btn"
            >
              <Settings className="w-4 h-4 text-[#FF6B00]" />
              Tarife & Strafen
            </button>
            <button
              onClick={() => setIsPushSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs relative"
              id="push-settings-toggle-btn"
            >
              <Bell className="w-4 h-4 text-[#FF6B00]" />
              <span>Push-Mitteilungen</span>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF6B00]"></span>
              </span>
            </button>
            {isBookingAuthorized || isAdminMode ? (
              <button
                onClick={() => {
                  setIsBookingAuthorized(false);
                  setIsAdminMode(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-lock-btn"
                title="Buchungen wieder sperren"
              >
                <Unlock className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Freigegeben</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setPendingAdminAction({ type: 'open_catalog' });
                  setAdminPromptPin('');
                  setAdminPromptError('');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-unlock-btn"
                title="PIN / Passwort eingeben"
              >
                <Lock className="w-4 h-4 text-rose-600" />
                <span>Gesperrt</span>
              </button>
            )}
            <button
              onClick={() => {
                if (isAdminMode) {
                  setIsNewPlayerModalOpen(true);
                } else {
                  setPendingAdminAction({ type: 'add_player' });
                  setAdminPromptPin('');
                  setAdminPromptError('');
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B00] hover:bg-orange-500 text-white hover:scale-[1.02] font-black rounded-xl text-xs transition transform active:scale-95 cursor-pointer shadow-xs"
              id="add-player-btn"
            >
              <Plus className="w-4 h-4" />
              Spieler hinzufügen
            </button>
          </div>
        </div>
      </header>

      {/* BACKUP & RESTORE DRAWER / COLLAPSIBLE */}
      {showBackupPanel && (
        <div className="bg-slate-100/80 border-b border-slate-200 p-4 animate-fade-in" id="backup-drawer-panel">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
            {/* Export */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-[#FF6B00]" />
                Backup exportieren
              </h3>
              <p className="text-xs text-slate-500">
                Lade den gesamten Buchungsstand des Vereins als handliche <code className="text-[#FF6B00] font-mono">.json</code> Datei herunter. Du kannst diese Datei später wieder einlesen oder auf ein anderes Smartphone übertragen.
              </p>
              <button
                onClick={handleExportData}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Backup herunterladen (JSON)
              </button>
            </div>

            {/* Import */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                Backup einlesen
              </h3>
              <p className="text-xs text-slate-500">
                Füge den Inhalt deiner exportierten Backup-Datei (JSON) in das Textfeld unten ein, um den Datenstand wiederherzustellen.
              </p>

              {backupMessage && (
                <div className={`p-2.5 rounded-lg text-xs border ${backupMessage.isError ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  {backupMessage.text}
                </div>
              )}

              <form onSubmit={handleImportData} className="flex gap-2">
                <input
                  type="text"
                  placeholder='Füge den JSON-Inhalt ein... {"players": [...'
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-emerald-500 shadow-2xs"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Einlesen
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-8">

        {/* 1. STATISTICAL BENTO TILES */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3" id="statistics-bento">
          {/* Tile 1: Kassenbestand */}
          <div 
            onClick={() => setIsExpenseModalOpen(true)}
            className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-emerald-500 hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer group"
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                <Coins className="w-3 h-3 text-emerald-600" />
                Kassenbestand (Ist)
              </span>
              <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                Verwalten ➔
              </span>
            </div>
            <p className="text-2xl font-black text-emerald-600 font-mono mt-1">
              {(stats.totalPaid - stats.totalExpenses).toFixed(2)} €
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">
              Eingezahlt: {stats.totalPaid.toFixed(2)} € • Ausgaben: {stats.totalExpenses.toFixed(2)} €
            </span>
          </div>

          {/* Tile 2: Offene Forderungen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-[#FF6B00]/40 transition">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              Offene Schulden
            </span>
            <p className="text-2xl font-black text-rose-600 font-mono mt-1">
              {stats.totalOutstanding.toFixed(2)} €
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Ausstehende Forderungen</span>
          </div>

          {/* Tile 3: Gesamtwert */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-[#FF6B00]/40 transition">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#FF6B00]" />
              Gesamt-Volumen
            </span>
            <p className="text-2xl font-black text-slate-800 font-mono mt-1">
              {stats.totalRevenue.toFixed(2)} €
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Umsatz Getränke + Strafen</span>
          </div>

          {/* Tile 4: Getränke Flaschen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-[#FF6B00]/40 transition">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Beer className="w-3 h-3 text-orange-600" />
              Konsumierte Getränke
            </span>
            <p className="text-2xl font-black text-orange-600 font-mono mt-1">
              {stats.drinksServed}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Flaschen insgesamt</span>
          </div>

          {/* Tile 5: Vergehen / Strafen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-[#FF6B00]/40 transition col-span-2 lg:col-span-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Erteilte Strafen
            </span>
            <p className="text-2xl font-black text-amber-600 font-mono mt-1">
              {stats.finesIssuedCount}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Eingetragene Sünden</span>
          </div>
        </section>

        {/* 2. MAIN LAYOUT GRID */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="dashboard-layout">
          
          {/* LEFT COLUMNS (2/3): Players Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Users className="text-[#FF6B00] w-5 h-5" />
                  Spielerliste &amp; Kontostände
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {!showAllPlayers 
                    ? "Es werden standardmäßig nur Spieler mit rotem Kontostand (ab 17 € Schulden, max. 4) angezeigt."
                    : "Es werden alle Spieler in dieser Auswahl aufgelistet."}
                </p>
              </div>

              {/* Player Search Bar */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Spieler oder Nummer suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-850 focus:outline-none focus:border-[#FF6B00] placeholder:text-slate-400 shadow-2xs"
                />
                <Search className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" />
              </div>
            </div>

            {/* Togglers row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/50 p-2 rounded-2xl border border-slate-200/80">
              {/* Team Toggler */}
              <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/40 w-full sm:w-auto" id="team-selector-tabs">
                <button
                  type="button"
                  onClick={() => setSelectedTeam('All')}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTeam === 'All'
                      ? 'bg-[#FF6B00] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Alle Teams
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTeam('Herren 1')}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTeam === 'Herren 1'
                      ? 'bg-[#FF6B00] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Herren 1
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTeam('Herren 2')}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTeam === 'Herren 2'
                      ? 'bg-[#FF6B00] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Herren 2
                </button>
              </div>

              {/* View/Balance Filter Toggler */}
              <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/40 w-full sm:w-auto" id="view-selector-tabs">
                <button
                  type="button"
                  onClick={() => setShowAllPlayers(false)}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !showAllPlayers
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Rote Kontostände (≥ 17€)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllPlayers(true)}
                  className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    showAllPlayers
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Alle anzeigen
                </button>
              </div>
            </div>

            {/* Players Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="players-grid">
              {displayedPlayers.length === 0 ? (
                <div className="col-span-full py-12 text-center bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">
                    {!showAllPlayers 
                      ? "Keine Spieler mit Schulden ab 17 € gefunden!" 
                      : "Keine Spieler gefunden."}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    {!showAllPlayers 
                      ? "Aktuell hat kein Spieler in dieser Auswahl einen roten Kontostand von 17 € oder mehr." 
                      : "Suche anpassen oder oben einen neuen Spieler hinzufügen."}
                  </p>
                  {!showAllPlayers && (
                    <button
                      type="button"
                      onClick={() => setShowAllPlayers(true)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                    >
                      Alle Spieler auflisten
                    </button>
                  )}
                </div>
              ) : (
                displayedPlayers.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    drinks={drinks}
                    fines={fines}
                    onAddDrink={handleRecordDrink}
                    onAddFine={handleRecordFine}
                    onOpenDetails={setSelectedPlayer}
                    isAuthorized={isBookingAuthorized || isAdminMode}
                  />
                ))
              )}
            </div>

            {/* See All Trigger at bottom */}
            {!showAllPlayers && filteredPlayers.length > displayedPlayers.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllPlayers(true)}
                  className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition transform hover:scale-[1.02] active:scale-95 cursor-pointer shadow-sm"
                  id="show-all-players-btn"
                >
                  <span>Alle anzeigen ({filteredPlayers.length} Spieler)</span>
                  <ChevronRight className="w-4 h-4 text-orange-400" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (1/3): Quick Booking & Ledger */}
          <div className="space-y-6">
            {/* Quick booking widget */}
            <QuickBooking
              players={players}
              drinks={drinks}
              fines={fines}
              onBulkBook={handleBulkBook}
              isAuthorized={isBookingAuthorized || isAdminMode}
            />

            {/* Global History activity log */}
            <TransactionHistory
              transactions={transactions}
              onRevertTransaction={handleRevertTransaction}
            />
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 text-center text-slate-400 text-xs mt-16 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 BFC Freiburg Mannschaftskasse. Alle Daten werden sicher offline in deinem Browser gespeichert.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-600 cursor-pointer">Datenschutz</span>
            <span>•</span>
            <span className="hover:text-slate-600 cursor-pointer">Impressum</span>
          </div>
        </div>
      </footer>

      {/* MODAL: PLAYER DETAIL VIEW (Consuming, Paying, Fines) */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerDetailModal
            player={selectedPlayer}
            drinks={drinks}
            fines={fines}
            transactions={transactions}
            onClose={() => setSelectedPlayer(null)}
            onAddDrink={handleRecordDrink}
            onRemoveDrink={handleRemoveDrink}
            onAddFine={handleRecordFine}
            onRemoveFine={handleRemoveFine}
            onAddPayment={handleRecordPayment}
            onUpdatePlayer={handleUpdatePlayer}
            onDeletePlayer={handleDeletePlayer}
            isAdminMode={isAdminMode}
            isAuthorized={isBookingAuthorized || isAdminMode}
            onTriggerAdminPrompt={(actionType) => {
              setPendingAdminAction({ type: actionType, playerId: selectedPlayer.id });
              setAdminPromptPin('');
              setAdminPromptError('');
            }}
          />
        )}
      </AnimatePresence>

      {/* MODAL: NEW PLAYER REGISTRATION */}
      {isNewPlayerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="new-player-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#FF6B00]" />
                Neuen Spieler registrieren
              </h3>
              <button
                onClick={() => setIsNewPlayerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddPlayer} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Name des Spielers</label>
                <input
                  type="text"
                  placeholder="z.B. Max Mustermann"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-850 focus:outline-none focus:border-[#FF6B00] shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Trikotnummer (optional)</label>
                <input
                  type="text"
                  placeholder="z.B. 14, HC, AC"
                  value={newPlayerNumber}
                  onChange={(e) => setNewPlayerNumber(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-850 focus:outline-none focus:border-[#FF6B00] shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Mannschaftszugehörigkeit (mind. 1 wählen)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (newPlayerTeams.includes('Herren 1')) {
                        if (newPlayerTeams.length > 1) setNewPlayerTeams(newPlayerTeams.filter(t => t !== 'Herren 1'));
                      } else {
                        setNewPlayerTeams([...newPlayerTeams, 'Herren 1']);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      newPlayerTeams.includes('Herren 1')
                        ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Herren 1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (newPlayerTeams.includes('Herren 2')) {
                        if (newPlayerTeams.length > 1) setNewPlayerTeams(newPlayerTeams.filter(t => t !== 'Herren 2'));
                      } else {
                        setNewPlayerTeams([...newPlayerTeams, 'Herren 2']);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      newPlayerTeams.includes('Herren 2')
                        ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Herren 2
                  </button>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewPlayerModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-500 text-white font-black rounded-xl text-xs transition cursor-pointer"
                >
                  Registrieren
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        expenses={expenses}
        onAddExpense={handleAddExpense}
        onDeleteExpense={handleDeleteExpense}
        totalPaid={stats.totalPaid}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
      />

      {/* Admin PIN Prompt for Fines/Bookings Booking */}
      {pendingAdminAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in" id="admin-pin-prompt-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                {['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction'].includes(pendingAdminAction.type)
                  ? 'Admin-Freigabe erforderlich'
                  : 'Buchungs-Passwort erforderlich'}
              </h3>
              <button
                onClick={() => setPendingAdminAction(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction'].includes(pendingAdminAction.type)
                ? 'Diese Aktion ist nur für Admins gestattet. Bitte gib den Admin-PIN ein.'
                : 'Schreibende Buchungen sind passwortgeschützt. Bitte gib das Passwort ein.'}
            </p>

            <form onSubmit={handleAdminPromptSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder={['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction'].includes(pendingAdminAction.type)
                    ? 'Admin-PIN'
                    : 'Passwort'}
                  value={adminPromptPin}
                  onChange={(e) => setAdminPromptPin(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-center text-sm font-mono focus:outline-none focus:border-[#FF6B00] shadow-2xs"
                  autoFocus
                />
                {adminPromptError && (
                  <p className="text-[10px] text-rose-600 font-semibold text-center mt-1.5 animate-fade-in">{adminPromptError}</p>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPendingAdminAction(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-xs transition cursor-pointer shadow-xs"
                >
                  Freischalten
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Catalog Manager (Tarife & Strafen) */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="catalog-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#FF6B00]" />
                Tarife & Strafen verwalten
              </h3>
              <button
                onClick={() => setIsCatalogOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {isAdminMode ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                      <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span><strong>Admin-Modus aktiv:</strong> Du kannst nun Getränke-Preise ändern, neue Strafen hinzufügen und den Katalog verwalten.</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsAdminMode(false);
                        setBottomPinError('');
                        setBottomPinInput('');
                      }}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs shrink-0"
                    >
                      Admin-Sitzung sperren
                    </button>
                  </div>
                  <CatalogManager
                    drinks={drinks}
                    fines={fines}
                    onUpdateDrinks={handleUpdateDrinks}
                    onUpdateFines={handleUpdateFines}
                    onResetToDefaults={handleResetCatalogToDefaults}
                    notifications={notifications}
                    onAddNotification={handleAddNotification}
                    onDeleteNotification={handleDeleteNotification}
                  />
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4 shadow-3xs my-8">
                  <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">🔒 Admin-Bereich: Katalog verwalten</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Der Getränke- und Strafenkatalog ist aktuell für Mitglieder gesperrt. Gib den Admin-PIN ein, um Einstellungen vorzunehmen.
                    </p>
                  </div>
                  
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (bottomPinInput === '2016') {
                        setIsAdminMode(true);
                        setBottomPinInput('');
                        setBottomPinError('');
                      } else {
                        setBottomPinError('Falscher PIN!');
                      }
                    }}
                    className="space-y-3 max-w-sm mx-auto pt-2"
                  >
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <input
                        type="password"
                        placeholder="Admin-PIN eingeben"
                        value={bottomPinInput}
                        onChange={(e) => setBottomPinInput(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-[#FF6B00] shadow-2xs font-mono text-center flex-1"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm shrink-0"
                      >
                        Freischalten
                      </button>
                    </div>
                    {bottomPinError && (
                      <p className="text-[10px] text-rose-600 font-semibold animate-fade-in">{bottomPinError}</p>
                    )}
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Real-time Push Notification Toast Overlay */}
      <AnimatePresence>
        {activeNotificationToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
          >
            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/50 p-4 flex gap-3 items-start backdrop-blur-md bg-opacity-95">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF6B00] to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20 animate-bounce">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400">Neue Push-Nachricht</span>
                  {activeNotificationToast.targetTeam !== 'all' && (
                    <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-1.5 py-0.5 rounded-full">
                      {activeNotificationToast.targetTeam}
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-white mt-0.5">{activeNotificationToast.title}</h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{activeNotificationToast.message}</p>
              </div>
              <button
                onClick={() => setActiveNotificationToast(null)}
                className="text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PushSettingsModal
        isOpen={isPushSettingsOpen}
        onClose={() => setIsPushSettingsOpen(false)}
      />

    </div>
  );
}
