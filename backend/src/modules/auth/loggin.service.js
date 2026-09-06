const EventSourceModule = require('eventsource');
const EventSourceClass = EventSourceModule.EventSource || EventSourceModule.default || EventSourceModule;
global.EventSource = EventSourceClass;
globalThis.EventSource = EventSourceClass;

const { loggin } = require('@loggin/sdk');

class LogginService {
  static getAppKey() {
    const key = process.env.LOGGIN_APP_KEY;
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('LOGGIN_APP_KEY is missing in backend/.env file.');
    }
    return key.trim();
  }

  static createToken() {
    const appKey = LogginService.getAppKey();
    return loggin.createToken(appKey);
  }

  static async waitForVerify(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('INVALID_TOKEN');
    }
    return await loggin.waitForVerify(token);
  }
}

module.exports = LogginService;
