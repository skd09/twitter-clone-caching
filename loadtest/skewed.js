import http from 'k6/http';
import { check } from 'k6';

export const options = {
    stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const userId = Math.random() < 0.8 ? Math.floor(Math.random() * 50) + 1 : Math.floor(Math.random() * 9999) + 1;
    const res = http.get(`http://127.0.0.1:8000/api/users/${userId}/timeline`);
    check(res, { 'status is 200': (r) => r.status === 200 });
}