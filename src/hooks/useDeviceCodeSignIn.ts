import { useCallback, useEffect, useRef, useState } from "react";

import type { DeviceCodeStart, DeviceCodeStatusKind } from "../authTypes";

function bridge() {
  return typeof window === "undefined" ? undefined : window.spikeforgeAuth;
}

/**
 * The device-code fallback (`start` shows the code and activation link;
 * `status` reflects what main's polling loop reports).
 *
 * `onGranted` is read through a ref so callers can pass an inline closure
 * without re-subscribing on every render.
 */
export function useDeviceCodeSignIn(onGranted: () => void) {
  const [info, setInfo] = useState<DeviceCodeStart | null>(null);
  const [status, setStatus] = useState<DeviceCodeStatusKind | null>(null);
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.onDeviceCodeStatus((update) => {
      setStatus(update.status);
      if (update.status === "granted") onGrantedRef.current();
    });
  }, []);

  const start = useCallback(() => {
    const api = bridge();
    if (!api) return;
    setStatus(null);
    api.startDeviceCode().then(setInfo);
  }, []);

  const cancel = useCallback(() => {
    bridge()?.cancelDeviceCode();
    setInfo(null);
    setStatus(null);
  }, []);

  return { info, status, start, cancel };
}
