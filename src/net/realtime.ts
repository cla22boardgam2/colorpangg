import mqtt from 'mqtt';
import type { NetMessage } from './protocol';
import { createIdFactory } from './room';

/**
 * 실시간 통신 채널 (13개의 증거 RealtimeChannel 이식)
 * 1. 개인 서버 WebSocket (localStorage 'colorpang_relay_server' 또는 개인 서버에서 열린 페이지)
 * 2. 공용 MQTT 클라우드 (기본: EMQX → 실패 시 HiveMQ)
 * 3. BroadcastChannel (같은 기기 여러 탭 테스트용, ?nobc 로 끔)
 * 같은 메시지가 여러 통로로 와도 _id로 한 번만 처리한다.
 */

export const RELAY_KEY = 'colorpang_relay_server';
const CLIENT_KEY = 'colorpang_client_id';
const TOPIC_PREFIX = 'colorpang_v1/room_';

declare global {
  interface Window {
    __COLORPANG_RELAY__?: boolean;
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

function loadClientId(): string {
  const saved = safeGet(CLIENT_KEY);
  if (saved) return saved;
  const id = 'c_' + Math.random().toString(36).slice(2, 10);
  safeSet(CLIENT_KEY, id);
  return id;
}

/** 탭마다 다른 id가 필요할 때(같은 PC 여러 탭 테스트)는 ?tab=1 처럼 붙이면 sessionStorage 기준으로 분리 */
function resolveClientId(): string {
  const params = new URLSearchParams(window.location.search);
  if (params.has('tab')) {
    try {
      const k = 'colorpang_tab_client_id';
      const saved = sessionStorage.getItem(k);
      if (saved) return saved;
      const id = 'c_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(k, id);
      return id;
    } catch {
      /* fallthrough */
    }
  }
  return loadClientId();
}

export const CLIENT_ID: string = resolveClientId();

/** 개인 서버에서 열린 페이지면 같은 주소의 웹소켓, 아니면 저장된 주소, 둘 다 없으면 null(공용 클라우드) */
export function relayUrl(): string | null {
  const saved = safeGet(RELAY_KEY);
  if (saved && saved.trim()) return saved.trim();
  if (typeof window !== 'undefined' && window.__COLORPANG_RELAY__) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return null;
}

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

type Wrapped = NetMessage & { _sender: string; _id: string };

export class RealtimeChannel {
  private roomId: string;
  private clientId: string;
  private mqttClient: mqtt.MqttClient | null = null;
  private customWs: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private listeners: ((m: NetMessage) => void)[] = [];
  private statusListeners: ((online: boolean, provider: string) => void)[] = [];
  private isConnected = false;
  private isDestroyed = false;
  private queue: Wrapped[] = [];
  private activeProvider = '연결 중...';
  private nextId: () => string;
  private seen = new Set<string>();
  private seenOrder: string[] = [];

  constructor(roomId: string, clientId: string = CLIENT_ID) {
    this.roomId = roomId;
    this.clientId = clientId;
    this.nextId = createIdFactory(clientId);
    if (!new URLSearchParams(window.location.search).has('nobc')) this.initBroadcastChannel();
    const relay = relayUrl();
    if (relay) this.initCustomWebSocket(relay);
    else this.initMqtt(0);
  }

  private get topic() {
    return TOPIC_PREFIX + this.roomId;
  }

  private receive(raw: unknown) {
    const m = raw as Wrapped;
    if (!m || typeof m !== 'object' || !m.type || !m._id) return;
    if (m._sender === this.clientId) return;
    if (this.seen.has(m._id)) return;
    this.seen.add(m._id);
    this.seenOrder.push(m._id);
    if (this.seenOrder.length > 2000) this.seen.delete(this.seenOrder.shift()!);
    this.listeners.forEach((l) => {
      try {
        l(m);
      } catch (err) {
        console.error('listener error', err);
      }
    });
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel('colorpang_v1_room_' + this.roomId);
      this.bc.onmessage = (e) => this.receive(e.data);
    } catch (err) {
      console.warn('BroadcastChannel error', err);
    }
  }

  private initCustomWebSocket(url: string) {
    if (this.isDestroyed) return;
    try {
      const ws = new WebSocket(url);
      this.customWs = ws;
      this.activeProvider = '개인 서버';
      ws.onopen = () => {
        if (this.isDestroyed) return;
        this.isConnected = true;
        this.notifyStatus();
        ws.send(JSON.stringify({ action: 'join', roomId: this.roomId }));
        this.flushQueue();
      };
      ws.onmessage = (e) => {
        try {
          this.receive(JSON.parse(e.data));
        } catch {
          /* 무시 */
        }
      };
      ws.onclose = () => {
        this.isConnected = false;
        this.activeProvider = '개인 서버 재연결 중...';
        this.notifyStatus();
        if (!this.isDestroyed) setTimeout(() => this.initCustomWebSocket(url), 3000);
      };
      ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn('WebSocket init error', err);
    }
  }

  private initMqtt(brokerIdx: number) {
    if (this.isDestroyed) return;
    const url = BROKERS[brokerIdx % BROKERS.length];
    this.activeProvider = brokerIdx % BROKERS.length === 0 ? '공용 클라우드 (EMQX)' : '공용 클라우드 (HiveMQ)';
    try {
      const client = mqtt.connect(url, {
        clientId: `colorpang_${this.clientId}_${Math.random().toString(16).slice(2, 6)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 4000,
      });
      this.mqttClient = client;
      // 학교 방화벽이 연결을 조용히 막으면 error가 오지 않을 수 있어서, 8초 안에 한 번도 연결되지 않으면 다음 중계소로 전환
      let everConnected = false;
      let switched = false;
      const switchBroker = () => {
        if (switched || everConnected || this.isDestroyed) return;
        switched = true;
        client.end(true);
        setTimeout(() => this.initMqtt(brokerIdx + 1), 500);
      };
      const fallbackTimer = setTimeout(switchBroker, 8000);
      client.on('connect', () => {
        if (this.isDestroyed) {
          client.end(true);
          return;
        }
        everConnected = true;
        clearTimeout(fallbackTimer);
        client.subscribe(this.topic, { qos: 1 }, (err) => {
          if (err) return;
          this.isConnected = true;
          this.notifyStatus();
          this.flushQueue();
        });
      });
      client.on('message', (_t, payload) => {
        try {
          this.receive(JSON.parse(payload.toString()));
        } catch {
          /* 무시 */
        }
      });
      client.on('error', () => {
        clearTimeout(fallbackTimer);
        switchBroker();
      });
      client.on('close', () => {
        if (!this.isConnected) return;
        this.isConnected = false;
        this.notifyStatus();
      });
      client.on('reconnect', () => {
        this.activeProvider = '재연결 중...';
        this.notifyStatus();
      });
    } catch (err) {
      console.warn('MQTT connect error', err);
    }
  }

  private flushQueue() {
    const items = this.queue;
    this.queue = [];
    items.forEach((m) => this.sendToNetwork(m));
  }

  private sendToNetwork(m: Wrapped) {
    if (this.customWs && this.customWs.readyState === WebSocket.OPEN) {
      try {
        this.customWs.send(JSON.stringify({ action: 'broadcast', roomId: this.roomId, data: m }));
      } catch {
        /* 무시 */
      }
    }
    if (this.mqttClient && this.isConnected) {
      try {
        this.mqttClient.publish(this.topic, JSON.stringify(m), { qos: 1 });
      } catch (err) {
        console.warn('MQTT publish error', err);
      }
    }
  }

  publish(message: NetMessage) {
    const wrapped: Wrapped = { ...message, _sender: this.clientId, _id: this.nextId() };
    if (this.bc) {
      try {
        this.bc.postMessage(wrapped);
      } catch {
        /* 무시 */
      }
    }
    if (this.isConnected) this.sendToNetwork(wrapped);
    else {
      this.queue.push(wrapped);
      if (this.queue.length > 50) this.queue.shift();
    }
  }

  subscribe(cb: (m: NetMessage) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  onStatus(cb: (online: boolean, provider: string) => void) {
    this.statusListeners.push(cb);
    cb(this.isConnected, this.activeProvider);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb);
    };
  }

  private notifyStatus() {
    this.statusListeners.forEach((l) => {
      try {
        l(this.isConnected, this.activeProvider);
      } catch {
        /* 무시 */
      }
    });
  }

  destroy() {
    this.isDestroyed = true;
    this.isConnected = false;
    try {
      this.mqttClient?.end(true);
    } catch {
      /* 무시 */
    }
    try {
      this.customWs?.close();
    } catch {
      /* 무시 */
    }
    try {
      this.bc?.close();
    } catch {
      /* 무시 */
    }
    this.mqttClient = null;
    this.customWs = null;
    this.bc = null;
    this.listeners = [];
    this.statusListeners = [];
    this.queue = [];
  }
}
