"use client";

import {
  BrainCircuit,
  CalendarDays,
  Check,
  Clock3,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  LocateFixed,
  MapPin,
  Orbit,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Snowflake,
  Sparkles,
  TimerReset,
  Trash2,
  Wind,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { type Task, to24Hour, normalizeTaskTime, sortTasks, readPlannerStorage, writePlannerStorage, remainingSeconds, weatherValues } from "@/lib/saturn";

type Place = { name: string; latitude: number; longitude: number; admin1?: string; country?: string };

type Weather = {
  location: string;
  temperature: number;
  apparent: number;
  code: number;
  high: number;
  low: number;
  precipitation: number | null;
  updated: string;
  wind: number;
};

type Fortune = {
  message: string;
  source: "ai" | "built-in";
};

type ModelContextLike = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: {
        readOnlyHint?: boolean;
        untrustedContentHint?: boolean;
      };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const MOODS = [
  { emoji: "😌", label: "Calm" },
  { emoji: "🙂", label: "Good" },
  { emoji: "😐", label: "Okay" },
  { emoji: "😵‍💫", label: "Scattered" },
  { emoji: "😮‍💨", label: "Tired" },
];

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
const FOCUS_SECONDS = 25 * 60;
const BREATH_SECONDS = 60;
const BREATH_PHASES = ["Inhale", "Hold", "Exhale", "Rest"];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatTaskTime(value: string) {
  const normalized = normalizeTaskTime(value);
  if (!normalized) return "Anytime";
  const [hour, minute] = normalized.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getWeatherLabel(code: number) {
  if (code === 0) return "Clear skies";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Misty";
  if (code <= 67 || (code >= 80 && code <= 82)) return "Rainy";
  if (code <= 77 || code === 85 || code === 86) return "Snowy";
  if (code >= 95) return "Stormy";
  return "Changing skies";
}

function WeatherIcon({ code, className = "" }: { code: number; className?: string }) {
  if (code === 0) return <CloudSun className={className} aria-hidden="true" />;
  if (code <= 3) return <CloudSun className={className} aria-hidden="true" />;
  if (code <= 48) return <CloudFog className={className} aria-hidden="true" />;
  if (code <= 67 || (code >= 80 && code <= 82)) {
    return <CloudRain className={className} aria-hidden="true" />;
  }
  if (code <= 77 || code === 85 || code === 86) {
    return <Snowflake className={className} aria-hidden="true" />;
  }
  if (code >= 95) return <CloudLightning className={className} aria-hidden="true" />;
  return <CloudSun className={className} aria-hidden="true" />;
}

async function requestFortune(question: string): Promise<Fortune> {
  const endpoint = typeof __SATURN_AFFIRMATION_URL__ === "undefined" ? "/api/affirmation" : __SATURN_AFFIRMATION_URL__;
  if (!endpoint) {
    return { message: "Start with one small, kind step. You can find your way forward without knowing every answer.", source: "built-in" };
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error("Saturn could not answer right now.");
  return (await response.json()) as Fortune;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskHour, setTaskHour] = useState("9");
  const [taskMinute, setTaskMinute] = useState("00");
  const [taskPeriod, setTaskPeriod] = useState("AM");
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");
  const storageReady = useRef(false);
  const [deletedTask, setDeletedTask] = useState<Task | null>(null);
  const [mood, setMood] = useState("");

  const [city, setCity] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Use your location or search a city.");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [weatherStale, setWeatherStale] = useState(false);

  const [focusSeconds, setFocusSeconds] = useState(FOCUS_SECONDS);
  const [focusRunning, setFocusRunning] = useState(false);

  const focusDeadline = useRef(0);
  const breathDeadline = useRef(0);
  const [breathComplete, setBreathComplete] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [breathRemaining, setBreathRemaining] = useState(BREATH_SECONDS);

  const [question, setQuestion] = useState("");
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [fortuneError, setFortuneError] = useState("");
  const [asking, setAsking] = useState(false);

  const [dateLabel, setDateLabel] = useState("Today");
  const [clockLabel, setClockLabel] = useState("--:-- --");
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    const updateDateAndTime = () => {
      const now = new Date();
      setDateLabel(
        now.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
      );
      setClockLabel(
        now.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      );
      const hour = now.getHours();
      setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    };

    updateDateAndTime();
    const clockInterval = window.setInterval(updateDateAndTime, 30_000);

    // Browser-only hydration intentionally happens after the server render.
    const restore = () => { try {
      const saved = readPlannerStorage(localStorage, MOODS.map(item => item.label));
      setTasks(saved.tasks);
      setMood(saved.mood);
      storageReady.current = true;
    } catch {
      setStorageError("Saved data could not be read. Your previous data is untouched; changes in this session may not survive closing Saturn.");
    } finally {
      setHydrated(true);
    } };
    restore();

    return () => window.clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (!hydrated || !storageReady.current) return;
    const persist = () => { try {
      writePlannerStorage(localStorage, tasks, mood);
      setStorageError("");
    } catch {
      setStorageError("Changes could not be saved on this device. Keep this tab open and free up browser storage before trying again.");
    } };
    persist();
  }, [hydrated, tasks, mood]);

  useEffect(() => {
    if (!focusRunning) return;
    const tick = () => {
      const remaining = remainingSeconds(focusDeadline.current);
      setFocusSeconds(remaining);
      if (!remaining) setFocusRunning(false);
    };
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [focusRunning]);

  useEffect(() => {
    if (!breathing) return;
    const interval = window.setInterval(() => {
      const remaining = remainingSeconds(breathDeadline.current);
      setBreathRemaining(remaining);
      if (!remaining) { setBreathing(false); setBreathComplete(true); }
    }, 250);
    return () => window.clearInterval(interval);
  }, [breathing]);

  const loadWeather = useCallback(async (latitude: number, longitude: number, location: string) => {
    setWeatherLoading(true);
    setWeatherStatus("Checking the sky…");
    setPlaces([]);
    setSelectedPlace({ name: location, latitude, longitude });
    try {
      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        timezone: "auto",
        forecast_days: "1",
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Weather request failed");
      const values = weatherValues(await response.json());
      setWeather({ location, ...values, updated: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }) });
      setWeatherStale(false);
      setWeatherStatus("");
    } catch {
      setWeatherStale(true);
      setWeatherStatus("Weather is unavailable. Check your connection and refresh, or choose another city.");
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setWeatherStatus("Search a city to see today’s weather.");
      return;
    }
    setWeatherLoading(true);
    setWeatherStatus("Finding your local weather…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void loadWeather(position.coords.latitude, position.coords.longitude, "Current location");
      },
      (error) => {
        setWeatherLoading(false);
        setWeatherStatus(error.code === 1 ? "Location permission was denied. Search a city below instead." : "Your location could not be found. Search a city below instead.");
      },
      { timeout: 8000 },
    );
  }, [loadWeather]);

  const searchWeather = async (event: FormEvent) => {
    event.preventDefault();
    const query = city.trim();
    if (!query) return;
    setWeatherLoading(true);
    setWeatherStatus("Finding that city…");
    setPlaces([]);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw new Error("City search failed");
      const data = (await response.json()) as {
        results?: Array<{
          name: string;
          admin1?: string;
          country?: string;
          latitude: number;
          longitude: number;
        }>;
      };
      const results = (data.results ?? []).filter((place) => typeof place.name === "string" && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
      setPlaces(results);
      setWeatherStatus(results.length ? "Choose your location below." : "No matching cities. Check the spelling or try a nearby city.");
      setWeatherLoading(false);
    } catch {
      setWeatherStatus("City search didn’t connect. Try again in a moment.");
      setWeatherLoading(false);
    }
  };

  const addTask = useCallback((title: string, time = "") => {
    const cleaned = title.trim();
    if (!cleaned) return null;
    const task: Task = {
      id: makeId(),
      title: cleaned.slice(0, 100),
      time: normalizeTaskTime(time),
      completed: false,
    };
    setTasks((current) => sortTasks([...current, task]));
    return task;
  }, []);

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    const time = to24Hour(taskHour, taskMinute, taskPeriod);
    if (!addTask(taskTitle, time)) return;
    setTaskTitle("");
  };

  const toggleTask = (id: string) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)),
    );
  };

  const removeTask = (id: string) => {
    setDeletedTask(tasks.find((task) => task.id === id) ?? null);
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  const askSaturn = useCallback(async (prompt: string) => {
    const cleaned = prompt.trim();
    if (!cleaned) throw new Error("Ask Saturn a question first.");
    setAsking(true);
    setFortuneError("");
    try {
      const answer = await requestFortune(cleaned.slice(0, 240));
      setFortune(answer);
      return answer;
    } catch {
      const answer: Fortune = { message: "Start with one small, kind step. You can find your way forward without knowing every answer.", source: "built-in" };
      setFortune(answer);
      setFortuneError("Saturn could not connect. Here is some offline encouragement instead.");
      return answer;
    } finally {
      setAsking(false);
    }
  }, []);

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await askSaturn(question);
      setQuestion("");
    } catch {
      // The inline message explains what needs attention.
    }
  };

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool(
        {
          name: "add_plan_item",
          title: "Add plan item",
          description: "Add one item to today’s Saturn plan and show it in the visible task list.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", minLength: 1, maxLength: 100 },
              time: {
                type: "string",
                description: "Optional time in 12-hour format, such as 9:30 AM.",
                pattern: "^(1[0-2]|[1-9]):[0-5][0-9] ?([AaPp][Mm])$",
              },
            },
            required: ["title"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const candidate = input as { title?: unknown; time?: unknown };
            if (typeof candidate.title !== "string" || !candidate.title.trim()) {
              throw new Error("title is required");
            }
            const requestedTime = typeof candidate.time === "string" ? candidate.time : "";
            const normalizedTime = normalizeTaskTime(requestedTime);
            if (requestedTime && !normalizedTime) throw new Error("Use a time like 9:30 AM");
            const task = addTask(candidate.title, normalizedTime);
            if (!task) throw new Error("Could not add that plan item");
            return {
              id: task.id,
              title: task.title,
              time: formatTaskTime(task.time),
              status: "added",
            };
          },
        },
        { signal: lifecycle.signal },
      );

      await modelContext.registerTool(
        {
          name: "ask_saturn",
          title: "Ask Saturn",
          description: "Ask Saturn’s positive Magic 8 Ball a question and show its supportive answer.",
          inputSchema: {
            type: "object",
            properties: { question: { type: "string", minLength: 1, maxLength: 240 } },
            required: ["question"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute(input) {
            const candidate = input as { question?: unknown };
            if (typeof candidate.question !== "string" || !candidate.question.trim()) {
              throw new Error("question is required");
            }
            const answer = await askSaturn(candidate.question);
            return { answer: answer.message, source: answer.source };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [addTask, askSaturn]);

  const completedTasks = tasks.filter((task) => task.completed).length;
  const focusProgress = ((FOCUS_SECONDS - focusSeconds) / FOCUS_SECONDS) * 100;
  const breathElapsed = BREATH_SECONDS - breathRemaining;
  const breathPhase = BREATH_PHASES[Math.floor((breathElapsed % 16) / 4)];
  const selectedMood = MOODS.find((item) => item.label === mood);

  const planSummary = useMemo(() => {
    if (!tasks.length) return "Your day is open. Add one thing that matters.";
    if (completedTasks === tasks.length) return "Everything is complete. Let the day feel lighter.";
    return `${tasks.length - completedTasks} item${tasks.length - completedTasks === 1 ? "" : "s"} left today.`;
  }, [completedTasks, tasks.length]);

  return (
    <main className="saturn-app">
      <a className="skip-link" href="#today">Skip to daily plan</a>
      <div className="app-shell">
        <section className="main-stage">
          <nav className="top-nav" aria-label="Main navigation">
            <a className="brand" href="#"><span className="brand-mark"><Orbit aria-hidden="true" /></span><strong>Saturn<span> A little space for you.</span></strong></a>
            <div><a href="#today">Daily plan</a><a href="#reset">Reset tools</a><a href="#ask-saturn">Ask Saturn</a></div>
            <time className="nav-clock">{clockLabel}</time>
          </nav>
          <header className="page-header">
            <div>
              <p className="eyebrow">Your space for today</p>
              <h1>{greeting}</h1>
              <p className="header-note">Make room for progress and a little calm.</p>
            </div>
            <div className="header-status">
              <div className="date-pill"><CalendarDays aria-hidden="true" /><span>{dateLabel}</span></div>
              <a className="mood-pill" href="#mood-check">
                <span>{selectedMood?.emoji ?? "✦"}</span>
                <span>{mood || "Check in"}</span>
              </a>
            </div>
          </header>

          {storageError && <p className="storage-notice" role="alert">{storageError}</p>}
          <div className="overview-grid">
            <section className="surface planner-surface" tabIndex={-1} id="today" aria-labelledby="planner-heading">
              <div className="surface-heading planner-heading">
                <div>
                  <p className="section-kicker">Daily plan</p>
                  <h2 id="planner-heading">Today’s orbit</h2>
                  <p>{planSummary}</p>
                </div>
                <span className="task-count">{tasks.length} planned</span>
              </div>

              <form className="task-composer" onSubmit={submitTask}>
                <label className="sr-only" htmlFor="task-title">New plan item</label>
                <Input
                  id="task-title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="What would make today feel successful?"
                  maxLength={100}
                  className="saturn-input task-title-input"
                />

                <div className="time-picker" role="group" aria-label="Task time">
                  <span className="time-picker-icon"><Clock3 aria-hidden="true" /></span>
                  <Select name="task-hour" value={taskHour} onValueChange={(value) => value && setTaskHour(value)}>
                    <SelectTrigger className="time-select" aria-label="Hour"><SelectValue /></SelectTrigger>
                    <SelectContent className="saturn-select-menu">
                      {HOURS.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="time-colon">:</span>
                  <Select name="task-minute" value={taskMinute} onValueChange={(value) => value && setTaskMinute(value)}>
                    <SelectTrigger className="time-select minute-select" aria-label="Minute"><SelectValue /></SelectTrigger>
                    <SelectContent className="saturn-select-menu">
                      {MINUTES.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select name="task-period" value={taskPeriod} onValueChange={(value) => value && setTaskPeriod(value)}>
                    <SelectTrigger className="time-select period-select" aria-label="AM or PM"><SelectValue /></SelectTrigger>
                    <SelectContent className="saturn-select-menu">
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="primary-button" disabled={!hydrated || !taskTitle.trim()}>
                  <Plus aria-hidden="true" />
                  Add task
                </Button>
              </form>

              <p className="save-status">{hydrated ? storageError ? "Session only · saving needs attention" : "Saved on this device · your plan stays until you clear it" : "Loading your saved plan…"}</p>
              <div className="list-meta">
                <span>Schedule</span>
                <span>{completedTasks}/{tasks.length} complete</span>
              </div>

              <Progress value={tasks.length ? completedTasks / tasks.length * 100 : 0} aria-label="Daily plan completion" className="plan-progress" />
              <div className="task-list" aria-live="polite">
                {tasks.length === 0 ? (
                  <div className="empty-plan">
                    <span><Check aria-hidden="true" /></span>
                    <h3>Nothing scheduled yet</h3>
                    <p>Add one small task to begin your day.</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <article className={`task-row${task.completed ? " task-complete" : ""}`} key={task.id}>
                      <Checkbox
                        id={`task-${task.id}`}
                        checked={task.completed}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="task-checkbox"
                      />
                      <label htmlFor={`task-${task.id}`} className="task-copy">
                        <span>{task.title}</span>
                        <small>{task.completed ? "Completed" : "Ready when you are"}</small>
                      </label>
                      <time dateTime={task.time || undefined}>{formatTaskTime(task.time)}</time>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="task-delete"
                        onClick={() => removeTask(task.id)}
                        aria-label={`Remove ${task.title}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </article>
                  ))
                )}
              </div>
              {deletedTask && <div className="undo-notice" role="status"><span>Removed “{deletedTask.title}”</span><button type="button" onClick={() => { setTasks((current) => sortTasks([...current, deletedTask])); setDeletedTask(null); }}>Undo</button></div>}
            </section>

            <aside className="dashboard-rail" aria-label="Weather and mood">
              <section className="surface weather-surface" aria-labelledby="weather-heading">
                <div className="surface-heading compact-heading">
                  <div>
                    <p className="section-kicker">Outside now</p>
                    <h2 id="weather-heading">Weather</h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="location-button"
                    onClick={useMyLocation}
                    disabled={weatherLoading}
                  >
                    <LocateFixed aria-hidden="true" />
                    <span>Use location</span>
                  </Button>
                </div>

                {weather ? (
                  <div className="weather-reading">
                    <div className="weather-hero">
                      <WeatherIcon code={weather.code} className="weather-icon" />
                      <div>
                        <strong>{weather.temperature}°<small>F</small></strong>
                        <span>{getWeatherLabel(weather.code)}</span>
                      </div>
                    </div>
                    <p className="weather-place"><MapPin aria-hidden="true" /> {weather.location}</p>
                    <div className="weather-metrics">
                      <div><span>High / Low</span><strong>{weather.high}° / {weather.low}°</strong></div>
                      <div><span>Rain</span><strong>{weather.precipitation === null ? "Unavailable" : `${weather.precipitation}%`}</strong></div>
                      <div><span>Wind</span><strong>{weather.wind} mph</strong></div>
                    </div>
                    <p className="feels-like">Feels like {weather.apparent}°F · {weatherStale ? "Last successful update" : "Updated"} {weather.updated}</p>
                  </div>
                ) : (
                  <div className="weather-placeholder">
                    <span><CloudSun aria-hidden="true" /></span>
                    <h3>Your local outlook</h3><p>Search your city or share your location to see what the day has in store.</p>
                  </div>
                )}

                {selectedPlace && <button className="refresh-weather" disabled={weatherLoading} type="button" onClick={() => void loadWeather(selectedPlace.latitude, selectedPlace.longitude, selectedPlace.name)}><RefreshCw aria-hidden="true" />Refresh weather</button>}
                <form className="city-search" onSubmit={searchWeather}>
                  <label className="sr-only" htmlFor="city">Search city</label>
                  <Input
                    id="city"
                    maxLength={100}
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Search a city"
                    className="saturn-input"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="search-button"
                    aria-label="Search weather"
                    disabled={weatherLoading || !city.trim()}
                  >
                    {weatherLoading ? <RefreshCw className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                  </Button>
                </form>
                <p className="inline-status" role="status">{weatherStatus}</p>
                {places.length > 0 && <ul className="city-results" aria-label="Matching cities">{places.map((place) => {
                  const name = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
                  return <li key={`${place.latitude}-${place.longitude}`}><button type="button" disabled={weatherLoading} onClick={() => { void loadWeather(place.latitude, place.longitude, name); setCity(""); }}><MapPin aria-hidden="true" />{name}</button></li>;
                })}</ul>}
                <a className="weather-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo ↗</a>
              </section>

              <section className="surface mood-surface" id="mood-check" aria-labelledby="mood-heading">
                <div className="surface-heading compact-heading">
                  <div>
                    <p className="section-kicker">Quick check-in</p>
                    <h2 id="mood-heading">How are you?</h2>
                  </div>
                  <span className="mood-current">{selectedMood?.emoji ?? "✦"}</span>
                </div>
                <div className="mood-options" role="group" aria-label="Choose your mood">
                  {MOODS.map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      className={`mood-option${mood === item.label ? " selected" : ""}`}
                      onClick={() => setMood(item.label)}
                      aria-label={item.label}
                      aria-pressed={mood === item.label}
                    >
                      <span>{item.emoji}</span>
                      <small>{item.label}</small>
                    </button>
                  ))}
                </div>
                <p className="mood-note">
                  {mood ? `You’re feeling ${mood.toLowerCase()}. Thanks for checking in.` : "No fixing—just notice where you are."}
                </p>
              </section>
            </aside>
          </div>

          <section className="reset-section" id="reset" aria-labelledby="reset-heading">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Reset tools</p>
                <h2 id="reset-heading">Pause without losing momentum.</h2>
              </div>
              <p>Choose what you need right now.</p>
            </div>

            <div className="reset-grid">
              <article className="surface tool-card focus-card">
                <div className="tool-card-heading">
                  <span className="tool-icon coral"><TimerReset aria-hidden="true" /></span>
                  <div><small>25-minute session</small><h3>Focus timer</h3></div>
                </div>
                <div className="focus-time">{formatTimer(focusSeconds)}</div>
                <Progress value={focusProgress} className="focus-progress" aria-label="Focus session progress" />
                <p className="timer-status" role="status">{focusSeconds === 0 ? "Session complete. Give yourself a moment to rest." : focusRunning ? "One thing at a time. You’ve got this." : "Make a little room for deep work."}</p>
                <div className="tool-actions">
                  <Button
                    type="button"
                    className="primary-button"
                    onClick={() => { if (!focusRunning) focusDeadline.current = Date.now() + focusSeconds * 1000; else setFocusSeconds(remainingSeconds(focusDeadline.current)); setFocusRunning(!focusRunning); }}
                    disabled={focusSeconds === 0}
                  >
                    {focusRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                    {focusSeconds === 0
                      ? "Complete"
                      : focusRunning
                        ? "Pause"
                        : focusSeconds === FOCUS_SECONDS
                          ? "Start focus"
                          : "Resume"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="icon-button"
                    onClick={() => {
                      setFocusRunning(false);
                      setFocusSeconds(FOCUS_SECONDS);
                    }}
                    aria-label="Reset focus timer"
                  >
                    <RefreshCw aria-hidden="true" />
                  </Button>
                </div>
              </article>

              <article className="surface tool-card breathing-card">
                <div className="tool-card-heading">
                  <span className="tool-icon mint"><Wind aria-hidden="true" /></span>
                  <div><small>60-second reset</small><h3>Box breathing</h3></div>
                </div>
                <div aria-live="polite" className={`breath-visual ${breathing ? breathPhase.toLowerCase() : "idle"}`}>
                  <span className="breath-ring" aria-hidden="true" />
                  <span className="breath-core" aria-hidden="true" />
                  <strong>{breathing ? breathPhase : breathComplete ? "Well done" : breathRemaining < BREATH_SECONDS ? "Paused" : "Ready"}</strong>
                  <small aria-hidden="true">{breathing ? `${breathRemaining} seconds` : "4 · 4 · 4 · 4"}</small>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="secondary-button"
                  onClick={() => { if (!breathing) { const seconds = breathRemaining || BREATH_SECONDS; setBreathRemaining(seconds); breathDeadline.current = Date.now() + seconds * 1000; setBreathComplete(false); } else setBreathRemaining(remainingSeconds(breathDeadline.current)); setBreathing(!breathing); }}
                >
                  {breathing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {breathing ? "Pause breathing" : breathComplete ? "Breathe again" : breathRemaining < BREATH_SECONDS ? "Continue" : "Begin breathing"}
                </Button>
              </article>

              <article className="surface tool-card fortune-card" id="ask-saturn">
                <div className="tool-card-heading fortune-heading">
                  <span className="tool-icon violet"><BrainCircuit aria-hidden="true" /></span>
                  <div><small>Positive Magic 8 Ball</small><h3>Ask Saturn</h3></div>
                </div>

                <div className="fortune-window" aria-live="polite">
                  <span className="fortune-orbit"><Orbit aria-hidden="true" /></span>
                  <div>
                    <p>{asking ? "Reading the rings…" : fortune?.message ?? "Ask what’s on your mind. Saturn will answer with an encouraging next step."}</p>
                    {fortune ? <small>{fortune.source === "ai" ? "AI-generated encouragement" : "Built-in encouragement"}</small> : null}
                  </div>
                </div>

                <p className="fortune-note">A playful nudge, not a prediction.</p>
                <form className="fortune-form" onSubmit={submitQuestion}>
                  <label className="sr-only" htmlFor="saturn-question">Ask Saturn a question</label>
                  <Input
                    id="saturn-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Will I make progress today?"
                    maxLength={240}
                    className="saturn-input"
                  />
                  <Button type="submit" className="violet-button" disabled={asking || !question.trim()}>
                    <Sparkles aria-hidden="true" />
                    Ask
                  </Button>
                </form>
                {fortuneError ? <p className="form-error" role="alert">{fortuneError}</p> : null}
              </article>
            </div>
          </section>

          <footer className="app-footer">
            <span><Orbit aria-hidden="true" /> Saturn</span>
            <p>Plan gently. Move steadily.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}
