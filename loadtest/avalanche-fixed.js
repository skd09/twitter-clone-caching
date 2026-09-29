import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 100,
  duration: '25s',
};

export default function () {
  const userId = Math.floor(Math.random() * 5) + 1;  // only 5 keys now
  const res = http.get(`http://127.0.0.1:8000/api/users/${userId}/timeline`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}