export interface Drink {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface Fine {
  id: string;
  name: string;
  amount: number;
  isActive: boolean;
}

export interface Player {
  id: string;
  name: string;
  number?: string; // Trikotnummer (jersey number)
  drinksCount: { [drinkId: string]: number }; // drinkId -> quantity
  finesCount: { [fineId: string]: number }; // fineId -> quantity
  totalPaid: number; // total money paid/settled by this player
  team?: 'Herren 1' | 'Herren 2'; // Mannschafts-Filter (Legacy/Single team)
  teams?: ('Herren 1' | 'Herren 2')[]; // Mannschafts-Filter (Multi-team)
}

export interface Transaction {
  id: string;
  playerId: string;
  playerName: string;
  type: 'drink' | 'fine' | 'payment';
  itemId?: string; // drinkId or fineId
  itemName: string; // name of drink, fine or "Zahlung"
  amount: number; // cost per item or payment amount
  quantity: number; // e.g. 1 for fines, dynamic for drinks, or 1 for payments
  timestamp: string; // ISO string
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  notes?: string;
  createdBy?: string; // e.g., 'Admin' / 'Vorstand'
}

export interface ClubStats {
  totalRevenue: number;
  totalPaid: number;
  totalExpenses: number; // total spent from cash register
  totalOutstanding: number;
  drinksServed: number;
  finesIssuedCount: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'manual' | 'scheduled';
  scheduledTime?: string; // ISO string
  targetTeam: 'all' | 'Herren 1' | 'Herren 2';
  createdAt: string;
  sent: boolean;
  sentAt?: string;
  weeklyInterval?: string; // e.g. "Mittwoch 22:30"
}

export interface PushSubscriptionData {
  id: string;
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
  subscribedAt: string;
  userAgent: string;
}

export interface NotificationSchedule {
  id: string; // 'kontostand' or 'getraenke'
  title: string;
  defaultBody: string;
  isActive: boolean;
  type: 'once' | 'repeating';
  onceDateTime?: string; // "YYYY-MM-DDTHH:MM"
  repeatingDay?: 'daily' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  repeatingTime?: string; // "HH:MM"
  lastTriggered?: string; // ISO string of last trigger
  nextRunTime?: number; // millisecond timestamp of next run
}


