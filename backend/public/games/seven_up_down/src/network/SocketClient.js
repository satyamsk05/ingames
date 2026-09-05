class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = [];
  }

  connect() {
    if (typeof window === 'undefined') return;

    const tryConnect = () => {
      if (window.io) {
        let token = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          token = urlParams.get('token') || localStorage.getItem('ingames_token');
        } catch (_) {}

        this.socket = window.io({
          auth: token ? { token } : {},
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
          this.connected = true;
          console.log('[7 Up Down Real-time Socket Connected]');
        });

        this.socket.on('disconnect', () => {
          this.connected = false;
        });

        // Attach queued listeners
        this.listeners.forEach(({ event, callback }) => {
          this.socket.on(event, callback);
        });
      } else {
        setTimeout(tryConnect, 300);
      }
    };

    tryConnect();
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    this.listeners.push({ event, callback });
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
}

export const socketClient = new SocketClient();
