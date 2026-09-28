"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "./actions";

export function SettingsForm({
  language,
  timezone,
  quietStart,
  quietEnd,
  dailyBudgetUsd,
  interestProfile,
}: {
  language: string;
  timezone: string;
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
        <span className="field-label">Language</span>
        <select name="language" defaultValue={language} className="select">
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Timezone</span>
        <input name="timezone" defaultValue={timezone} className="input" />
      </label>
      <div className="field">
        <span className="field-label">Brief delivery time</span>
        <div className="input" style={{ display: "flex", alignItems: "center", color: "var(--text-dim)" }}>
          05:30 (Europe/Istanbul) &middot; fixed
        </div>
      </div>
      <label className="field">
        <span className="field-label">Quiet hours start</span>
        <input name="quiet_start" type="time" defaultValue={quietStart} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Quiet hours end</span>
        <input name="quiet_end" type="time" defaultValue={quietEnd} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Daily LLM budget (USD)</span>
        <input name="daily_budget_usd" type="number" step="0.5" min="0" defaultValue={dailyBudgetUsd} className="input" />
      </label>
      <label className="field">
        <span className="field-label">Interest profile (guides outside-radar picks)</span>
        <textarea name="interest_profile" defaultValue={interestProfile} rows={3} className="textarea" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Saving..." : "Save"}
      </button>
      {saved && <span className="text-accent" style={{ fontSize: 13 }}>Saved.</span>}
      {error && <span className="text-danger" style={{ fontSize: 13 }}>{error}</span>}
    </form>
  );
}
