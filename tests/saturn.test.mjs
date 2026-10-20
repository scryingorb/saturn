import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskTime, parseTasks, remainingSeconds, weatherValues } from "../lib/saturn.ts";

test("12-hour scheduling handles noon, midnight, and invalid times", () => {
  assert.equal(normalizeTaskTime("12:05 AM"), "00:05");
  assert.equal(normalizeTaskTime("12:05 PM"), "12:05");
  assert.equal(normalizeTaskTime("9:30 pm"), "21:30");
  for (const time of ["24:00", "13:00 PM", "9:99 AM", "garbage"]) assert.equal(normalizeTaskTime(time), "");
});

test("saved tasks round-trip completion and normalize legacy times in schedule order", () => {
  const tasks = [{ id: "a", title: "Walk", time: "1:00 PM", completed: true }, { id: "b", title: "Read", time: "09:00", completed: false }];
  const restored = parseTasks(JSON.stringify(tasks));
  assert.equal(restored[0].id, "b");
  assert.equal(restored[1].time, "13:00");
  assert.equal(restored[1].completed, true);
  assert.deepEqual(parseTasks(JSON.stringify(restored)), restored);
  assert.deepEqual(parseTasks("[]"), []);
});

test("corrupt saved data fails explicitly rather than silently losing it", () => {
  for (const data of ["null", "{}", "invalid", '[{"id":"a"}]', '[{"id":"a","title":" ","time":"","completed":false}]']) {
    assert.throws(() => parseTasks(data));
  }
  const item = { id: "a", title: "Read", time: "09:00", completed: false };
  assert.throws(() => parseTasks(JSON.stringify([item, item])));
});

test("timers catch up after background suspension without becoming negative", () => {
  assert.equal(remainingSeconds(26000, 1000), 25);
  assert.equal(remainingSeconds(26000, 24501), 2);
  assert.equal(remainingSeconds(26000, 30000), 0);
});

test("missing weather is never converted to fabricated zero values", () => {
  const data = { current: { temperature_2m: 71.8, apparent_temperature: 70, weather_code: 0, wind_speed_10m: 3 }, daily: { temperature_2m_max: [75], temperature_2m_min: [60], precipitation_probability_max: [null] } };
  assert.equal(weatherValues(data).temperature, 72);
  assert.equal(weatherValues(data).precipitation, null);
  assert.throws(() => weatherValues({ ...data, current: { ...data.current, temperature_2m: null } }));
  assert.throws(() => weatherValues({}));
});

test("weather rejects non-finite values and missing daily measurements", () => {
  const data = { current: { temperature_2m: 71, apparent_temperature: 70, weather_code: 0, wind_speed_10m: 3 }, daily: { temperature_2m_max: [75], temperature_2m_min: [60] } };
  for (const invalid of [NaN, Infinity, -Infinity, "71", undefined]) {
    assert.throws(() => weatherValues({ ...data, current: { ...data.current, temperature_2m: invalid } }));
  }
  assert.throws(() => weatherValues({ ...data, daily: {} }));
  assert.equal(weatherValues(data).precipitation, null);
});
