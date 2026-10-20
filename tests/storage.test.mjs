import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPlannerStorage, writePlannerStorage } from "../lib/saturn.ts";

const task = { id: "persist-1", title: "Persistence check", time: "13:30", completed: true };

test("tasks, time, completion and mood persist through separate Web Storage processes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "saturn-storage-test-"));
  const file = path.join(directory, "localstorage");
  const moduleUrl = new URL("../lib/saturn.ts", import.meta.url).href;
  const run = (source) => {
    const result = spawnSync(process.execPath, ["--experimental-webstorage", "--localstorage-file", file, "--experimental-strip-types", "--input-type=module", "-e", source], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    run(`import { writePlannerStorage } from ${JSON.stringify(moduleUrl)}; writePlannerStorage(localStorage, ${JSON.stringify([task])}, "Calm");`);
    const restored = JSON.parse(run(`import { readPlannerStorage } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readPlannerStorage(localStorage, ["Calm"])));`));
    assert.deepEqual(restored, { tasks: [task], mood: "Calm" });
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + "saturn-storage-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("corrupt saved data is preserved; denied reads and quota failures are surfaced", () => {
  const data = new Map([["saturn.tasks", "corrupt"], ["saturn.mood", "Calm"]]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.throws(() => readPlannerStorage(storage, ["Calm"]));
  assert.equal(data.get("saturn.tasks"), "corrupt");
  assert.throws(() => readPlannerStorage({ getItem() { throw new DOMException("Denied", "SecurityError"); } }, []), { name: "SecurityError" });
  assert.throws(() => writePlannerStorage({ setItem() { throw new DOMException("Full", "QuotaExceededError"); } }, [task], "Calm"), { name: "QuotaExceededError" });
});

test("empty storage and unknown moods restore safely", () => {
  assert.deepEqual(readPlannerStorage({ getItem: () => null }, ["Calm"]), { tasks: [], mood: "" });
  assert.equal(readPlannerStorage({ getItem: key => key === "saturn.mood" ? "Invalid" : "[]" }, ["Calm"]).mood, "");
});
