import { useEffect, useState } from 'react';

export const EXPENSE_CATEGORIES = [
  'Fuel', 'Toll', 'Food', 'Accommodation', 'Maintenance',
  'Loading', 'Offloading', 'Driver Allowance', 'Parking', 'Other',
];

const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseForm({ initialValue, onSubmit, onCancel, submitting }) {
  const [category, setCategory] = useState('Fuel');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialValue) {
      setCategory(initialValue.category || 'Fuel');
      setDescription(initialValue.description || '');
      setAmount(initialValue.amount ?? '');
      setExpenseDate(initialValue.expense_date ? String(initialValue.expense_date).slice(0, 10) : today());
    }
  }, [initialValue?.id]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setError('');
    onSubmit({ category, description: description || null, amount: Number(amount), expense_date: expenseDate });
  }

  const editing = !!initialValue;
  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && <div className="fm-badge fm-badge-red" style={{ display: 'block', marginBottom: 12, padding: 10 }}>{error}</div>}
      <div className="fm-form-grid">
        <div className="fm-field"><label htmlFor="ex-category">Category</label><select id="ex-category" className="fm-select" value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="fm-field"><label htmlFor="ex-amount">Amount (MWK)</label><input id="ex-amount" type="number" min="0.01" step="0.01" className="fm-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="fm-field"><label htmlFor="ex-date">Date</label><input id="ex-date" type="date" className="fm-input" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
        <div className="fm-field"><label htmlFor="ex-desc">Description</label><input id="ex-desc" className="fm-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {onCancel && <button type="button" className="fm-btn fm-btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>}
        <button type="submit" className="fm-btn fm-btn-primary" disabled={submitting}>{submitting ? 'Saving…' : editing ? 'Save expense' : 'Add expense'}</button>
      </div>
    </form>
  );
}
