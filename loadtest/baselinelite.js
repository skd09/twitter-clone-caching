// Latency baseline for the Lite server (lg_lite_server, Sail on port 80).
//
//   k6 run loadtest/baselinelite.js
//   k6 run -e VUS=50 -e SCENARIOS=sanity,details,imok loadtest/baselinelite.js
//
// Fixtures come from loadtest/lite-fixtures.json (active lites with a room).
// Regenerate them from the lg_lite_server checkout with:
//   ./vendor/bin/sail exec -T laravel.test php artisan tinker --execute="
//     \$rows = \App\Models\v4\Lite::where('active',1)->whereNotNull('room_id')
//         ->inRandomOrder()->limit(300)->get(['id','imsi'])
//         ->map(fn(\$l)=>['id'=>(int)\$l->id,'imsi'=>(string)\$l->imsi])->values();
//     file_put_contents('/var/www/html/lite-fixtures.json', json_encode(['lites'=>\$rows]));"
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { sanityPayload, imsiPayload, liteIdPayload } from './lib/lite-codec.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1';
const API_VERSION = Number(__ENV.API_VERSION || 4);
const VUS = Number(__ENV.VUS || 20);

// Read-mostly endpoints by default. The write-heavy ones (imok, smoke, lid)
// mutate alerts and fire push notifications, so opt in explicitly and only
// against a throwaway database.
const SCENARIOS = (__ENV.SCENARIOS || 'sanity,details').split(',').map((s) => s.trim());

const lites = new SharedArray('lites', () => JSON.parse(open('./lite-fixtures.json')).lites);

// One trend per endpoint: a shared http_req_duration hides which call is slow.
const sanityLatency = new Trend('lite_sanity_duration', true);
const detailsLatency = new Trend('lite_details_duration', true);
const imokLatency = new Trend('lite_imok_duration', true);

export const options = {
    stages: [
        { duration: '10s', target: VUS },
        { duration: '30s', target: VUS },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.99'],
        // Lite devices poll on a timer, so tail latency is what matters.
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        'lite_sanity_duration': ['p(95)<500'],
        'lite_details_duration': ['p(95)<500'],
        'lite_imok_duration': ['p(95)<500'],
    },
};

function post(path, body, name) {
    return http.post(`${BASE_URL}${path}`, body, {
        headers: { 'Content-Type': 'text/plain' },
        tags: { name },
    });
}

// /api/9 reads the payload off the request body even though it is a GET,
// so it cannot go through http.get().
function getWithBody(path, body, name) {
    return http.request('GET', `${BASE_URL}${path}`, body, {
        headers: { 'Content-Type': 'text/plain' },
        tags: { name },
    });
}

// POST /api/7 — the hot path: every device sanity-checks in on a timer.
// Echoes back the random byte we sent, which doubles as a correctness check.
function sanityCheck(lite) {
    const random = Math.floor(Math.random() * 256);
    const res = post('/api/7', sanityPayload(API_VERSION, lite.id, random), 'sanity');
    sanityLatency.add(res.timings.duration);
    check(res, {
        'sanity: status 200': (r) => r.status === 200,
        'sanity: echoes random': (r) => r.body.split(',')[0] === String(random),
    });
}

// GET /api/9 — resolves an IMSI to [building_id, room_id]. Negative values
// mean the lite is unregistered, which for our fixtures is a failure.
function deviceDetails(lite) {
    const res = getWithBody('/api/9', imsiPayload(API_VERSION, lite.imsi, 0), 'details');
    detailsLatency.add(res.timings.duration);
    check(res, {
        'details: status 200': (r) => r.status === 200,
        'details: resolved room': (r) => (r.json() || [])[0] > 0,
    });
}

// POST /api/2 — write path. No-ops unless the room has an active alert.
function sendImOK(lite) {
    const res = post('/api/2', liteIdPayload(API_VERSION, lite.id), 'imok');
    imokLatency.add(res.timings.duration);
    check(res, { 'imok: status 200': (r) => r.status === 200 });
}

const HANDLERS = {
    sanity: sanityCheck,
    details: deviceDetails,
    imok: sendImOK,
};

export default function () {
    const lite = lites[Math.floor(Math.random() * lites.length)];
    for (const name of SCENARIOS) {
        const handler = HANDLERS[name];
        if (handler) handler(lite);
    }
}
