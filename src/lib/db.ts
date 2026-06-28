import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  getDocs,
  query,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Player, Drink, Fine, Transaction, Expense, Notification } from '../types';

// Helper to check if database is empty
export async function isDatabaseEmpty(): Promise<boolean> {
  const path = 'players';
  try {
    const q = query(collection(db, path), limit(1));
    const snapshot = await getDocs(q);
    return snapshot.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return true;
  }
}

// Seed the database with initial demo data
export async function seedDatabase(
  players: Player[], 
  drinks: Drink[], 
  fines: Fine[], 
  transactions: Transaction[], 
  expenses: Expense[]
) {
  try {
    const batch = writeBatch(db);

    // Seed drinks
    drinks.forEach(drink => {
      const dRef = doc(db, 'drinks', drink.id);
      batch.set(dRef, drink);
    });

    // Seed fines
    fines.forEach(fine => {
      const fRef = doc(db, 'fines', fine.id);
      batch.set(fRef, fine);
    });

    // Seed players
    players.forEach(player => {
      const pRef = doc(db, 'players', player.id);
      batch.set(pRef, player);
    });

    // Seed transactions
    transactions.forEach(tx => {
      const tRef = doc(db, 'transactions', tx.id);
      batch.set(tRef, tx);
    });

    // Seed expenses
    expenses.forEach(expense => {
      const eRef = doc(db, 'expenses', expense.id);
      batch.set(eRef, expense);
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed_database');
  }
}

// Player CRUD
export async function dbSavePlayer(player: Player): Promise<void> {
  const path = `players/${player.id}`;
  try {
    await setDoc(doc(db, 'players', player.id), player);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeletePlayer(playerId: string): Promise<void> {
  const path = `players/${playerId}`;
  try {
    await deleteDoc(doc(db, 'players', playerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Drink CRUD
export async function dbSaveDrink(drink: Drink): Promise<void> {
  const path = `drinks/${drink.id}`;
  try {
    await setDoc(doc(db, 'drinks', drink.id), drink);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteDrink(drinkId: string): Promise<void> {
  const path = `drinks/${drinkId}`;
  try {
    await deleteDoc(doc(db, 'drinks', drinkId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Fine CRUD
export async function dbSaveFine(fine: Fine): Promise<void> {
  const path = `fines/${fine.id}`;
  try {
    await setDoc(doc(db, 'fines', fine.id), fine);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteFine(fineId: string): Promise<void> {
  const path = `fines/${fineId}`;
  try {
    await deleteDoc(doc(db, 'fines', fineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Transaction CRUD
export async function dbSaveTransaction(tx: Transaction): Promise<void> {
  const path = `transactions/${tx.id}`;
  try {
    await setDoc(doc(db, 'transactions', tx.id), tx);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteTransaction(txId: string): Promise<void> {
  const path = `transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Expense CRUD
export async function dbSaveExpense(expense: Expense): Promise<void> {
  const path = `expenses/${expense.id}`;
  try {
    await setDoc(doc(db, 'expenses', expense.id), expense);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteExpense(expenseId: string): Promise<void> {
  const path = `expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Notification CRUD
export async function dbSaveNotification(notif: Notification): Promise<void> {
  const path = `notifications/${notif.id}`;
  try {
    await setDoc(doc(db, 'notifications', notif.id), notif);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function dbDeleteNotification(notifId: string): Promise<void> {
  const path = `notifications/${notifId}`;
  try {
    await deleteDoc(doc(db, 'notifications', notifId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


// Atomic Bulk Operation: Write transactions and update players in a single batch
export async function dbBulkBook(
  txs: Transaction[], 
  updatedPlayers: Player[]
): Promise<void> {
  try {
    const batch = writeBatch(db);

    txs.forEach(tx => {
      const txRef = doc(db, 'transactions', tx.id);
      batch.set(txRef, tx);
    });

    updatedPlayers.forEach(player => {
      const pRef = doc(db, 'players', player.id);
      batch.set(pRef, player);
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bulk_booking');
  }
}

// Revert/Delete Transaction and Update Player atomically
export async function dbRevertTransaction(
  txId: string, 
  updatedPlayer: Player
): Promise<void> {
  try {
    const batch = writeBatch(db);

    const txRef = doc(db, 'transactions', txId);
    batch.delete(txRef);

    const pRef = doc(db, 'players', updatedPlayer.id);
    batch.set(pRef, updatedPlayer);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `revert_transaction_${txId}`);
  }
}

// Import all data at once (replaces existing or merges)
export async function dbImportAllData(
  players: Player[], 
  drinks: Drink[], 
  fines: Fine[], 
  transactions: Transaction[], 
  expenses: Expense[]
): Promise<void> {
  try {
    // Delete existing records first
    const batch = writeBatch(db);

    // Note: Due to Firestore limits on batch size (500), we can write the new documents directly.
    // If there's an existing document with the same ID, set() with overwrite will replace it.
    drinks.forEach(drink => {
      batch.set(doc(db, 'drinks', drink.id), drink);
    });

    fines.forEach(fine => {
      batch.set(doc(db, 'fines', fine.id), fine);
    });

    players.forEach(player => {
      batch.set(doc(db, 'players', player.id), player);
    });

    transactions.forEach(tx => {
      batch.set(doc(db, 'transactions', tx.id), tx);
    });

    expenses.forEach(expense => {
      batch.set(doc(db, 'expenses', expense.id), expense);
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'import_all_data');
  }
}
