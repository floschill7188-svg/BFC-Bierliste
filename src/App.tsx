import React, { useState, useEffect, useRef } from 'react';
import { Player, Drink, Fine, Transaction, ClubStats, Expense, NotificationSchedule, ScheduleRule } from './types';
import { DEFAULT_DRINKS, DEFAULT_FINES, DEMO_PLAYERS, DEMO_EXPENSES } from './data/defaults';
import PlayerCard from './components/PlayerCard';
import { onSnapshot, collection, doc, setDoc, runTransaction, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
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
  dbDeleteExpense
} from './lib/db';
import PlayerDetailModal from './components/PlayerDetailModal';
import CatalogManager from './components/CatalogManager';
import QuickBooking from './components/QuickBooking';
import TransactionHistory from './components/TransactionHistory';
import ExpenseModal from './components/ExpenseModal';
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
  BellOff,
  Volume2,
  Trash2,
  Clock,
  Edit2,
  Save
} from 'lucide-react';

function cleanForFirestore<T extends object>(obj: T): T {
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

function getScheduleRules(schedule: NotificationSchedule): ScheduleRule[] {
  if (schedule.rules && schedule.rules.length > 0) {
    return schedule.rules;
  }
  // Fallback to legacy fields
  if (schedule.type) {
    return [{
      id: 'legacy-default',
      type: schedule.type,
      onceDateTime: schedule.onceDateTime || '',
      repeatingDay: schedule.repeatingDay || 'sunday',
      repeatingTime: schedule.repeatingTime || '18:00',
    }];
  }
  return [];
}

function calculateRuleNextRunTime(rule: ScheduleRule, referenceTime: number = Date.now()): number | undefined {
  if (rule.type === 'once') {
    if (!rule.onceDateTime) return undefined;
    const date = new Date(rule.onceDateTime);
    const ms = date.getTime();
    if (isNaN(ms)) return undefined;
    return ms > referenceTime ? ms : undefined;
  }
  
  if (rule.type === 'repeating') {
    if (!rule.repeatingTime) return undefined;
    const [hours, minutes] = rule.repeatingTime.split(':').map(Number);
    if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) return undefined;
    
    const now = new Date(referenceTime);
    const target = new Date(referenceTime);
    target.setHours(hours, minutes, 0, 0);
    
    if (rule.repeatingDay === 'daily') {
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime();
    } else {
      const dayMap: { [key: string]: number } = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6
      };
      const targetDay = dayMap[rule.repeatingDay || 'sunday'];
      const currentDay = now.getDay();
      
      let daysDiff = targetDay - currentDay;
      if (daysDiff < 0) {
        daysDiff += 7;
      } else if (daysDiff === 0) {
        if (target.getTime() <= now.getTime()) {
          daysDiff = 7;
        }
      }
      target.setDate(target.getDate() + daysDiff);
      return target.getTime();
    }
  }
  return undefined;
}

function calculateNextRunTime(schedule: NotificationSchedule, referenceTime: number = Date.now()): number | undefined {
  if (!schedule.isActive) return undefined;
  const rules = getScheduleRules(schedule);
  if (rules.length === 0) return undefined;
  
  let earliest: number | undefined = undefined;
  for (const rule of rules) {
    const next = calculateRuleNextRunTime(rule, referenceTime);
    if (next !== undefined) {
      if (earliest === undefined || next < earliest) {
        earliest = next;
      }
    }
  }
  return earliest;
}

function calculateNextNRunTimes(schedule: NotificationSchedule, n: number): number[] {
  if (!schedule.isActive) return [];
  const rules = getScheduleRules(schedule);
  if (rules.length === 0) return [];
  
  const allRuns: number[] = [];
  for (const rule of rules) {
    let referenceTime = Date.now();
    for (let i = 0; i < n; i++) {
      const next = calculateRuleNextRunTime(rule, referenceTime);
      if (next === undefined) break;
      allRuns.push(next);
      referenceTime = next + 1000;
    }
  }
  
  const uniqueRuns = Array.from(new Set(allRuns)).sort((a, b) => a - b);
  return uniqueRuns.slice(0, n);
}

export default function App() {
  // --- STATE ---
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bfc_app_unlocked') !== 'true';
    }
    return true;
  });
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [appPasswordError, setAppPasswordError] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [manualCashAdjustment, setManualCashAdjustment] = useState<number>(0);
  const [isEditingCashBalance, setIsEditingCashBalance] = useState(false);
  const [editCashBalanceValue, setEditCashBalanceValue] = useState('');
  const [isResetDbModalOpen, setIsResetDbModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isBookingAuthorized, setIsBookingAuthorized] = useState(false);
  const [bottomPinInput, setBottomPinInput] = useState('');
  const [bottomPinError, setBottomPinError] = useState('');
  
  // Payment Info State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paypalInfo, setPaypalInfo] = useState('');
  const [weroInfo, setWeroInfo] = useState('');
  const [tempPaypalInfo, setTempPaypalInfo] = useState('');
  const [tempWeroInfo, setTempWeroInfo] = useState('');
  const [isEditingPaymentInfo, setIsEditingPaymentInfo] = useState(false);
  const [paymentPinInput, setPaymentPinInput] = useState('');
  const [paymentPinError, setPaymentPinError] = useState('');
  
  // Pending Admin/Booking action state
  const [pendingAdminAction, setPendingAdminAction] = useState<{
    type: 'record_fine' | 'remove_fine' | 'bulk_fine' | 'add_player' | 'edit_player' | 'delete_player' | 'record_drink' | 'remove_drink' | 'record_payment' | 'revert_transaction' | 'bulk_drink' | 'open_catalog' | 'add_expense' | 'delete_expense' | 'player_login' | 'trainer_login';
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

  // Notification Planner & Sendeplan State
  const [isNotificationPlannerOpen, setIsNotificationPlannerOpen] = useState(false);
  const [schedules, setSchedules] = useState<NotificationSchedule[]>([]);
  const [notifStatus, setNotifStatus] = useState<{ text: string; isError: boolean } | null>(null);

  // Local browser notification state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [areNotificationsMuted, setAreNotificationsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bb_notifs_muted') === 'true';
    }
    return false;
  });

  const notificationsMutedRef = useRef(areNotificationsMuted);
  useEffect(() => {
    notificationsMutedRef.current = areNotificationsMuted;
  }, [areNotificationsMuted]);

  // Register Service Worker for mobile browser notification support
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[SW] Registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }
  }, []);

  const triggerNotificationWithSW = (title: string, body: string) => {
    if (typeof window === 'undefined') return;
    if (notificationsMutedRef.current) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Try through service worker (required for Android Chrome and highly robust)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        const options: any = {
          body,
          icon: '/icon.png',
          badge: '/icon.png',
          vibrate: [200, 100, 200]
        };
        registration.showNotification(title, options);
      }).catch((err) => {
        console.warn("Service Worker showNotification failed, falling back to window Notification:", err);
        new Notification(title, { body, icon: '/icon.png' });
      });
    } else {
      // Fallback
      new Notification(title, { body, icon: '/icon.png' });
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert("Ihr Browser unterstützt leider keine Benachrichtigungen.");
      return;
    }

    if (Notification.permission === 'granted') {
      // Toggle mute/unmute
      const newMuteState = !areNotificationsMuted;
      setAreNotificationsMuted(newMuteState);
      localStorage.setItem('bb_notifs_muted', String(newMuteState));
      
      if (!newMuteState) {
        // Show test notification on unmute
        triggerNotificationWithSW("🔔 Live-Meldungen reaktiviert!", "Du erhältst ab jetzt wieder Benachrichtigungen bei neuen Einträgen.");
      }
      return;
    }

    if (Notification.permission === 'denied') {
      alert("Benachrichtigungen sind in Ihrem Browser blockiert. Bitte aktivieren Sie diese in den Website-Einstellungen Ihres Browsers, um Live-Meldungen zu empfangen.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === 'granted') {
        setAreNotificationsMuted(false);
        localStorage.setItem('bb_notifs_muted', 'false');
        
        // Wait a small moment to ensure the permission state is fully registered by the browser/SW
        setTimeout(() => {
          triggerNotificationWithSW("🔔 Benachrichtigungen aktiviert!", "Du wirst ab jetzt benachrichtigt, sobald Getränke oder Strafen eingetragen werden.");
        }, 300);
      }
    } catch (err) {
      console.error("Fehler beim Anfordern der Benachrichtigungs-Berechtigung:", err);
    }
  };

  const triggerBrowserNotification = (tx: Transaction) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (notificationsMutedRef.current) return;

    if (tx.type === 'drink') {
      return; // Bei Eintragen von Getränken: Nie.
    }

    let title = "Mannschaftskasse Update";
    let body = "";

    if (tx.type === 'fine') {
      title = `💸 Strafe erhalten: ${tx.playerName}`;
      body = `${tx.playerName} hat eine Strafe erhalten: "${tx.itemName}" (${tx.amount.toFixed(2)} €).`;
    } else if (tx.type === 'payment') {
      title = `💳 Einzahlung: ${tx.playerName}`;
      body = `${tx.playerName} hat einen Betrag von ${Math.abs(tx.amount).toFixed(2)} € eingezahlt.`;
    } else if (tx.type === 'expense') {
      title = `Ausgabe erfasst 📉`;
      body = `Ausgabe: "${tx.itemName}" (${tx.amount.toFixed(2)} €).`;
    }

    if (body) {
      triggerNotificationWithSW(title, body);
    }
  };

  // --- INITIALIZE FROM FIRESTORE OR DEFAULTS ---
  useEffect(() => {
    let unsubPlayers: () => void;
    let unsubDrinks: () => void;
    let unsubFines: () => void;
    let unsubTransactions: () => void;
    let unsubExpenses: () => void;
    let unsubSchedules: () => void;
    let unsubAnnouncements: () => void;
    let unsubSettings: () => void;

    const setupSubscriptions = () => {
      unsubSettings = onSnapshot(doc(db, 'settings', 'app'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (typeof data.manualCashAdjustment === 'number') {
            setManualCashAdjustment(data.manualCashAdjustment);
          }
          if (typeof data.paypalInfo === 'string') {
            setPaypalInfo(data.paypalInfo);
          }
          if (typeof data.weroInfo === 'string') {
            setWeroInfo(data.weroInfo);
          }
        }
      }, (err) => {
        console.error("Failed to load settings: ", err);
      });

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

      let isInitialTx = true;
      unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
        const txList: Transaction[] = [];
        snapshot.forEach((doc) => {
          txList.push(doc.data() as Transaction);
        });
        txList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(txList);

        if (isInitialTx) {
          isInitialTx = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const tx = change.doc.data() as Transaction;
            triggerBrowserNotification(tx);
          }
        });
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

      unsubSchedules = onSnapshot(collection(db, 'schedules'), (snapshot) => {
        const schedulesList: NotificationSchedule[] = [];
        snapshot.forEach((doc) => {
          schedulesList.push(doc.data() as NotificationSchedule);
        });

        if (schedulesList.length === 0) {
          const defaultSchedules: NotificationSchedule[] = [
            {
              id: 'kontostand',
              title: 'Aktueller Kontostand 📊',
              defaultBody: 'Bitte überprüfe deinen Kontostand in der App und zahle ausstehende Beträge ein. Jede Kasse zählt!',
              isActive: false,
              type: 'once',
              onceDateTime: '',
              repeatingDay: 'sunday',
              repeatingTime: '18:00'
            },
            {
              id: 'getraenke',
              title: 'Getränke nachtragen! 🍻',
              defaultBody: 'Denkt bitte daran, alle eure konsumierten Getränke der letzten Tage ordnungsgemäß nachzutragen!',
              isActive: false,
              type: 'once',
              onceDateTime: '',
              repeatingDay: 'sunday',
              repeatingTime: '18:00'
            }
          ];
          defaultSchedules.forEach(schedule => {
            setDoc(doc(db, 'schedules', schedule.id), cleanForFirestore(schedule)).catch(e => console.error("Failed to seed default schedule:", e));
          });
        } else {
          setSchedules(schedulesList);
        }
      }, (err) => {
        console.error("Failed to load schedules: ", err);
      });

      let isInitialAnnouncement = true;
      unsubAnnouncements = onSnapshot(collection(db, 'announcements'), (snapshot) => {
        if (isInitialAnnouncement) {
          isInitialAnnouncement = false;
          return;
        }
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const announcement = change.doc.data();
            if (announcement && announcement.title && announcement.body) {
              triggerNotificationWithSW(announcement.title, announcement.body);
            }
          }
        });
      }, (err) => {
        console.error("Failed to load announcements: ", err);
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
      if (unsubSchedules) unsubSchedules();
      if (unsubAnnouncements) unsubAnnouncements();
      if (unsubSettings) unsubSettings();
    };
  }, []);

  const schedulesRef = useRef(schedules);
  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  useEffect(() => {
    const checkScheduledNotifications = async () => {
      const now = Date.now();
      const currentSchedules = schedulesRef.current;
      if (!currentSchedules || currentSchedules.length === 0) return;
      
      for (const schedule of currentSchedules) {
        if (!schedule.isActive) continue;
        
        let nextRun = schedule.nextRunTime;
        if (!nextRun) {
          nextRun = calculateNextRunTime(schedule);
          if (nextRun) {
            try {
              await setDoc(doc(db, 'schedules', schedule.id), cleanForFirestore({
                ...schedule,
                nextRunTime: nextRun
              }));
            } catch (err) {
              console.error("Failed to update schedule nextRunTime: ", err);
            }
            continue;
          }
        }
        
        if (nextRun && nextRun <= now) {
          try {
            const scheduleDocRef = doc(db, 'schedules', schedule.id);
            await runTransaction(db, async (transaction) => {
              const freshDoc = await transaction.get(scheduleDocRef);
              if (!freshDoc.exists()) return;
              
              const freshSchedule = freshDoc.data() as NotificationSchedule;
              if (!freshSchedule.isActive) return;
              if (freshSchedule.nextRunTime && freshSchedule.nextRunTime > Date.now()) return;
              
              const announcementRef = doc(collection(db, 'announcements'));
              const timestamp = new Date().toISOString();
              transaction.set(announcementRef, {
                id: announcementRef.id,
                title: freshSchedule.title,
                body: freshSchedule.defaultBody,
                timestamp: timestamp
              });
              
              let updatedSchedule = { ...freshSchedule };
              updatedSchedule.lastTriggered = timestamp;
              
              const currentHistory = freshSchedule.history || [];
              updatedSchedule.history = [timestamp, ...currentHistory].slice(0, 3);
              
              const nextRunTime = calculateNextRunTime(freshSchedule, Date.now() + 5000);
              updatedSchedule.nextRunTime = nextRunTime !== undefined ? nextRunTime : null;
              if (nextRunTime === undefined) {
                updatedSchedule.isActive = false;
              }
              
              transaction.set(scheduleDocRef, cleanForFirestore(updatedSchedule));
            });
            console.log(`Successfully triggered scheduled notification: ${schedule.id}`);
          } catch (err) {
            console.error("Transaction failed during scheduled trigger: ", err);
          }
        }
      }
    };

    const interval = setInterval(checkScheduledNotifications, 15000);
    const initialTimeout = setTimeout(checkScheduledNotifications, 2000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, []);

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
    if (isAdminMode) {
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
    if (isAdminMode) {
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
    if (isAdminMode) {
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
    const isAuthorizedForType = type === 'drink' ? (isAdminMode || isBookingAuthorized) : isAdminMode;
    if (isAuthorizedForType) {
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

  const handleSendNow = async (id: string, title: string, body: string) => {
    try {
      const announcementRef = doc(collection(db, 'announcements'));
      const timestamp = new Date().toISOString();
      await setDoc(announcementRef, {
        id: announcementRef.id,
        title: title,
        body: body,
        timestamp: timestamp
      });

      // Update schedule history & lastTriggered in Firestore
      const sched = schedules.find(s => s.id === id);
      if (sched) {
        const history = sched.history || [];
        const updatedHistory = [timestamp, ...history].slice(0, 3);
        const updatedSched = {
          ...sched,
          lastTriggered: timestamp,
          history: updatedHistory
        };
        await setDoc(doc(db, 'schedules', id), cleanForFirestore(updatedSched));
      }

      setNotifStatus({ text: `📣 Meldung "${title}" wurde erfolgreich an alle gesendet!`, isError: false });
      setTimeout(() => setNotifStatus(null), 4000);
    } catch (err) {
      console.error("Failed to send manual announcement:", err);
      setNotifStatus({ text: "Fehler beim Senden der Meldung.", isError: true });
      setTimeout(() => setNotifStatus(null), 4000);
    }
  };

  const handleSaveSchedule = async (schedule: NotificationSchedule) => {
    try {
      const rules = getScheduleRules(schedule);
      const primaryRule = (rules[0] || { id: 'default', type: 'repeating', repeatingDay: 'sunday', repeatingTime: '18:00' }) as ScheduleRule;
      const nextRun = calculateNextRunTime(schedule);
      const updated = {
        ...schedule,
        rules,
        type: primaryRule.type,
        onceDateTime: primaryRule.onceDateTime || '',
        repeatingDay: primaryRule.repeatingDay || 'sunday',
        repeatingTime: primaryRule.repeatingTime || '18:00',
        nextRunTime: nextRun || null
      };
      await setDoc(doc(db, 'schedules', schedule.id), cleanForFirestore(updated));
      setNotifStatus({ text: `💾 "${schedule.title}" erfolgreich gespeichert!`, isError: false });
      setTimeout(() => setNotifStatus(null), 4000);
    } catch (err) {
      console.error("Failed to save schedule:", err);
      setNotifStatus({ text: "Fehler beim Speichern der Erinnerung.", isError: true });
      setTimeout(() => setNotifStatus(null), 4000);
    }
  };

  const handleAddSchedule = async () => {
    try {
      const newId = doc(collection(db, 'schedules')).id;
      const newSchedule: NotificationSchedule = {
        id: newId,
        title: 'Neue Erinnerung 📣',
        defaultBody: 'Bitte denkt daran, eure ausstehenden Beträge einzuzahlen oder eure Getränke einzutragen.',
        isActive: false,
        type: 'repeating',
        repeatingDay: 'sunday',
        repeatingTime: '18:00',
        onceDateTime: '',
        rules: [
          {
            id: 'rule-' + Math.random().toString(36).substring(2, 9),
            type: 'repeating',
            repeatingDay: 'sunday',
            repeatingTime: '18:00'
          }
        ],
        history: []
      };
      await setDoc(doc(db, 'schedules', newId), cleanForFirestore(newSchedule));
      setNotifStatus({ text: "✨ Neue Erinnerung wurde erfolgreich angelegt!", isError: false });
      setTimeout(() => setNotifStatus(null), 4000);
    } catch (err) {
      console.error("Failed to add schedule:", err);
      setNotifStatus({ text: "Fehler beim Erstellen der Erinnerung.", isError: true });
      setTimeout(() => setNotifStatus(null), 4000);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm("Bist du sicher, dass du diese Erinnerung löschen möchtest?")) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
      setNotifStatus({ text: "🗑️ Erinnerung wurde erfolgreich gelöscht!", isError: false });
      setTimeout(() => setNotifStatus(null), 4000);
    } catch (err) {
      console.error("Failed to delete schedule:", err);
      setNotifStatus({ text: "Fehler beim Löschen der Erinnerung.", isError: true });
      setTimeout(() => setNotifStatus(null), 4000);
    }
  };

  const handleAdminPromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = adminPromptPin;
    const isPendingAdmin = pendingAdminAction && [
      'add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction',
      'record_fine', 'remove_fine', 'bulk_fine', 'record_payment', 'trainer_login'
    ].includes(pendingAdminAction.type);
    
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

  // Save manual cash adjustment
  const handleSaveManualCashAdjustment = async (targetValueStr: string) => {
    const cleaned = targetValueStr.replace(/[^\d.,-]/g, '').replace(',', '.');
    const numericValue = parseFloat(cleaned);
    if (isNaN(numericValue)) return;
    
    const calculatedKassenbestand = stats.totalPaid - stats.totalExpenses;
    const newAdjustment = numericValue - calculatedKassenbestand;
    
    try {
      await setDoc(doc(db, 'settings', 'app'), { manualCashAdjustment: newAdjustment }, { merge: true });
      setManualCashAdjustment(newAdjustment);
      setIsEditingCashBalance(false);
    } catch (e) {
      console.error("Failed to save manual cash adjustment:", e);
      alert("Fehler beim Speichern der Kassenkorrektur.");
    }
  };

  // Save PayPal and Wero payment information
  const handleSavePaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'app'), { 
        paypalInfo: tempPaypalInfo, 
        weroInfo: tempWeroInfo 
      }, { merge: true });
      setPaypalInfo(tempPaypalInfo);
      setWeroInfo(tempWeroInfo);
      setIsEditingPaymentInfo(false);
      setPaymentPinInput('');
      setPaymentPinError('');
    } catch (err) {
      console.error("Failed to save payment info:", err);
      alert("Fehler beim Speichern der Zahlungsinfos.");
    }
  };

  // Reset entire catalog to default values
  const handleResetCatalogToDefaults = () => {
    saveState(players, DEFAULT_DRINKS, DEFAULT_FINES, transactions);
  };

  // Wipe all database balances and delete all transactions/expenses (Blank start)
  const handleWipeDatabase = async () => {
    setIsFirebaseLoading(true);
    try {
      // 1. Get all transactions and delete them
      const txSnap = await getDocs(collection(db, 'transactions'));
      const batch = writeBatch(db);
      txSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 2. Get all expenses and delete them
      const expSnap = await getDocs(collection(db, 'expenses'));
      expSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 3. Reset all players to empty drinksCount, finesCount, and totalPaid
      const playerSnap = await getDocs(collection(db, 'players'));
      playerSnap.forEach((doc) => {
        const pData = doc.data() as Player;
        batch.set(doc.ref, {
          ...pData,
          drinksCount: {},
          finesCount: {},
          totalPaid: 0
        });
      });

      // 4. Reset settings manualCashAdjustment to 0
      batch.set(doc(db, 'settings', 'app'), { manualCashAdjustment: 0 }, { merge: true });

      await batch.commit();
      
      // Update local state just in case snapshot takes a moment
      setTransactions([]);
      setExpenses([]);
      setPlayers(prev => prev.map(p => ({
        ...p,
        drinksCount: {},
        finesCount: {},
        totalPaid: 0
      })));
      setManualCashAdjustment(0);
      setIsResetDbModalOpen(false);
      alert("Erfolgreich zurückgesetzt! Alle Kontostände wurden genullt, Transaktionen & Ausgaben gelöscht.");
    } catch (error) {
      console.error("Failed to wipe database:", error);
      alert("Fehler beim Zurücksetzen der Datenbank: " + error);
    } finally {
      setIsFirebaseLoading(false);
    }
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
      
      {isFirebaseLoading ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/98 backdrop-blur-md animate-fade-in">
          <div className="relative group mb-6">
            <div className="absolute -inset-4 bg-gradient-to-r from-[#FF6B00] via-amber-500 to-emerald-600 rounded-full blur-xl opacity-75 animate-pulse" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-[#FF6B00] to-amber-500 rounded-3xl flex items-center justify-center p-2 shadow-2xl animate-bounce">
              <div className="relative w-full h-full flex items-center justify-center">
                <Dribbble className="w-14 h-14 animate-spin-slow text-white" />
                <Coins className="w-9 h-9 text-yellow-300 absolute -bottom-1 -right-1 drop-shadow-md" />
              </div>
            </div>
          </div>
          <p className="text-base font-bold text-slate-200 tracking-wide">BFC Freiburg e.V.</p>
          <p className="text-xs text-[#FF6B00] font-semibold animate-pulse mt-1">Lade Mannschaftskasse...</p>
        </div>
      ) : isAppLocked ? (
        <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans antialiased flex flex-col items-center justify-center p-4 overflow-hidden">
          {/* Basketball and Pine Forest atmospheric gradients */}
          <div className="absolute right-[-80px] top-[-80px] w-96 h-96 rounded-full bg-orange-600/10 blur-3xl pointer-events-none animate-pulse" />
          <div className="absolute left-[15%] bottom-[-50px] w-72 h-72 rounded-full bg-emerald-600/5 blur-3xl pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,107,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,107,0,0.02)_1px,transparent_1px)] bg-[size:30px_30px] opacity-40 pointer-events-none" />

          <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 z-10 backdrop-blur-md">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-[#FF6B00] to-amber-500 rounded-2xl blur-md opacity-75 group-hover:opacity-100 transition duration-500 animate-pulse" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-[#FF6B00] to-amber-500 rounded-2xl flex items-center justify-center p-1.5 shadow-2xl">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <Dribbble className="w-11 h-11 animate-spin-slow text-white" />
                    <Coins className="w-7 h-7 text-yellow-300 absolute -bottom-1 -right-1 drop-shadow-md" />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  <span className="text-[10px] bg-[#FF6B00]/20 text-[#FF6B00] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider border border-[#FF6B00]/30">
                    Privater Bereich
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white tracking-tight mt-2 font-sans">
                  BFC Freiburg Kasse
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto font-medium">
                  Diese Seite ist privat. Bitte gib das Spieler-Passwort oder den Trainer-PIN ein, um fortzufahren.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const lowerVal = appPasswordInput.trim();
              if (lowerVal === 'Unter100') {
                setIsAppLocked(false);
                localStorage.setItem('bfc_app_unlocked', 'true');
                setIsBookingAuthorized(true);
              } else if (lowerVal === '2016') {
                setIsAppLocked(false);
                localStorage.setItem('bfc_app_unlocked', 'true');
                setIsAdminMode(true);
                setIsBookingAuthorized(true);
              } else {
                setAppPasswordError('Ungültiges Passwort oder PIN!');
              }
            }} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Passwort oder PIN</label>
                <div className="relative">
                  <input
                    type="password"
                    value={appPasswordInput}
                    onChange={(e) => {
                      setAppPasswordInput(e.target.value);
                      setAppPasswordError('');
                    }}
                    placeholder="Spieler-Passwort oder Trainer-PIN"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent transition"
                    autoFocus
                  />
                  <div className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                </div>
                {appPasswordError && (
                  <p className="text-xs text-rose-500 font-medium animate-fade-in">{appPasswordError}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-[#FF6B00] to-amber-500 hover:from-[#e05e00] hover:to-amber-600 text-white font-extrabold rounded-2xl text-sm transition shadow-lg shadow-orange-500/15 cursor-pointer flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                Bereich freischalten
              </button>
            </form>

            <div className="pt-2 text-center border-t border-slate-800/50">
              <p className="text-[10px] text-slate-500">
                © BFC Freiburg e.V. • Nur zur internen Vereinsnutzung
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
      
      {/* HEADER BANNER */}
      <header className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-b border-[#FF6B00]/30 px-4 py-6 md:py-8 overflow-hidden shadow-lg text-white">
        
        {/* Basketball and Pine Forest atmospheric gradients */}
        <div className="absolute right-[-80px] top-[-80px] w-96 h-96 rounded-full bg-orange-600/10 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute left-[15%] bottom-[-50px] w-72 h-72 rounded-full bg-emerald-600/5 blur-3xl pointer-events-none" />
        
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,107,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,107,0,0.02)_1px,transparent_1px)] bg-[size:30px_30px] opacity-40 pointer-events-none" />

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            {/* Real Logo Badge */}
            <div className="relative group shrink-0">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-[#FF6B00] to-amber-500 rounded-2xl blur-md opacity-75 group-hover:opacity-100 transition duration-500 animate-pulse" />
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-[#FF6B00] to-amber-500 rounded-2xl flex items-center justify-center p-1 shadow-2xl transition duration-300 transform group-hover:scale-105 group-hover:rotate-1">
                <div className="relative w-full h-full flex items-center justify-center">
                  <Dribbble className="w-10 h-10 sm:w-12 sm:h-12 animate-spin-slow text-white" />
                  <Coins className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-300 absolute -bottom-1 -right-1 drop-shadow-md" />
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] bg-[#FF6B00]/20 text-[#FF6B00] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider border border-[#FF6B00]/40">
                  Mannschafts-Kasse
                </span>
                <span className="text-xs text-slate-400 font-medium">• BFC Freiburg e.V.</span>
              </div>
              <h1 className="text-2xl md:text-3.5xl font-black text-white tracking-tight mt-1.5 flex items-center gap-2">
                BFC Freiburg Mannschaftskasse
              </h1>
            </div>
          </div>

          {/* Actions & Utilities in Header */}
          <div className="flex flex-wrap gap-2">
            {isAdminMode && (
              <>
                <button
                  onClick={() => setShowBackupPanel(!showBackupPanel)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs animate-fade-in"
                  id="backup-panel-toggle-btn"
                >
                  <Layers className="w-4 h-4 text-[#FF6B00]" />
                  Backup / Export
                </button>
                <button
                  onClick={() => setIsCatalogOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs animate-fade-in"
                  id="catalog-manager-toggle-btn"
                >
                  <Settings className="w-4 h-4 text-[#FF6B00]" />
                  Getränke und Strafenkatalog
                </button>
                <button
                  onClick={() => setIsNotificationPlannerOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs animate-fade-in"
                  id="notification-planner-toggle-btn"
                >
                  <Bell className="w-4 h-4 text-[#FF6B00]" />
                  Erinnerungen
                </button>
                <button
                  onClick={() => setIsResetDbModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-950/40 hover:bg-rose-900/50 text-rose-200 hover:text-rose-100 border border-rose-900/40 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs animate-fade-in"
                  id="reset-db-toggle-btn"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  Daten zurücksetzen (Blanko)
                </button>
              </>
            )}

            {/* Zahlung Button */}
            <button
              onClick={() => {
                setTempPaypalInfo(paypalInfo);
                setTempWeroInfo(weroInfo);
                setIsPaymentModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-950/40 hover:bg-blue-900/50 text-blue-300 border border-blue-900/40 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              id="global-payment-btn"
              title="Zahlungsinfos anzeigen"
            >
              <Coins className="w-4 h-4 text-blue-400" />
              <span>Zahlung</span>
            </button>

            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={requestNotificationPermission}
                className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs ${
                  notifPermission === 'granted' && !areNotificationsMuted
                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-900/40'
                    : notifPermission === 'granted' && areNotificationsMuted
                    ? 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 border-slate-800'
                    : notifPermission === 'denied'
                    ? 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border-rose-900/40'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-800'
                }`}
                title={
                  notifPermission === 'granted' && !areNotificationsMuted
                    ? 'Browser-Benachrichtigungen sind AKTIVIERT 🔔 (Klicken zum Stummschalten)'
                    : notifPermission === 'granted' && areNotificationsMuted
                    ? 'Browser-Benachrichtigungen sind STUMMGESCHALTET 🔕 (Klicken zum Aktivieren)'
                    : notifPermission === 'denied'
                    ? 'Browser-Benachrichtigungen sind BLOCKIERT ❌ (Bitte in den Browser-Einstellungen erlauben)'
                    : 'Browser-Benachrichtigungen aktivieren 🔔'
                }
                id="live-notifs-btn"
              >
                {notifPermission === 'granted' ? (
                  !areNotificationsMuted ? (
                    <>
                      <Bell className="w-4 h-4 text-emerald-400 animate-bounce" />
                      <span>Live-Meldungen: Ein</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 text-slate-500" />
                      <span>Live-Meldungen: Stumm</span>
                    </>
                  )
                ) : notifPermission === 'denied' ? (
                  <>
                    <BellOff className="w-4 h-4 text-rose-400" />
                    <span>Live-Meldungen: Blockiert</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4 text-slate-400" />
                    <span>Live-Meldungen: Aus</span>
                  </>
                )}
              </button>
            )}

            {/* Spieler Button */}
            {isBookingAuthorized ? (
              <button
                onClick={() => {
                  setIsBookingAuthorized(false);
                  setIsAdminMode(false);
                  setShowBackupPanel(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-900/40 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-lock-btn-player"
                title="Spieler-Zugriff sperren"
              >
                <Unlock className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Spieler (Aktiv)</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setPendingAdminAction({ type: 'player_login' });
                  setAdminPromptPin('');
                  setAdminPromptError('');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-unlock-btn-player"
                title="Spieler Log In"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                <span>Spieler (Log In)</span>
              </button>
            )}

            {/* Trainer Button */}
            {isAdminMode ? (
              <button
                onClick={() => {
                  setIsAdminMode(false);
                  setIsBookingAuthorized(false);
                  setShowBackupPanel(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-lock-btn-trainer"
                title="Trainer-Zugriff sperren"
              >
                <Unlock className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Trainer (Aktiv)</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setPendingAdminAction({ type: 'trainer_login' });
                  setAdminPromptPin('');
                  setAdminPromptError('');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                id="global-unlock-btn-trainer"
                title="Trainer Log In"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                <span>Trainer (Log In)</span>
              </button>
            )}

            {isAdminMode && (
              <button
                onClick={() => {
                  setIsNewPlayerModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B00] hover:bg-orange-500 text-white hover:scale-[1.02] font-black rounded-xl text-xs transition transform active:scale-95 cursor-pointer shadow-xs animate-fade-in"
                id="add-player-btn"
              >
                <Plus className="w-4 h-4" />
                Spieler hinzufügen
              </button>
            )}
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
            onClick={() => {
              if (!isEditingCashBalance) {
                setIsExpenseModalOpen(true);
              }
            }}
            className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-emerald-500 hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer group"
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1 group-hover:text-emerald-600 transition-colors">
                <Coins className="w-3 h-3 text-emerald-600" />
                Kassenbestand (Ist)
              </span>
              {isAdminMode && !isEditingCashBalance && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingCashBalance(true);
                    setEditCashBalanceValue(((stats.totalPaid - stats.totalExpenses) + manualCashAdjustment).toFixed(2));
                  }}
                  className="p-1 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-md transition border border-slate-100 cursor-pointer shrink-0"
                  title="Kassenstand manuell anpassen"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
              {!isAdminMode && (
                <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  Verwalten ➔
                </span>
              )}
            </div>
            
            {isEditingCashBalance ? (
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await handleSaveManualCashAdjustment(editCashBalanceValue);
                }}
                onClick={(e) => e.stopPropagation()}
                className="mt-2 flex items-center gap-1"
              >
                <input
                  type="text"
                  autoFocus
                  value={editCashBalanceValue}
                  onChange={(e) => setEditCashBalanceValue(e.target.value)}
                  className="w-24 bg-white border border-slate-200 rounded-md px-2 py-1 text-sm font-mono text-slate-800 focus:outline-none focus:border-emerald-500 text-right font-bold"
                  placeholder="0,00"
                />
                <span className="text-sm font-bold text-slate-500 font-mono">€</span>
                <button
                  type="submit"
                  className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition cursor-pointer shrink-0"
                  title="Speichern"
                >
                  <Save className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingCashBalance(false);
                  }}
                  className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition cursor-pointer shrink-0"
                  title="Abbrechen"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <>
                <p className="text-2xl font-black text-emerald-600 font-mono mt-1">
                  {((stats.totalPaid - stats.totalExpenses) + manualCashAdjustment).toFixed(2)} €
                </p>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Eingezahlt: {stats.totalPaid.toFixed(2)} € • Ausgaben: {stats.totalExpenses.toFixed(2)} €
                </span>
                {manualCashAdjustment !== 0 && (
                  <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded-md mt-1 inline-block font-sans font-medium">
                    ⚠️ Manuell angepasst ({manualCashAdjustment > 0 ? '+' : ''}{manualCashAdjustment.toFixed(2)} €)
                  </span>
                )}
              </>
            )}
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
                    isAdminMode={isAdminMode}
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
              isAdminMode={isAdminMode}
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
        manualCashAdjustment={manualCashAdjustment}
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
      />

      {/* Reset Database / Blank Slate Confirmation Modal */}
      {isResetDbModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="reset-db-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-rose-700 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
                Datenbank nullen &amp; Blanko starten
              </h3>
              <button 
                onClick={() => setIsResetDbModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-slate-700 font-medium leading-relaxed">
                Möchtest du wirklich alle Kontostände und Buchungen zurücksetzen, um <strong>vollkommen leer (Blanko) zu starten</strong>?
              </p>
              
              <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  ⚠️ Folgende Daten werden unwiderruflich gelöscht/zurückgesetzt:
                </p>
                <ul className="list-disc list-inside space-y-0.5 ml-1 mt-1 text-rose-700 font-medium">
                  <li>Alle Getränke-Einträge aller Spieler werden genullt.</li>
                  <li>Alle verhängten Strafen aller Spieler werden genullt.</li>
                  <li>Alle Zahlungen/Beiträge aller Spieler werden genullt (0,00 €).</li>
                  <li>Die gesamte Transaktions-Historie (Zahlungen/Käufe) wird gelöscht.</li>
                  <li>Alle manuellen Vereins-Ausgaben werden gelöscht.</li>
                  <li>Die manuelle Kassen-Korrektur wird auf 0,00 € zurückgesetzt.</li>
                </ul>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Hinweis: Die Grund-Auswahl an Spielern, Getränkepreisen und dem Strafenkatalog bleibt unberührt, sodass du sofort mit dem Testen starten kannst.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setIsResetDbModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={handleWipeDatabase}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Ja, alles nullen (Blanko)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Info Modal (Zahlungsinfos) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="payment-info-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Coins className="w-5 h-5 text-blue-600 animate-pulse" />
                Zahlungsinformationen
              </h3>
              <button 
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setIsEditingPaymentInfo(false);
                  setPaymentPinInput('');
                  setPaymentPinError('');
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditingPaymentInfo ? (
              // EDIT MODE
              <form onSubmit={handleSavePaymentInfo} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      PayPal Link / Info
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00]"
                      placeholder="z.B. https://paypal.me/DeinName oder E-Mail"
                      value={tempPaypalInfo}
                      onChange={(e) => setTempPaypalInfo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Wero Phone/IBAN / Info
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00]"
                      placeholder="z.B. Mobilnummer für Wero oder IBAN"
                      value={tempWeroInfo}
                      onChange={(e) => setTempWeroInfo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingPaymentInfo(false);
                      setPaymentPinInput('');
                      setPaymentPinError('');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-200"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Speichern
                  </button>
                </div>
              </form>
            ) : (
              // VIEW MODE
              <div className="space-y-4">
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl shrink-0 font-bold text-xs">
                      PP
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-extrabold text-slate-900">PayPal</h4>
                      <p className="text-xs text-slate-600 font-medium mt-1 whitespace-pre-wrap break-all">
                        {paypalInfo ? (
                          paypalInfo.startsWith('http') ? (
                            <a 
                              href={paypalInfo} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              {paypalInfo} ↗
                            </a>
                          ) : (
                            paypalInfo
                          )
                        ) : (
                          <span className="text-slate-400 italic">Noch keine PayPal-Infos hinterlegt.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-2"></div>

                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-orange-100 text-orange-600 rounded-xl shrink-0 font-bold text-xs">
                      WR
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-extrabold text-slate-900">Wero</h4>
                      <p className="text-xs text-slate-600 font-medium mt-1 whitespace-pre-wrap break-all">
                        {weroInfo ? (
                          weroInfo
                        ) : (
                          <span className="text-slate-400 italic">Noch keine Wero-Infos hinterlegt.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-between items-center">
                  {isAdminMode ? (
                    <button
                      onClick={() => {
                        setTempPaypalInfo(paypalInfo);
                        setTempWeroInfo(weroInfo);
                        setIsEditingPaymentInfo(true);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Bearbeiten
                    </button>
                  ) : (
                    <div className="w-full space-y-2">
                      <div className="flex gap-2 items-center">
                        <input
                          type="password"
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00]"
                          placeholder="Trainer-PIN eingeben"
                          value={paymentPinInput}
                          onChange={(e) => {
                            setPaymentPinInput(e.target.value);
                            setPaymentPinError('');
                          }}
                        />
                        <button
                          onClick={() => {
                            if (paymentPinInput === '2016') {
                              setTempPaypalInfo(paypalInfo);
                              setTempWeroInfo(weroInfo);
                              setIsEditingPaymentInfo(true);
                              setPaymentPinError('');
                              setPaymentPinInput('');
                            } else {
                              setPaymentPinError('Falscher PIN!');
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                        >
                          Bearbeiten
                        </button>
                      </div>
                      {paymentPinError && (
                        <p className="text-[10px] text-rose-600 font-semibold animate-fade-in">{paymentPinError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin PIN Prompt for Fines/Bookings Booking */}
      {pendingAdminAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in" id="admin-pin-prompt-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#FF6B00]" />
                {['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction', 'record_fine', 'remove_fine', 'bulk_fine', 'record_payment', 'trainer_login'].includes(pendingAdminAction.type)
                  ? 'Trainer-Freigabe erforderlich'
                  : pendingAdminAction.type === 'player_login'
                  ? 'Spieler-Freigabe erforderlich'
                  : 'Freigabe zum Buchen erforderlich'}
              </h3>
              <button
                onClick={() => setPendingAdminAction(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction', 'record_fine', 'remove_fine', 'bulk_fine', 'record_payment', 'trainer_login'].includes(pendingAdminAction.type)
                ? 'Diese Aktion ist nur für Trainer gestattet. Bitte gib den Trainer-PIN ein.'
                : pendingAdminAction.type === 'player_login'
                ? 'Bitte gib das Spieler-Passwort (PIN) ein, um Getränke buchen zu können.'
                : 'Getränke buchen ist passwortgeschützt. Bitte gib das Spieler- oder Trainer-Passwort ein.'}
            </p>

            <form onSubmit={handleAdminPromptSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder={['add_player', 'edit_player', 'delete_player', 'open_catalog', 'add_expense', 'delete_expense', 'revert_transaction', 'record_fine', 'remove_fine', 'bulk_fine', 'record_payment', 'trainer_login'].includes(pendingAdminAction.type)
                    ? 'Trainer-PIN'
                    : 'Spieler- oder Trainer-PIN'}
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
                Getränke- und Strafenkatalog verwalten
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
                      <span><strong>Trainer-Bereich aktiv:</strong> Du kannst nun Getränke-Preise ändern, neue Strafen hinzufügen und den Katalog verwalten.</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsAdminMode(false);
                        setBottomPinError('');
                        setBottomPinInput('');
                      }}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs shrink-0"
                    >
                      Trainer-Sitzung beenden
                    </button>
                  </div>
                  <CatalogManager
                    drinks={drinks}
                    fines={fines}
                    onUpdateDrinks={handleUpdateDrinks}
                    onUpdateFines={handleUpdateFines}
                    onResetToDefaults={handleResetCatalogToDefaults}
                  />
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4 shadow-3xs my-8">
                  <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">🔒 Trainer-Bereich: Katalog verwalten</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Der Getränke- und Strafenkatalog ist aktuell für Mitglieder gesperrt. Gib den Trainer-PIN ein, um Einstellungen vorzunehmen.
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
                        placeholder="Trainer-PIN eingeben"
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

      {/* Modal: Notification Planner & Erinnerungen */}
      {isNotificationPlannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" id="notification-planner-modal">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#FF6B00]" />
                Erinnerungen verwalten
              </h3>
              <button
                onClick={() => setIsNotificationPlannerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Feedback Notice */}
            {notifStatus && (
              <div className={`p-4 rounded-2xl text-xs font-bold transition-all animate-fade-in ${notifStatus.isError ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {notifStatus.text}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1">
              {isAdminMode ? (
                <>
                  <div className="space-y-6">
                    {/* Header of Erinnerungen list */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Aktive Erinnerungen ({schedules.length})</h4>
                        <p className="text-[11px] text-slate-400">Erstelle beliebig viele einmalige oder wiederholende Erinnerungen, die parallel laufen.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSchedule}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#FF6B00] to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs active:scale-95 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        Erinnerung hinzufügen
                      </button>
                    </div>

                    {schedules.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <BellOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-500 font-medium">Bisher wurden keine Erinnerungen erstellt.</p>
                        <button
                          type="button"
                          onClick={handleAddSchedule}
                          className="mt-3 text-xs text-[#FF6B00] font-bold hover:underline"
                        >
                          Jetzt die erste Erinnerung anlegen
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        {schedules.map((sched) => {
                          const rules = getScheduleRules(sched);
                          return (
                            <div key={sched.id} className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4 shadow-3xs hover:shadow-2xs transition flex flex-col justify-between">
                              <div className="space-y-4">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1 min-w-0 pr-2">
                                    <input
                                      type="text"
                                      value={sched.title}
                                      onChange={(e) => {
                                        const updated = { ...sched, title: e.target.value };
                                        setSchedules(schedules.map(s => s.id === sched.id ? updated : s));
                                      }}
                                      className="font-black text-slate-800 text-sm bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#FF6B00] focus:outline-none w-full pb-0.5"
                                      placeholder="Name der Erinnerung..."
                                    />
                                    <p className="text-[11px] text-slate-400 mt-0.5">Erinnerungs-ID: {sched.id}</p>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={sched.isActive} 
                                        onChange={(e) => {
                                          const updated = { ...sched, isActive: e.target.checked };
                                          handleSaveSchedule(updated);
                                        }}
                                        className="sr-only peer" 
                                      />
                                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                      <span className="ml-2 text-[10px] font-bold text-slate-500">{sched.isActive ? 'Aktiv' : 'Inaktiv'}</span>
                                    </label>
                                  </div>
                                </div>

                                {/* Message Editor */}
                                <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Betreff / Titel</label>
                                  <input 
                                    type="text" 
                                    value={sched.title} 
                                    onChange={(e) => {
                                      const updated = { ...sched, title: e.target.value };
                                      setSchedules(schedules.map(s => s.id === sched.id ? updated : s));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF6B00]" 
                                  />

                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2">Meldungstext</label>
                                  <textarea 
                                    value={sched.defaultBody} 
                                    rows={3}
                                    onChange={(e) => {
                                      const updated = { ...sched, defaultBody: e.target.value };
                                      setSchedules(schedules.map(s => s.id === sched.id ? updated : s));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#FF6B00] resize-none" 
                                  />
                                </div>

                                {/* Dynamic Rules Configurator */}
                                <div className="space-y-3 p-3.5 border border-slate-100 rounded-xl bg-white">
                                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <h5 className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                                      Sendezeiten / Pläne ({rules.length})
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newRule = {
                                          id: 'rule-' + Math.random().toString(36).substring(2, 9),
                                          type: 'repeating' as const,
                                          repeatingDay: 'daily' as const,
                                          repeatingTime: '18:00'
                                        };
                                        const updated = {
                                          ...sched,
                                          rules: [...rules, newRule]
                                        };
                                        setSchedules(schedules.map(s => s.id === sched.id ? updated : s));
                                      }}
                                      className="flex items-center gap-1 text-[10px] font-bold text-[#FF6B00] hover:text-orange-600 transition cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Zeit hinzufügen
                                    </button>
                                  </div>

                                  {rules.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 italic text-center py-2">Keine Sendezeiten konfiguriert. Füge eine Sendezeit hinzu.</p>
                                  ) : (
                                    <div className="space-y-3 divide-y divide-slate-100">
                                      {rules.map((rule, idx) => (
                                        <div key={rule.id} className={`pt-2.5 ${idx === 0 ? 'pt-0' : 'pt-2.5'} space-y-2`}>
                                          <div className="flex justify-between items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-400">Zeitplan #{idx + 1}</span>
                                            <div className="flex gap-1 shrink-0 bg-slate-100 p-0.5 rounded-lg">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedRules = rules.map(r => r.id === rule.id ? { ...r, type: 'once' as const, onceDateTime: r.onceDateTime || new Date().toISOString().slice(0, 16) } : r);
                                                  setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                                }}
                                                className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer ${rule.type === 'once' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'}`}
                                              >
                                                Einmalig
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updatedRules = rules.map(r => r.id === rule.id ? { ...r, type: 'repeating' as const, repeatingDay: r.repeatingDay || 'daily', repeatingTime: r.repeatingTime || '18:00' } : r);
                                                  setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                                }}
                                                className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer ${rule.type === 'repeating' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'}`}
                                              >
                                                Wiederholend
                                              </button>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const updatedRules = rules.filter(r => r.id !== rule.id);
                                                setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                              }}
                                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                              title="Zeitplan löschen"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>

                                          {rule.type === 'once' ? (
                                            <div className="space-y-1">
                                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Datum &amp; Uhrzeit</label>
                                              <input 
                                                type="datetime-local" 
                                                value={rule.onceDateTime || ''}
                                                onChange={(e) => {
                                                  const updatedRules = rules.map(r => r.id === rule.id ? { ...r, onceDateTime: e.target.value } : r);
                                                  setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                                }}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#FF6B00] font-mono" 
                                              />
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="space-y-1">
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Intervall / Wochentag</label>
                                                <select
                                                  value={rule.repeatingDay || 'daily'}
                                                  onChange={(e) => {
                                                    const updatedRules = rules.map(r => r.id === rule.id ? { ...r, repeatingDay: e.target.value as any } : r);
                                                    setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                                  }}
                                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6B00]"
                                                >
                                                  <option value="daily">Täglich</option>
                                                  <option value="monday">Montag</option>
                                                  <option value="tuesday">Dienstag</option>
                                                  <option value="wednesday">Mittwoch</option>
                                                  <option value="thursday">Donnerstag</option>
                                                  <option value="friday">Freitag</option>
                                                  <option value="saturday">Samstag</option>
                                                  <option value="sunday">Sonntag</option>
                                                </select>
                                              </div>
                                              <div className="space-y-1">
                                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Uhrzeit</label>
                                                <input 
                                                  type="time" 
                                                  value={rule.repeatingTime || '18:00'}
                                                  onChange={(e) => {
                                                    const updatedRules = rules.map(r => r.id === rule.id ? { ...r, repeatingTime: e.target.value } : r);
                                                    setSchedules(schedules.map(s => s.id === sched.id ? { ...s, rules: updatedRules } : s));
                                                  }}
                                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#FF6B00] font-mono" 
                                                  required
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Tabular History & Next Runs */}
                                <div className="pt-3 border-t border-slate-100 space-y-3">
                                  <div className="grid grid-cols-2 gap-4">
                                    {/* Letzte 3 Läufe */}
                                    <div className="space-y-1.5">
                                      <span className="block text-[9px] text-slate-400 uppercase font-black tracking-wider">Letzte 3 Läufe</span>
                                      <div className="bg-slate-50 border border-slate-100 rounded-lg overflow-hidden">
                                        <table className="w-full text-[10px]">
                                          <tbody>
                                            {(() => {
                                              const hist = sched.history || (sched.lastTriggered ? [sched.lastTriggered] : []);
                                              if (hist.length === 0) {
                                                return (
                                                  <tr>
                                                    <td className="px-2 py-1.5 text-slate-400 italic text-center">Bisher keine Läufe</td>
                                                  </tr>
                                                );
                                              }
                                              return hist.map((timeStr, idx) => (
                                                <tr key={idx} className={idx < hist.length - 1 ? "border-b border-slate-100" : ""}>
                                                  <td className="px-2.5 py-1.5 font-mono text-slate-600 text-left">
                                                    {idx + 1}. {new Date(timeStr).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                                                  </td>
                                                </tr>
                                              ));
                                            })()}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* Nächste 3 Versandläufe */}
                                    <div className="space-y-1.5">
                                      <span className="block text-[9px] text-slate-400 uppercase font-black tracking-wider">Nächste 3 Läufe</span>
                                      <div className="bg-slate-50 border border-slate-100 rounded-lg overflow-hidden">
                                        <table className="w-full text-[10px]">
                                          <tbody>
                                            {(() => {
                                              const nextRuns = calculateNextNRunTimes(sched, 3);
                                              if (nextRuns.length === 0) {
                                                return (
                                                  <tr>
                                                    <td className="px-2 py-1.5 text-slate-400 italic text-center">Nicht aktiv / geplant</td>
                                                  </tr>
                                                );
                                              }
                                              return nextRuns.map((timestamp, idx) => (
                                                <tr key={idx} className={idx < nextRuns.length - 1 ? "border-b border-slate-100" : ""}>
                                                  <td className="px-2.5 py-1.5 font-mono text-emerald-600 font-bold text-left">
                                                    {idx + 1}. {new Date(timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                                                  </td>
                                                </tr>
                                              ));
                                            })()}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
                                <button
                                  type="button"
                                  onClick={() => handleSendNow(sched.id, sched.title, sched.defaultBody)}
                                  className="flex-1 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl text-xs transition cursor-pointer text-center"
                                >
                                  Jetzt senden 📣
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveSchedule(sched)}
                                  className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center"
                                >
                                  Speichern 💾
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSchedule(sched.id)}
                                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs transition cursor-pointer text-center flex items-center justify-center"
                                  title="Löschen"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4 shadow-3xs my-8 animate-fade-in">
                  <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">🔒 Trainer-Bereich: Erinnerungen</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Erinnerungen können nur von Trainern konfiguriert werden. Gib den Trainer-PIN ein, um fortzufahren.
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
                        placeholder="Trainer-PIN eingeben"
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
        </>
      )}

    </div>
  );
}
