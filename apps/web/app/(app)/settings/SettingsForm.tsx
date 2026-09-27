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
      style={{ display: "grid", gap: 12, maxWidth: 360, fontSize: 14 }}
    >
      <label>
        Dil
        <select name="language" defaultValue={language} style={{ display: "block", width: "100%", padding: 6 }}>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        Saat dilimi
        <input name="timezone" defaultValue={timezone} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <label>
        Brief gönderim saati
        <input name="brief_time" type="time" defaultValue={briefTime} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <label>
        Sessiz saatler başlangıç
        <input name="quiet_start" type="time" defaultValue={quietStart} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <label>
        Sessiz saatler bitiş
        <input name="quiet_end" type="time" defaultValue={quietEnd} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <label>
        Günlük LLM bütçesi (USD)
        <input name="daily_budget_usd" type="number" step="0.5" min="0" defaultValue={dailyBudgetUsd} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <label>
        İlgi profili (outside radar seçimini yönlendirir)
        <textarea name="interest_profile" defaultValue={interestProfile} rows={3} style={{ display: "block", width: "100%", padding: 6 }} />
      </label>
      <button type="submit" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Kaydediliyor..." : "Kaydet"}
      </button>
      {saved && <span style={{ color: "#2a7" }}>Kaydedildi.</span>}
      {error && <span style={{ color: "#c00" }}>{error}</span>}
    </form>
  );
}
