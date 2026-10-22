import { loadEnv } from '../src/lib/db/load-env';

loadEnv();

// A test must never reach the production marketing site: it is slow, and the answer
// changes whenever an editor publishes there. With no origin to talk to, the
// fallback rung reads the committed snapshot — which is the thing worth testing.
// The short timeout only bounds how long that refusal takes to notice.
process.env.WP_BASE_URL ||= 'http://127.0.0.1:1';
process.env.WP_FETCH_TIMEOUT_MS ||= '750';
