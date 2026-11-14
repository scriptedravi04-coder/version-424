import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const LoadingContext = createContext();

export const useLoading = () => useContext(LoadingContext);

export const LoadingProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const delayTimerRef = useRef(null);
  const safetyTimerRef = useRef(null);
  const finishTimerRef = useRef(null);
  const visibleRef = useRef(false); // is the bar on screen right now?

  const startLoading = useCallback(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
    }
    // Only show loader if the operation takes longer than 250ms
    delayTimerRef.current = setTimeout(() => {
      visibleRef.current = true;
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      setIsLoading(true);
      setIsFinishing(false);
    }, 250);
    // (The loader used to be a full-screen blur; it is a 2px top bar now, but keep the cap.)
    // The full-screen loader blurs the WHOLE app. If a request hangs and stopLoading never runs,
    // the app used to stay blocked (settings pages, the old inbox). Never longer than 12 s.
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      setIsLoading(false);
      visibleRef.current = false;
      setIsFinishing(false);
    }, 12000);
  }, []);

  const stopLoading = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    // Finish animation (session 23): the bar runs to 100% and fades, then unmounts. It used to set
    // isFinishing true and false in the same tick, so the finish never played. Only when the bar
    // was actually visible — a fast call that never showed it stays invisible.
    if (visibleRef.current) {
      setIsFinishing(true);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => setIsFinishing(false), 250);
    }
    visibleRef.current = false;
    setIsLoading(false);
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading, startLoading, stopLoading, isFinishing }}>
      {children}
    </LoadingContext.Provider>
  );
};
