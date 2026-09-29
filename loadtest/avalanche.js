import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '25s',
};

export default function () {
  const userId = Math.floor(Math.random() * 50) + 1;
  const res = http.get(`http://127.0.0.1:8000/api/users/${userId}/timeline`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}