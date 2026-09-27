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

export function pickGreeting(name: string): string {
  const pool = poolForHour(new Date().getHours());
  const phrase = pool[Math.floor(Math.random() * pool.length)];
  return `${phrase}, ${name} 🌸.`;
}
