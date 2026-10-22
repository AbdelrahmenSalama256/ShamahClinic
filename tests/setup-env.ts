import { loadEnv } from '../src/lib/db/load-env';

loadEnv();

// A test must never reach the production marketing site: it is slow, and the answer
// changes whenever an editor publishes there. BK-7.3 removed the live client, so nothing
// reads this for a fetch anymore — it still rewrites snapshot URLs, so point it at a
// closed port and let tests/no-wp-network.test.ts prove no request is ever attempted.
process.env.WP_BASE_URL ||= 'http://127.0.0.1:1';
