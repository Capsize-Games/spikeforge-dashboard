import { useEffect, useRef, useState } from "react";

import { accessToken } from "../accessToken";
import type { ServerMsg } from "../types";

const RETRY_MS = 1500;

/** Own the sockets and retries created by one effect generation. */
export function useSocketConnection(onMessage: (msg: ServerMsg) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const connect = () => {
      if (disposed) return;
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const token = accessToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : "";
      const ws = new WebSocket(`${protocol}://${location.host}/ws${query}`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setUnauthorized(false);
      };
      ws.onmessage = (event) => {
        if (disposed) return;
        onMessageRef.current(JSON.parse(event.data as string) as ServerMsg);
      };
      ws.onerror = () => {
        if (!disposed) ws.close();
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setConnected(false);
        // Repeating an authentication rejection cannot repair the token.
        if (event.code === 1008) {
          setUnauthorized(true);
          return;
        }
        timer = window.setTimeout(connect, RETRY_MS);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      const ws = wsRef.current;
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return { wsRef, connected, unauthorized };
}
