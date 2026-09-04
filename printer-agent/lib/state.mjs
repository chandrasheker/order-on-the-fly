import fs from "node:fs";
import path from "node:path";

export function jobStatePath(stateDir, deliveryKey) {
  const safe = String(deliveryKey).replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(stateDir, "jobs", `${safe}.json`);
}

export function readJobState(stateDir, deliveryKey) {
  const file = jobStatePath(stateDir, deliveryKey);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeJobState(stateDir, deliveryKey, record) {
  const file = jobStatePath(stateDir, deliveryKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const payload = JSON.stringify({ ...record, deliveryKey, updatedAt: new Date().toISOString() });
  fs.writeFileSync(tmp, payload);
  try {
    const fd = fs.openSync(tmp, "r+");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch {
    /* fsync is best-effort */
  }
  fs.renameSync(tmp, file);
}
