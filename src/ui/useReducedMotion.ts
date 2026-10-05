import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// "Remove animations" in Android accessibility settings turns our pulses off.
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => alive && setReduced(v))
      .catch(() => alive && setReduced(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
};
