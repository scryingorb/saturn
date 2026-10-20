export type Task = { id: string; title: string; time: string; completed: boolean };

export function to24Hour(hour: string, minute: string, period: string) {
  return `${String(Number(hour) % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`;
}

export function normalizeTaskTime(value: string) {
  const cleaned = value.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^(1[0-2]|[1-9]):([0-5]\d)\s*([AP]M)$/i);
  return match ? to24Hour(match[1], match[2], match[3].toUpperCase()) : "";
}

export function sortTasks(items: Task[]) {
  return [...items].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
}

// Reject corrupt storage as a whole so it is never silently overwritten.
export function parseTasks(raw: string): Task[] {
  const value: unknown = JSON.parse(raw);
  const ids = new Set<string>();
  if (!Array.isArray(value) || !value.every((task) => {
    if (!task || typeof task.id !== "string" || !task.id || ids.has(task.id) ||
        typeof task.title !== "string" || !task.title.trim() || task.title.length > 100 ||
        typeof task.completed !== "boolean" || typeof task.time !== "string" ||
        (task.time !== "" && !normalizeTaskTime(task.time))) return false;
    ids.add(task.id);
    return true;
  })) throw new Error("Saved plan could not be read.");
  return sortTasks(value.map((task) => ({ ...task, time: normalizeTaskTime(task.time) })));
}

export function readPlannerStorage(storage: Pick<Storage, "getItem">, allowedMoods: string[]) {
  const rawTasks = storage.getItem("saturn.tasks");
  const rawMood = storage.getItem("saturn.mood");
  return {
    tasks: rawTasks ? parseTasks(rawTasks) : [],
    mood: rawMood && allowedMoods.includes(rawMood) ? rawMood : "",
  };
}

export function writePlannerStorage(storage: Pick<Storage, "setItem">, tasks: Task[], mood: string) {
  storage.setItem("saturn.tasks", JSON.stringify(tasks));
  storage.setItem("saturn.mood", mood);
}

export function remainingSeconds(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function weatherValues(data: unknown) {
  const value = data as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> };
  const number = (input: unknown) => {
    if (typeof input !== "number" || !Number.isFinite(input)) throw new Error("Weather data is incomplete.");
    return Math.round(input);
  };
  return {
    temperature: number(value?.current?.temperature_2m),
    apparent: number(value?.current?.apparent_temperature),
    code: number(value?.current?.weather_code),
    wind: number(value?.current?.wind_speed_10m),
    high: number(value?.daily?.temperature_2m_max?.[0]),
    low: number(value?.daily?.temperature_2m_min?.[0]),
    precipitation: value?.daily?.precipitation_probability_max?.[0] == null
      ? null : number(value.daily.precipitation_probability_max[0]),
  };
}
