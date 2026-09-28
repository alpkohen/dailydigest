const MORNING = ["Good morning", "Rise and shine", "Morning"];
const AFTERNOON = ["Good afternoon", "Hope your day's going well", "Afternoon"];
const EVENING = ["Good evening", "Evening"];
const NIGHT = ["Still up?", "Burning the midnight oil", "Working late"];

function poolForHour(hour: number): string[] {
  if (hour < 5) return NIGHT;
  if (hour < 12) return MORNING;
  if (hour < 18) return AFTERNOON;
  if (hour < 23) return EVENING;
  return NIGHT;
}

// A fixed 🌸 on every greeting got old fast - this pool picks a different,
// lighthearted one each time instead, independent of which phrase gets
// picked.
const EMOJIS = ["😊", "✨", "☕", "🎉", "😄", "🙌", "🌟", "😉", "🫶", "🎈", "🚀", "🤓"];

function pickEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!;
}

export function pickGreeting(name: string): string {
  const pool = poolForHour(new Date().getHours());
  const phrase = pool[Math.floor(Math.random() * pool.length)];
  return `${phrase}, ${name} ${pickEmoji()}.`;
}

// Archived briefs aren't "today", so a time-of-day phrase ("Good morning")
// would be wrong regardless of the clock - this pool is date-neutral
// instead, and still picks a different one on every visit (see TodayView's
// isToday branch) so an old brief doesn't just say a flat "World Brief."
const ARCHIVE = ["Welcome back", "Good to see you", "Stepping into the archive", "Back for more", "Catching up", "Revisiting the past"];

export function pickArchiveGreeting(name: string): string {
  const phrase = ARCHIVE[Math.floor(Math.random() * ARCHIVE.length)];
  return `${phrase}, ${name} ${pickEmoji()}.`;
}
