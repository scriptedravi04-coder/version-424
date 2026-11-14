import { useCallback, useRef, useState } from "react";

// Session 23 — loading rule for BUTTON ACTIONS (see docs/code/ARCHITECTURE.md "Loading states").
// A save / OTP send / logout / approve must NOT call startLoading(): that shows the global bar
// for a local action. Instead the tapped button disables itself and shows <ButtonSpinner />.
//
//   const { isBusy, anyBusy, run } = useBusy();
//   const save = () => run("save", async () => { ...await api... });
//   <button disabled={anyBusy} onClick={save}>{isBusy("save") ? <ButtonSpinner /> : "Save"}</button>
//
// run() ignores a second tap on the same key while the first is still running (no double
// submits), always clears the key (even on error), and returns the action's result.
export default function useBusy() {
  const [keys, setKeys] = useState(() => new Set());
  const live = useRef(new Set());

  const run = useCallback(async (key, fn) => {
    if (live.current.has(key)) return undefined;
    live.current.add(key);
    setKeys(new Set(live.current));
    try {
      return await fn();
    } finally {
      live.current.delete(key);
      setKeys(new Set(live.current));
    }
  }, []);

  // For handlers that already have try/finally: begin(key) where startLoading() was, end(key)
  // where stopLoading() was.
  const begin = useCallback((key) => { live.current.add(key); setKeys(new Set(live.current)); }, []);
  const end = useCallback((key) => { live.current.delete(key); setKeys(new Set(live.current)); }, []);

  const isBusy = useCallback((key) => keys.has(key), [keys]);
  return { isBusy, anyBusy: keys.size > 0, run, begin, end };
}
