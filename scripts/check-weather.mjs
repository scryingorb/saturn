import assert from "node:assert/strict";
import { weatherValues } from "../lib/saturn.ts";

const geocoding = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=San%20Francisco&count=5&language=en&format=json", { signal: AbortSignal.timeout(20000) });
assert.equal(geocoding.status, 200);
const { results } = await geocoding.json();
const place = results.find(item => item.country_code === "US" && item.admin1 === "California");
assert.ok(place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
const params = new URLSearchParams({
  latitude: String(place.latitude), longitude: String(place.longitude),
  current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
  daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "auto", forecast_days: "1",
});
const forecast = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(20000) });
assert.equal(forecast.status, 200);
const values = weatherValues(await forecast.json());
console.log(JSON.stringify({ location: `${place.name}, ${place.admin1}`, ...values }));
console.log("Live geocoding and forecast passed using Saturn's units and parser.");
