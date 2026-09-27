"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "./actions";

export function SettingsForm({
  language,
  timezone,
  briefTime,
  quietStart,
  quietEnd,
  dailyBudgetUsd,
  interestProfile,
}: {
  language: string;
  timezone: string;
  briefTime: string;
  quietStart: string;
  quietEnd: string;
  dailyBudgetUsd: number;
  interestProfile: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const result = await saveSettingsAction(formData);
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
      style={{ display: "grid", gap: 16, maxWidth: 380 }}
    >
      <label className="field">
        <span className="field-label">Dil</span>
        <select name="language" defaultValue={language} className="select">
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Saat dilimi</span>
        <input name="timezone" defaultValue={timezone} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Brief gönderim saati</span>
        <input name="brief_time" type="time" defaultValue={briefTime} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Sessiz saatler başlangıç</span>
        <input name="quiet_start" type="time" defaultValue={quietStart} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Sessiz saatler bitiş</span>
        <input name="quiet_end" type="time" defaultValue={quietEnd} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Günlük LLM bütçesi (USD)</span>
        <input name="daily_budget_usd" type="number" step="0.5" min="0" defaultValue={dailyBudgetUsd} className="input" />
      </label>
      <label className="field">
        <span className="field-label">İlgi profili (outside radar seçimini yönlendirir)</span>
        <textarea name="interest_profile" defaultValue={interestProfile} rows={3} className="textarea" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Kaydediliyor..." : "Kaydet"}
      </button>
      {saved && <span className="text-accent" style={{ fontSize: 13 }}>Kaydedildi.</span>}
      {error && <span className="text-danger" style={{ fontSize: 13 }}>{error}</span>}
    </form>
  );
}
