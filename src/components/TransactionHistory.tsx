import React, { useState } from 'react';
import { Transaction } from '../types';
import { FileText, Search, Trash2, Calendar, RefreshCw, X, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onRevertTransaction: (id: string) => void;
}

export default function TransactionHistory({ transactions, onRevertTransaction }: TransactionHistoryProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'drink' | 'fine' | 'payment'>('all');
  const [showStornoConfirm, setShowStornoConfirm] = useState<string | null>(null);

  // Filter transactions
  const filteredTransactions = transactions
    .filter((tx) => {
      const matchesSearch = tx.playerName.toLowerCase().includes(search.toLowerCase()) || 
                            tx.itemName.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || tx.type === filterType;
      return matchesSearch && matchesType;
    })
    // Sort by date newest first
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Show last 30 transactions
  const displayedTransactions = filteredTransactions.slice(0, 30);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" id="transaction-history-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-[#FF6B00] w-4 h-4" />
            Aktivitäts-Protokoll
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Historie aller getätigten Buchungen und Einzahlungen.
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4" id="history-filters">
        <div className="relative">
          <input
            type="text"
            placeholder="Spieler oder Posten suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF6B00] placeholder:text-slate-400 shadow-2xs"
          />
          <Search className="absolute left-3 top-2.5 text-slate-400 w-3.5 h-3.5" />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          {(['all', 'drink', 'fine', 'payment'] as const).map((type) => {
            const labels = { all: 'Alle', drink: 'Getränke', fine: 'Strafen', payment: 'Zahlung' };
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase transition cursor-pointer ${
                  filterType === type
                    ? 'bg-[#FF6B00] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {labels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1" id="transactions-list">
        {displayedTransactions.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 border border-slate-150 rounded-2xl text-slate-400 text-xs">
            Keine Einträge für diese Filter-Auswahl gefunden.
          </div>
        ) : (
          displayedTransactions.map((tx) => {
            const isPayment = tx.type === 'payment';
            const totalVal = tx.amount * tx.quantity;

            return (
              <div
                key={tx.id}
                className="group flex items-center justify-between p-3 bg-white border border-slate-100 hover:bg-slate-50/70 rounded-xl transition shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0">
                    {isPayment ? (
                      <ArrowDownCircle className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <ArrowUpCircle className="w-6 h-6 text-[#FF6B00]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 block">
                      {tx.playerName}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>{tx.type === 'drink' ? '🍺' : tx.type === 'fine' ? '📜' : '💵'} {tx.itemName}</span>
                      {tx.quantity > 1 && (
                        <span className="bg-slate-100 border border-slate-200 text-slate-600 font-mono px-1 rounded">
                          {tx.quantity}x
                        </span>
                      )}
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-[9px]">
                        {new Date(tx.timestamp).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold text-xs ${
                        isPayment ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isPayment ? '-' : '+'}{totalVal.toFixed(2)} €
                    </span>
                  </div>

                  {/* Storno Action */}
                  <div className="relative shrink-0">
                    {showStornoConfirm === tx.id ? (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1.5 shadow-lg z-10 shrink-0">
                        <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap px-1">Sicher?</span>
                        <button
                          onClick={() => {
                            onRevertTransaction(tx.id);
                            setShowStornoConfirm(null);
                          }}
                          className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold cursor-pointer"
                        >
                          Stornieren
                        </button>
                        <button
                          onClick={() => setShowStornoConfirm(null)}
                          className="p-0.5 text-slate-400 hover:text-slate-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowStornoConfirm(tx.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Buchung stornieren"
                        id={`storno-btn-${tx.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filteredTransactions.length > 30 && (
        <p className="text-center text-[10px] text-slate-400 mt-2 font-mono">
          Zeige die letzten 30 von {filteredTransactions.length} Einträgen
        </p>
      )}
    </div>
  );
}
