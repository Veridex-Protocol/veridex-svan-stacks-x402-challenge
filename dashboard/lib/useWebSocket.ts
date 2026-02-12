"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface WSEvent {
  type: string;
  [key: string]: unknown;
}

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const listenersRef = useRef<Map<string, Set<(e: WSEvent) => void>>>(new Map());

  const on = useCallback((type: string, handler: (e: WSEvent) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;

    function connect() {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as WSEvent;
          setLastEvent(event);
          const handlers = listenersRef.current.get(event.type);
          if (handlers) {
            for (const h of handlers) h(event);
          }
          // Also fire wildcard listeners
          const wildcardHandlers = listenersRef.current.get("*");
          if (wildcardHandlers) {
            for (const h of wildcardHandlers) h(event);
          }
        } catch {
          // ignore non-JSON messages
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [url]);

  return { connected, lastEvent, on };
}
