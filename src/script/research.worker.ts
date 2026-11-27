import { executeStrategy } from './strategyExecution';

self.onmessage = (event) => {
  try {
    const { bars, snapshot, options } = event.data;
    self.postMessage({ result: executeStrategy(bars, snapshot, options) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
